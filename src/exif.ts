import { be32, le32, matchAscii, u8 } from "./bytes.js";
import { sniffFormat } from "./sniff.js";
import { CM_PER_INCH } from "./units.js";

export interface Rational {
  numerator: number;
  denominator: number;
}

export type ExifValue = number | number[] | string | Rational | Rational[];

export type ExifIfd = "image" | "exif" | "gps" | "thumbnail";

export interface ExifEntry {
  tag: number;
  ifd: ExifIfd;
  type: number;
  count: number;
  value: ExifValue;
}

export interface ExifData {
  byteOrder: "little" | "big";
  entries: ExifEntry[];
  byKey: Map<string, ExifEntry>;
}

const TYPE_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8] as const;

const MAX_ENTRIES = 4096;
const MAX_COMPONENTS = 1024;
const MAX_BLOCK_BYTES = 4 * 1024 * 1024;

const key = (ifd: ExifIfd, tag: number): string => `${ifd}:${tag}`;

const findTiffBlock = (bytes: Uint8Array): Uint8Array | null => {
  const format = sniffFormat(bytes);

  if (format === "jpeg") {
    let p = 2;
    while (p + 4 <= bytes.length) {
      if (u8(bytes, p) !== 0xff) {
        p += 1;
        continue;
      }
      const marker = u8(bytes, p + 1);
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9) || marker === 0x01) {
        p += 2;
        continue;
      }
      const len = (u8(bytes, p + 2) << 8) | u8(bytes, p + 3);
      if (len < 2) return null;
      if (marker === 0xe1 && matchAscii(bytes, p + 4, "Exif\0\0")) {
        return bytes.subarray(p + 10, p + 2 + len);
      }
      if (marker === 0xda) return null;
      p = p + 2 + len;
    }
    return null;
  }

  if (format === "png") {
    let p = 8;
    while (p + 8 <= bytes.length) {
      const len = be32(bytes, p);
      if (matchAscii(bytes, p + 4, "eXIf")) return bytes.subarray(p + 8, p + 8 + len);
      if (matchAscii(bytes, p + 4, "IDAT") || matchAscii(bytes, p + 4, "IEND")) return null;
      p += 12 + len;
    }
    return null;
  }

  if (format === "webp") {
    let p = 12;
    while (p + 8 <= bytes.length) {
      const len = le32(bytes, p + 4);
      if (matchAscii(bytes, p, "EXIF")) {
        const start = matchAscii(bytes, p + 8, "Exif\0\0") ? p + 14 : p + 8;
        return bytes.subarray(start, p + 8 + len);
      }
      p += 8 + len + (len % 2);
    }
    return null;
  }

  return null;
};

interface Reader {
  u16: (i: number) => number;
  u32: (i: number) => number;
  i32: (i: number) => number;
  byte: (i: number) => number;
}

const reader = (b: Uint8Array, little: boolean): Reader => ({
  u16: (i) => (little ? u8(b, i) | (u8(b, i + 1) << 8) : (u8(b, i) << 8) | u8(b, i + 1)),
  u32: (i) => (little ? le32(b, i) : be32(b, i)),
  i32: (i) => (little ? le32(b, i) : be32(b, i)) | 0,
  byte: (i) => u8(b, i),
});

const TEXT = new TextDecoder("utf-8", { fatal: false });

const decodeAscii = (block: Uint8Array, offset: number, count: number): string => {
  let end = offset;
  const limit = offset + count;
  while (end < limit && block[end] !== 0) end += 1;
  return TEXT.decode(block.subarray(offset, end))
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
};

const readValue = (
  r: Reader,
  block: Uint8Array,
  type: number,
  count: number,
  offset: number,
): ExifValue => {
  if (type === 2) return decodeAscii(block, offset, count);

  const size = TYPE_SIZE[type]!;
  const one = (i: number): number | Rational => {
    const at = offset + i * size;
    switch (type) {
      case 1:
      case 7:
        return r.byte(at);
      case 3:
        return r.u16(at);
      case 4:
        return r.u32(at);
      case 9:
        return r.i32(at);
      case 5:
        return { numerator: r.u32(at), denominator: r.u32(at + 4) };
      case 10:
        return { numerator: r.i32(at), denominator: r.i32(at + 4) };
      default:
        return 0;
    }
  };

  if (count === 1) return one(0);
  const out: Array<number | Rational> = [];
  for (let i = 0; i < count; i += 1) out.push(one(i));
  return out as ExifValue;
};

const IFD_EXIF_POINTER = 0x8769;
const IFD_GPS_POINTER = 0x8825;

