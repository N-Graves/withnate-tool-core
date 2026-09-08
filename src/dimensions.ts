/**
 * Pixel dimensions and any declared print density, read from the file header.
 *
 * Nothing here decodes an image. Every tool on this site needs width, height
 * and sometimes the declared DPI; none of them need the pixels to answer that,
 * and `createImageBitmap` on a 60 megapixel phone photo costs hundreds of
 * megabytes and a visible stall to learn two integers. Parsing the header is
 * a few hundred bytes of work, runs off the main thread's critical path, and
 * - the reason it is here rather than in a tool - is pure, so it is testable
 * without a browser or a native canvas dependency.
 *
 * Density is read from the container first - PNG `pHYs`, JPEG JFIF - and then
 * from Exif if the container declared nothing. That second step closes a gap
 * this module used to carry and document: cameras and phones write Exif and
 * frequently no JFIF, so a photo straight off a phone reported no density at
 * all and the print-size tool had nothing to explain. The Exif reader arrived
 * with the metadata viewer and was extracted here, which is what it was for.
 */

import { exifResolution, parseExif } from "./exif.js";
import { sniffFormat, type ImageFormat } from "./sniff.js";

export interface Density {
  /** Horizontal pixels per inch as declared by the file. */
  x: number;
  /** Vertical pixels per inch as declared by the file. */
  y: number;
  source: "png-phys" | "jfif" | "exif";
}

export interface Measurement {
  format: ImageFormat;
  width: number;
  height: number;
  /** What the file *claims*. Null when it declares nothing, which is common and not an error. */
  density: Density | null;
}

const MM_PER_INCH = 25.4;
const MM_PER_METRE = 1000;

/** Bounds-checked read. Throws on a truncated file so every caller fails the same way. */
const at = (b: Uint8Array, i: number): number => {
  const v = b[i];
  if (v === undefined) throw new RangeError(`byte ${i} is past the end of the buffer`);
  return v;
};

const be16 = (b: Uint8Array, i: number): number => (at(b, i) << 8) | at(b, i + 1);
const le16 = (b: Uint8Array, i: number): number => at(b, i) | (at(b, i + 1) << 8);
const le24 = (b: Uint8Array, i: number): number =>
  at(b, i) | (at(b, i + 1) << 8) | (at(b, i + 2) << 16);
// `>>> 0` because a PNG dimension with the top bit set would otherwise come
// back negative through JavaScript's signed 32-bit bitwise operators.
const be32 = (b: Uint8Array, i: number): number =>
  ((at(b, i) << 24) | (at(b, i + 1) << 16) | (at(b, i + 2) << 8) | at(b, i + 3)) >>> 0;

const asciiAt = (b: Uint8Array, i: number, s: string): boolean => {
  for (let k = 0; k < s.length; k += 1) {
    if (b[i + k] !== s.charCodeAt(k)) return false;
  }
  return true;
};

// --------------------------------------------------------------------- PNG

const measurePng = (b: Uint8Array): Measurement => {
  // IHDR is required by the spec to be the first chunk, so width and height
  // sit at fixed offsets: 8 signature + 4 length + 4 type = 16.
  const width = be32(b, 16);
  const height = be32(b, 20);

  let density: Density | null = null;
  // Walk the chunk list for pHYs. It is optional and may appear anywhere
  // before IDAT, so this cannot be a fixed offset.
  let p = 8;
  while (p + 8 <= b.length) {
    const len = be32(b, p);
    const type = p + 4;
    if (asciiAt(b, type, "IDAT") || asciiAt(b, type, "IEND")) break;
    if (asciiAt(b, type, "pHYs") && len === 9 && p + 8 + 9 <= b.length) {
      const d = p + 8;
      const unit = at(b, d + 8);
      // unit 1 is metres. unit 0 means the numbers are an aspect ratio only
      // and carry no physical size, so there is no DPI to report.
      if (unit === 1) {
        density = {
          x: (be32(b, d) * MM_PER_INCH) / MM_PER_METRE,
          y: (be32(b, d + 4) * MM_PER_INCH) / MM_PER_METRE,
          source: "png-phys",
        };
      }
      break;
    }
    p += 12 + len; // length + type + data + crc
  }

  return { format: "png", width, height, density };
};

// -------------------------------------------------------------------- JPEG

/** Start-of-frame markers carrying dimensions. C4/C8/CC are tables, not frames. */
const isSof = (m: number): boolean =>
  (m >= 0xc0 && m <= 0xc3) ||
  (m >= 0xc5 && m <= 0xc7) ||
  (m >= 0xc9 && m <= 0xcb) ||
  (m >= 0xcd && m <= 0xcf);

