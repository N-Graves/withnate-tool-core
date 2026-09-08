import { be16, be32, le16, le24, matchAscii, u8 } from "./bytes.js";
import { exifResolution, parseExif } from "./exif.js";
import { sniffFormat, type ImageFormat } from "./sniff.js";
import { CM_PER_INCH, MM_PER_INCH, MM_PER_METRE } from "./units.js";

export interface Density {
  x: number;
  y: number;
  source: "png-phys" | "jfif" | "exif";
}

export interface Measurement {
  format: ImageFormat;
  width: number;
  height: number;
  density: Density | null;
}

const measurePng = (b: Uint8Array): Measurement => {
  const width = be32(b, 16);
  const height = be32(b, 20);

  let density: Density | null = null;
  let p = 8;
  while (p + 8 <= b.length) {
    const len = be32(b, p);
    const type = p + 4;
    if (matchAscii(b, type, "IDAT") || matchAscii(b, type, "IEND")) break;
    if (matchAscii(b, type, "pHYs") && len === 9 && p + 8 + 9 <= b.length) {
      const d = p + 8;
      if (u8(b, d + 8) === 1) {
        density = {
          x: (be32(b, d) * MM_PER_INCH) / MM_PER_METRE,
          y: (be32(b, d + 4) * MM_PER_INCH) / MM_PER_METRE,
          source: "png-phys",
        };
      }
      break;
    }
    p += 12 + len;
  }

  return { format: "png", width, height, density };
};

const isSof = (m: number): boolean =>
  (m >= 0xc0 && m <= 0xc3) ||
  (m >= 0xc5 && m <= 0xc7) ||
  (m >= 0xc9 && m <= 0xcb) ||
  (m >= 0xcd && m <= 0xcf);

const measureJpeg = (b: Uint8Array): Measurement => {
  let density: Density | null = null;
  let p = 2;

  while (p + 4 <= b.length) {
    if (u8(b, p) !== 0xff) {
      p += 1;
      continue;
    }
    const marker = u8(b, p + 1);
    if (marker === 0xff) {
      p += 1;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9) || marker === 0x01) {
      p += 2;
      continue;
    }
    const len = be16(b, p + 2);
    if (len < 2) break;
    const payload = p + 4;

    if (isSof(marker)) {
      return { format: "jpeg", height: be16(b, payload + 1), width: be16(b, payload + 3), density };
    }

    if (marker === 0xe0 && matchAscii(b, payload, "JFIF\0")) {
      const units = u8(b, payload + 7);
      const x = be16(b, payload + 8);
      const y = be16(b, payload + 10);
      if (x > 0 && y > 0) {
        if (units === 1) density = { x, y, source: "jfif" };
        else if (units === 2) {
          density = { x: x * CM_PER_INCH, y: y * CM_PER_INCH, source: "jfif" };
        }
      }
    }

    if (marker === 0xda) break;
    p = payload + len - 2;
  }

  throw new RangeError("no start-of-frame segment found");
};

const measureGif = (b: Uint8Array): Measurement => ({
  format: "gif",
  width: le16(b, 6),
  height: le16(b, 8),
  density: null,
});

const measureWebp = (b: Uint8Array): Measurement => {
  const fourcc = String.fromCharCode(u8(b, 12), u8(b, 13), u8(b, 14), u8(b, 15));
  const data = 20;

  if (fourcc === "VP8X") {
    return {
      format: "webp",
      width: le24(b, data + 4) + 1,
      height: le24(b, data + 7) + 1,
      density: null,
    };
  }
  if (fourcc === "VP8 ") {
    return {
      format: "webp",
      width: le16(b, data + 6) & 0x3fff,
      height: le16(b, data + 8) & 0x3fff,
      density: null,
    };
  }
  if (fourcc === "VP8L") {
    if (u8(b, data) !== 0x2f) throw new RangeError("VP8L signature byte missing");
    const bits =
      u8(b, data + 1) | (u8(b, data + 2) << 8) | (u8(b, data + 3) << 16) | (u8(b, data + 4) << 24);
    return {
      format: "webp",
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
      density: null,
    };
  }
  throw new RangeError(`unrecognised WebP chunk "${fourcc}"`);
};

const MEASURERS: Record<ImageFormat, (b: Uint8Array) => Measurement> = {
  png: measurePng,
  jpeg: measureJpeg,
  gif: measureGif,
  webp: measureWebp,
};

export const measureImage = (bytes: Uint8Array): Measurement | null => {
  const format = sniffFormat(bytes);
  if (format === null) return null;
  try {
    const m = MEASURERS[format](bytes);
    if (!Number.isFinite(m.width) || !Number.isFinite(m.height) || m.width < 1 || m.height < 1) {
      return null;
    }
    if (m.density === null) {
      const exif = parseExif(bytes);
      const res = exif ? exifResolution(exif) : null;
      if (res) m.density = { x: res.x, y: res.y, source: "exif" };
    }
    return m;
  } catch {
    return null;
  }
};