const readIfd = (
  r: Reader,
  block: Uint8Array,
  start: number,
  ifd: ExifIfd,
  entries: ExifEntry[],
  seen: Set<number>,
  depth: number,
): number => {
  if (depth > 4 || seen.has(start) || start + 2 > block.length) return 0;
  seen.add(start);

  const count = r.u16(start);
  let p = start + 2;
  for (let i = 0; i < count; i += 1, p += 12) {
    if (p + 12 > block.length || entries.length >= MAX_ENTRIES) break;
    const tag = r.u16(p);
    const type = r.u16(p + 2);
    const n = r.u32(p + 4);
    const size = TYPE_SIZE[type] ?? 0;
    if (size === 0 || n === 0) continue;

    const bytesNeeded = size * n;
    const valueAt = bytesNeeded <= 4 ? p + 8 : r.u32(p + 8);
    if (valueAt + bytesNeeded > block.length) continue;

    if (tag === IFD_EXIF_POINTER || tag === IFD_GPS_POINTER) {
      const target = bytesNeeded <= 4 ? r.u32(p + 8) : valueAt;
      readIfd(r, block, target, tag === IFD_EXIF_POINTER ? "exif" : "gps", entries, seen, depth + 1);
      continue;
    }

    if (type !== 2 && n > MAX_COMPONENTS) continue;

    try {
      entries.push({ tag, ifd, type, count: n, value: readValue(r, block, type, n, valueAt) });
    } catch {
      continue;
    }
  }
  return p + 4 <= block.length ? r.u32(p) : 0;
};

export const parseExif = (bytes: Uint8Array): ExifData | null => {
  try {
    const block = findTiffBlock(bytes);
    if (!block || block.length < 8 || block.length > MAX_BLOCK_BYTES) return null;

    const order =
      block[0] === 0x49 && block[1] === 0x49
        ? "little"
        : block[0] === 0x4d && block[1] === 0x4d
          ? "big"
          : null;
    if (!order) return null;

    const r = reader(block, order === "little");
    if (r.u16(2) !== 42) return null;

    const entries: ExifEntry[] = [];
    const seen = new Set<number>();
    const next = readIfd(r, block, r.u32(4), "image", entries, seen, 0);
    if (next > 0) readIfd(r, block, next, "thumbnail", entries, seen, 1);

    const byKey = new Map<string, ExifEntry>();
    for (const e of entries) byKey.set(key(e.ifd, e.tag), e);
    return { byteOrder: order, entries, byKey };
  } catch {
    return null;
  }
};

const ratioValue = (v: ExifValue): number | null => {
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "numerator" in v) {
    return v.denominator === 0 ? null : v.numerator / v.denominator;
  }
  return null;
};

export const exifNumber = (data: ExifData, ifd: ExifIfd, tag: number): number | null => {
  const e = data.byKey.get(key(ifd, tag));
  return e ? ratioValue(e.value) : null;
};

export const exifString = (data: ExifData, ifd: ExifIfd, tag: number): string | null => {
  const e = data.byKey.get(key(ifd, tag));
  return e && typeof e.value === "string" && e.value.length > 0 ? e.value : null;
};

const TAG_X_RESOLUTION = 0x011a;
const TAG_Y_RESOLUTION = 0x011b;
const TAG_RESOLUTION_UNIT = 0x0128;

export const exifResolution = (data: ExifData): { x: number; y: number } | null => {
  const x = exifNumber(data, "image", TAG_X_RESOLUTION);
  const y = exifNumber(data, "image", TAG_Y_RESOLUTION);
  if (x === null || y === null || x <= 0 || y <= 0) return null;
  const unit = exifNumber(data, "image", TAG_RESOLUTION_UNIT) ?? 2;
  if (unit === 2) return { x, y };
  if (unit === 3) return { x: x * CM_PER_INCH, y: y * CM_PER_INCH };
  return null;
};

const TAG_GPS_LAT_REF = 0x0001;
const TAG_GPS_LAT = 0x0002;
const TAG_GPS_LON_REF = 0x0003;
const TAG_GPS_LON = 0x0004;

const dmsToDegrees = (v: ExifValue): number | null => {
  if (!Array.isArray(v) || v.length < 3) return null;
  const parts = v.map((p) => ratioValue(p as ExifValue));
  if (parts.some((p) => p === null)) return null;
  const [d, m, s] = parts as number[];
  return d! + m! / 60 + s! / 3600;
};

export const exifGps = (data: ExifData): { latitude: number; longitude: number } | null => {
  const lat = data.byKey.get(key("gps", TAG_GPS_LAT));
  const lon = data.byKey.get(key("gps", TAG_GPS_LON));
  if (!lat || !lon) return null;
  const latDeg = dmsToDegrees(lat.value);
  const lonDeg = dmsToDegrees(lon.value);
  if (latDeg === null || lonDeg === null) return null;
  const latRef = exifString(data, "gps", TAG_GPS_LAT_REF) ?? "N";
  const lonRef = exifString(data, "gps", TAG_GPS_LON_REF) ?? "E";
  return {
    latitude: latRef.toUpperCase().startsWith("S") ? -latDeg : latDeg,
    longitude: lonRef.toUpperCase().startsWith("W") ? -lonDeg : lonDeg,
  };
};
