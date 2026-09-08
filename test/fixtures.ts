const be16 = (n: number): number[] => [(n >>> 8) & 0xff, n & 0xff];
const be32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const le16 = (n: number): number[] => [n & 0xff, (n >>> 8) & 0xff];
const le24 = (n: number): number[] => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff];
const le32 = (n: number): number[] => [...le24(n), (n >>> 24) & 0xff];
const ascii = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));

const CRC = [0, 0, 0, 0];

export interface PngOptions {

  pixelsPerMetre?: { x: number; y: number };

  physUnit?: number;
}

export const png = (w: number, h: number, opts: PngOptions = {}): Uint8Array => {
  const bytes = [
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...be32(13), ...ascii("IHDR"), ...be32(w), ...be32(h), 8, 6, 0, 0, 0, ...CRC,
  ];
  if (opts.pixelsPerMetre) {
    bytes.push(
      ...be32(9), ...ascii("pHYs"),
      ...be32(opts.pixelsPerMetre.x), ...be32(opts.pixelsPerMetre.y),
      opts.physUnit ?? 1,
      ...CRC,
    );
  }
  bytes.push(...be32(0), ...ascii("IEND"), ...CRC);
  return new Uint8Array(bytes);
};

export interface JpegOptions {

  jfif?: { units: number; x: number; y: number };

  sofMarker?: number;

  padSegments?: number;
}

export const jpeg = (w: number, h: number, opts: JpegOptions = {}): Uint8Array => {
  const bytes = [0xff, 0xd8];
  if (opts.jfif) {
    bytes.push(
      0xff, 0xe0, ...be16(16), ...ascii("JFIF"), 0,
      1, 2, opts.jfif.units, ...be16(opts.jfif.x), ...be16(opts.jfif.y), 0, 0,
    );
  }
  for (let i = 0; i < (opts.padSegments ?? 0); i += 1) {

    bytes.push(0xff, 0xfe, ...be16(6), 0, 0, 0, 0);
  }
  bytes.push(
    0xff, opts.sofMarker ?? 0xc0, ...be16(17),
    8, ...be16(h), ...be16(w), 3,
    1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
  );
  bytes.push(0xff, 0xd9);
  return new Uint8Array(bytes);
};

export const gif = (w: number, h: number, version = "GIF89a"): Uint8Array =>
  new Uint8Array([...ascii(version), ...le16(w), ...le16(h), 0xf7, 0, 0]);

const riff = (chunkId: string, chunkData: number[]): Uint8Array => {
  const body = [...ascii("WEBP"), ...ascii(chunkId), ...le32(chunkData.length), ...chunkData];
  return new Uint8Array([...ascii("RIFF"), ...le32(body.length), ...body]);
};

export const webpVp8x = (w: number, h: number): Uint8Array =>
  riff("VP8X", [0x10, 0, 0, 0, ...le24(w - 1), ...le24(h - 1)]);

export const webpVp8 = (w: number, h: number): Uint8Array =>
  riff("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(w), ...le16(h)]);

export const webpVp8l = (w: number, h: number): Uint8Array => {
  const packed = ((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14);
  return riff("VP8L", [0x2f, ...le32(packed)]);
};
