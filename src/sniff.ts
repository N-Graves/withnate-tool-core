import { matchBytes } from "./bytes.js";

export type ImageFormat = "png" | "jpeg" | "gif" | "webp";

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const JPEG_SIG = [0xff, 0xd8, 0xff] as const;
const GIF87_SIG = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] as const;
const GIF89_SIG = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] as const;
const RIFF_SIG = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP_SIG = [0x57, 0x45, 0x42, 0x50] as const;

export const HEADER_BYTES = 64 * 1024;

export const sniffFormat = (bytes: Uint8Array): ImageFormat | null => {
  if (matchBytes(bytes, PNG_SIG)) return "png";
  if (matchBytes(bytes, JPEG_SIG)) return "jpeg";
  if (matchBytes(bytes, GIF87_SIG) || matchBytes(bytes, GIF89_SIG)) return "gif";
  if (matchBytes(bytes, RIFF_SIG) && matchBytes(bytes, WEBP_SIG, 8)) return "webp";
  return null;
};
