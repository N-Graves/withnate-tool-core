/**
 * Exif, read from the file header.
 *
 * This lives in the core rather than in the tool that needed it first, because
 * it closes a gap the core itself documented: JPEG print density was read from
 * the JFIF APP0 segment only, and cameras and phones write Exif and frequently
 * no JFIF at all. So a photo straight off a phone reported no declared density
 * and the print-size tool had nothing to explain. Two consumers, a real gap,
 * and a pure byte parser - which is what this module is for.
 *
 * Exif is TIFF wearing a hat. A short container-specific wrapper points at a
 * TIFF header, and from there it is byte order, a chain of image file
 * directories, and twelve-byte entries whose value is either inlined or a
 * pointer. Everything below is that, and nothing else.
 *
 * Returns null rather than throwing for anything unreadable. Metadata is
 * decoration on top of an image that is otherwise perfectly good, and a
 * malformed block should never be the reason a tool refuses a file.
 */

import { sniffFormat } from "./sniff.js";

export interface Rational {
  numerator: number;
  denominator: number;
}

export type ExifValue = number | number[] | string | Rational | Rational[];

/** Which directory a tag came from. Tag numbers repeat across them. */
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
  /** Keyed `ifd:tag`, e.g. `image:271`. */
  byKey: Map<string, ExifEntry>;
}

/** Bytes per component, indexed by TIFF type. Zero marks a type we do not read. */
const TYPE_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8] as const;

const key = (ifd: ExifIfd, tag: number): string => `${ifd}:${tag}`;

// ------------------------------------------------------- finding the block

const ascii = (b: Uint8Array, at: number, s: string): boolean => {
  for (let i = 0; i < s.length; i += 1) if (b[at + i] !== s.charCodeAt(i)) return false;
  return true;
};

const be32 = (b: Uint8Array, i: number): number =>
  ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;
const le32At = (b: Uint8Array, i: number): number =>
  (b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16) | (b[i + 3]! << 24)) >>> 0;

/**
 * Locate the TIFF block inside whatever container it arrived in.
 *
 * JPEG carries it in an APP1 segment prefixed `Exif\0\0`; PNG in an `eXIf`
 * chunk with no prefix at all; WebP in a RIFF chunk named `EXIF`, which some
 * encoders wrongly prefix the same way JPEG does, so that is tolerated.
 */
const findTiffBlock = (bytes: Uint8Array): Uint8Array | null => {
  const format = sniffFormat(bytes);

  if (format === "jpeg") {
    let p = 2;
    while (p + 4 <= bytes.length) {
      if (bytes[p] !== 0xff) {
        p += 1;
        continue;
      }
      const marker = bytes[p + 1]!;
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9) || marker === 0x01) {
        p += 2;
        continue;
      }
      const len = (bytes[p + 2]! << 8) | bytes[p + 3]!;
      if (len < 2) return null;
      if (marker === 0xe1 && ascii(bytes, p + 4, "Exif\0\0")) {
        return bytes.subarray(p + 10, p + 2 + len);
      }
      // Entropy-coded data begins at SOS; every APP segment is behind us.
      if (marker === 0xda) return null;
      p = p + 2 + len;
    }
    return null;
  }

  if (format === "png") {
    let p = 8;
    while (p + 8 <= bytes.length) {
      const len = be32(bytes, p);
      if (ascii(bytes, p + 4, "eXIf")) return bytes.subarray(p + 8, p + 8 + len);
      if (ascii(bytes, p + 4, "IDAT") || ascii(bytes, p + 4, "IEND")) return null;
      p += 12 + len;
    }
    return null;
  }

  if (format === "webp") {
    let p = 12;
    while (p + 8 <= bytes.length) {
      const len = le32At(bytes, p + 4);
      if (ascii(bytes, p, "EXIF")) {
        const start = ascii(bytes, p + 8, "Exif\0\0") ? p + 14 : p + 8;
        return bytes.subarray(start, p + 8 + len);
      }
      p += 8 + len + (len % 2); // RIFF chunks are padded to an even length
    }
    return null;
  }

  return null;
};

// ------------------------------------------------------------- the parser

class Reader {
  constructor(
    private readonly b: Uint8Array,
    private readonly little: boolean,
  ) {}

