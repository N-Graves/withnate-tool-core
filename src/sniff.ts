/**
 * Format detection from the first few bytes.
 *
 * Deliberately not from `File.type` or the extension. Both are supplied by
 * whatever wrote the file and both are routinely wrong - a PNG saved as
 * `.jpg` is common enough that trusting the name means handing the bytes to
 * the wrong parser and reporting a corrupt file for one that opens fine
 * everywhere else.
 */

export type ImageFormat = "png" | "jpeg" | "gif" | "webp";

const startsWith = (bytes: Uint8Array, sig: readonly number[], offset = 0): boolean => {
  if (bytes.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i += 1) {
    if (bytes[offset + i] !== sig[i]) return false;
  }
  return true;
};

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
// FF D8 FF covers JFIF, Exif and bare SOI+marker. FF D8 alone is too loose.
const JPEG_SIG = [0xff, 0xd8, 0xff] as const;
const GIF87_SIG = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] as const;
const GIF89_SIG = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] as const;
const RIFF_SIG = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP_SIG = [0x57, 0x45, 0x42, 0x50] as const;

/** The number of leading bytes `sniffFormat` and the measurers ever need. */
export const HEADER_BYTES = 64 * 1024;

export const sniffFormat = (bytes: Uint8Array): ImageFormat | null => {
  if (startsWith(bytes, PNG_SIG)) return "png";
  if (startsWith(bytes, JPEG_SIG)) return "jpeg";
  if (startsWith(bytes, GIF87_SIG) || startsWith(bytes, GIF89_SIG)) return "gif";
  // RIFF is a container, so the WEBP tag four bytes past the size is what
  // separates a WebP from a WAV.
  if (startsWith(bytes, RIFF_SIG) && startsWith(bytes, WEBP_SIG, 8)) return "webp";
  return null;
};