const measureJpeg = (b: Uint8Array): Measurement => {
  let density: Density | null = null;
  let p = 2; // past SOI

  while (p + 4 <= b.length) {
    if (at(b, p) !== 0xff) {
      // Fill bytes are legal between segments; skip them rather than giving up.
      p += 1;
      continue;
    }
    const marker = at(b, p + 1);
    if (marker === 0xff) {
      p += 1;
      continue;
    }
    // Standalone markers carry no length word.
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9) || marker === 0x01) {
      p += 2;
      continue;
    }
    const len = be16(b, p + 2);
    if (len < 2) break;
    const payload = p + 4;

    if (isSof(marker)) {
      // precision(1) height(2) width(2)
      return { format: "jpeg", height: be16(b, payload + 1), width: be16(b, payload + 3), density };
    }

    if (marker === 0xe0 && asciiAt(b, payload, "JFIF\0")) {
      const units = at(b, payload + 7);
      const x = be16(b, payload + 8);
      const y = be16(b, payload + 10);
      // units 0 means "aspect ratio only" - the numbers are real but they are
      // not a density, so reporting them as DPI would be inventing a fact.
      if (units === 1 && x > 0 && y > 0) density = { x, y, source: "jfif" };
      else if (units === 2 && x > 0 && y > 0) {
        density = { x: x * MM_PER_INCH / 10, y: y * MM_PER_INCH / 10, source: "jfif" };
      }
    }

    // SOS is followed by entropy-coded data, not another segment. Every SOF
    // precedes it, so if we are here there was none to find.
    if (marker === 0xda) break;
    p = payload + len - 2;
  }

  throw new RangeError("no start-of-frame segment found");
};

// --------------------------------------------------------------------- GIF

const measureGif = (b: Uint8Array): Measurement => ({
  format: "gif",
  width: le16(b, 6),
  height: le16(b, 8),
  density: null, // GIF has no density field at all.
});

// -------------------------------------------------------------------- WebP

const measureWebp = (b: Uint8Array): Measurement => {
  // 12 bytes of RIFF/size/WEBP, then chunks of [fourcc][size LE32][data].
  const fourcc = String.fromCharCode(at(b, 12), at(b, 13), at(b, 14), at(b, 15));
  const data = 20;

  if (fourcc === "VP8X") {
    // Canvas size is stored minus one, in 24-bit little-endian.
    return {
      format: "webp",
      width: le24(b, data + 4) + 1,
      height: le24(b, data + 7) + 1,
      density: null,
    };
  }
  if (fourcc === "VP8 ") {
    // 3-byte frame tag, 3-byte start code, then 14-bit dimensions.
    return {
      format: "webp",
      width: le16(b, data + 6) & 0x3fff,
      height: le16(b, data + 8) & 0x3fff,
      density: null,
    };
  }
  if (fourcc === "VP8L") {
    // 0x2f signature, then 14 bits width-1 and 14 bits height-1, packed.
    if (at(b, data) !== 0x2f) throw new RangeError("VP8L signature byte missing");
    const bits =
      at(b, data + 1) | (at(b, data + 2) << 8) | (at(b, data + 3) << 16) | (at(b, data + 4) << 24);
    return {
      format: "webp",
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
      density: null,
    };
  }
  throw new RangeError(`unrecognised WebP chunk "${fourcc}"`);
};

// ------------------------------------------------------------------- public

/**
 * Measure an image from its leading bytes.
 *
 * Returns null rather than throwing for anything unreadable - an unsupported
 * format, a truncated file, a header that does not parse. A tool showing "we
 * could not read this file" is a better outcome than an exception the caller
 * has to remember to catch, and there is nothing a caller could do with the
 * distinction between the failure modes anyway.
 */
export const measureImage = (bytes: Uint8Array): Measurement | null => {
  const format = sniffFormat(bytes);
  if (format === null) return null;
  try {
    const m =
      format === "png"
        ? measurePng(bytes)
        : format === "jpeg"
          ? measureJpeg(bytes)
          : format === "gif"
            ? measureGif(bytes)
            : measureWebp(bytes);
    // A zero dimension is not a measurement, it is a parse that went wrong
    // quietly. Refuse it here rather than letting it divide by zero later.
    if (!Number.isFinite(m.width) || !Number.isFinite(m.height) || m.width < 1 || m.height < 1) {
      return null;
    }
    // The container's own declaration wins. Where a file carries both, JFIF
    // and Exif are usually written by different tools at different times and
    // the container field is the one the decoder itself honours.
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