  u16(i: number): number {
    const a = this.b[i];
    const c = this.b[i + 1];
    if (a === undefined || c === undefined) throw new RangeError("past the end");
    return this.little ? a | (c << 8) : (a << 8) | c;
  }

  u32(i: number): number {
    const v = this.little ? le32At(this.b, i) : be32(this.b, i);
    if (!Number.isFinite(v)) throw new RangeError("past the end");
    return v;
  }

  i32(i: number): number {
    return this.u32(i) | 0;
  }

  byte(i: number): number {
    const v = this.b[i];
    if (v === undefined) throw new RangeError("past the end");
    return v;
  }
}

const readValue = (
  r: Reader,
  block: Uint8Array,
  type: number,
  count: number,
  offset: number,
): ExifValue => {
  if (type === 2) {
    // ASCII, NUL-terminated. Trailing NULs and stray whitespace are common.
    let s = "";
    for (let i = 0; i < count; i += 1) {
      const c = block[offset + i];
      if (c === undefined || c === 0) break;
      s += String.fromCharCode(c);
    }
    return s.trim();
  }

  const one = (i: number): number | Rational => {
    const at = offset + i * TYPE_SIZE[type]!;
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
  // A malformed file can point an IFD at itself. Both guards are needed: the
  // set catches a direct loop, the depth catches a longer cycle.
  if (depth > 4 || seen.has(start) || start + 2 > block.length) return 0;
  seen.add(start);

  const count = r.u16(start);
  let p = start + 2;
  for (let i = 0; i < count; i += 1, p += 12) {
    if (p + 12 > block.length) break;
    const tag = r.u16(p);
    const type = r.u16(p + 2);
    const n = r.u32(p + 4);
    const size = TYPE_SIZE[type] ?? 0;
    if (size === 0 || n === 0) continue;

    const bytesNeeded = size * n;
    // Four bytes or fewer live in the entry itself; anything larger is a
    // pointer, and the offset is from the start of the TIFF header.
    const valueAt = bytesNeeded <= 4 ? p + 8 : r.u32(p + 8);
    if (valueAt + bytesNeeded > block.length) continue;

    if (tag === IFD_EXIF_POINTER || tag === IFD_GPS_POINTER) {
      const target = bytesNeeded <= 4 ? r.u32(p + 8) : valueAt;
      readIfd(
        r,
        block,
        target,
        tag === IFD_EXIF_POINTER ? "exif" : "gps",
        entries,
        seen,
        depth + 1,
      );
      continue;
    }

    try {
      entries.push({ tag, ifd, type, count: n, value: readValue(r, block, type, n, valueAt) });
    } catch {
      // One unreadable entry is not a reason to abandon the rest of them.
    }
  }
  return p + 4 <= block.length ? r.u32(p) : 0;
};

export const parseExif = (bytes: Uint8Array): ExifData | null => {
  try {
    const block = findTiffBlock(bytes);
    if (!block || block.length < 8) return null;

    const order = block[0] === 0x49 && block[1] === 0x49 ? "little" : block[0] === 0x4d && block[1] === 0x4d ? "big" : null;
    if (!order) return null;

    const r = new Reader(block, order === "little");
    // 42 is the TIFF magic. Without it this is not a TIFF header and every
    // offset read afterwards would be noise presented as data.
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

// ---------------------------------------------------------------- accessors

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

/**
 * Declared print density in DPI, or null.
 *
 * ResolutionUnit 2 is inches and 3 is centimetres. **Unit 1 means "no
 * absolute unit"** - the two numbers are an aspect ratio and carry no physical
 * size, so reporting them as DPI would invent a fact the file does not
 * contain. That is the same rule the PNG pHYs and JFIF readers already follow.
 */
export const exifResolution = (data: ExifData): { x: number; y: number } | null => {
  const x = exifNumber(data, "image", TAG_X_RESOLUTION);
  const y = exifNumber(data, "image", TAG_Y_RESOLUTION);
  if (x === null || y === null || x <= 0 || y <= 0) return null;
  const unit = exifNumber(data, "image", TAG_RESOLUTION_UNIT) ?? 2;
  if (unit === 2) return { x, y };
  if (unit === 3) return { x: x * 2.54, y: y * 2.54 };
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

/**
 * Decimal latitude and longitude, or null.
 *
 * The single most consequential thing in a photograph's metadata and the one
 * almost nobody knows is there: a picture taken at home carries the address to
 * within a few metres.
 */
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
