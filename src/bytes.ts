export const u8 = (b: Uint8Array, i: number): number => {
  const v = b[i];
  if (v === undefined) throw new RangeError(`byte ${i} is past the end of the buffer`);
  return v;
};

export const be16 = (b: Uint8Array, i: number): number => (u8(b, i) << 8) | u8(b, i + 1);

export const le16 = (b: Uint8Array, i: number): number => u8(b, i) | (u8(b, i + 1) << 8);

export const le24 = (b: Uint8Array, i: number): number =>
  u8(b, i) | (u8(b, i + 1) << 8) | (u8(b, i + 2) << 16);

export const be32 = (b: Uint8Array, i: number): number =>
  ((u8(b, i) << 24) | (u8(b, i + 1) << 16) | (u8(b, i + 2) << 8) | u8(b, i + 3)) >>> 0;

export const le32 = (b: Uint8Array, i: number): number =>
  (u8(b, i) | (u8(b, i + 1) << 8) | (u8(b, i + 2) << 16) | (u8(b, i + 3) << 24)) >>> 0;

export const matchBytes = (b: Uint8Array, sig: readonly number[], offset = 0): boolean => {
  if (b.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i += 1) {
    if (b[offset + i] !== sig[i]) return false;
  }
  return true;
};

export const matchAscii = (b: Uint8Array, offset: number, s: string): boolean => {
  if (b.length < offset + s.length) return false;
  for (let i = 0; i < s.length; i += 1) {
    if (b[offset + i] !== s.charCodeAt(i)) return false;
  }
  return true;
};
