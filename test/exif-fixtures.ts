/**
 * Exif blocks assembled byte by byte.
 *
 * Built rather than checked in, for the same reason as the header fixtures:
 * every byte a test depends on is visible in the diff, and a builder can set a
 * byte order, a resolution unit or a value that overflows the inline four
 * bytes - none of which any camera on this machine would produce on demand.
 */

export interface Rat {
  n: number;
  d: number;
}

export interface Entry {
  tag: number;
  /** 2 ASCII, 3 SHORT, 4 LONG, 5 RATIONAL. */
  type: number;
  value: string | number | number[] | Rat | Rat[];
}

export const rat = (n: number, d = 1): Rat => ({ n, d });

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

const componentsOf = (e: Entry): number => {
  if (typeof e.value === "string") return e.value.length + 1; // NUL terminated
  if (Array.isArray(e.value)) return e.value.length;
  return 1;
};

class Buf {
  bytes: number[] = [];
  constructor(readonly little: boolean) {}

  u16(v: number): void {
    this.bytes.push(this.little ? v & 0xff : (v >> 8) & 0xff, this.little ? (v >> 8) & 0xff : v & 0xff);
  }

  u32(v: number): void {
    const b = [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
    this.bytes.push(...(this.little ? b : b.reverse()));
  }

  raw(...v: number[]): void {
    this.bytes.push(...v);
  }
}

const encodeValue = (e: Entry, little: boolean): number[] => {
  const b = new Buf(little);
  if (typeof e.value === "string") {
    for (const c of e.value) b.raw(c.charCodeAt(0));
    b.raw(0);
    return b.bytes;
  }
  const list = Array.isArray(e.value) ? e.value : [e.value];
  for (const v of list) {
    if (typeof v === "number") {
      if (e.type === 3) b.u16(v);
      else if (e.type === 1 || e.type === 7) b.raw(v & 0xff);
      else b.u32(v);
    } else {
      b.u32(v.n);
      b.u32(v.d);
    }
  }
  return b.bytes;
};

export interface TiffOptions {
  little?: boolean;
  image?: Entry[];
  exif?: Entry[];
  gps?: Entry[];
  /** Deliberately break the TIFF magic, to prove it is checked. */
  badMagic?: boolean;
}

const IFD_EXIF_POINTER = 0x8769;
const IFD_GPS_POINTER = 0x8825;

/**
 * A real TIFF block: header, IFD0, optional Exif and GPS sub-directories, and
 * an overflow area for every value too big to sit inside its own entry.
 */
export const buildTiff = (opts: TiffOptions = {}): Uint8Array => {
  const little = opts.little ?? true;
  const image = [...(opts.image ?? [])];

  // Sub-directories are laid out first so their offsets are known before IFD0
  // is written. Their contents cannot overflow in these fixtures.
  const subs: Array<{ tag: number; entries: Entry[]; offset: number }> = [];
  let cursor = 8; // header is 8 bytes; IFD0 starts here
  const ifd0Count = image.length + (opts.exif ? 1 : 0) + (opts.gps ? 1 : 0);
  cursor += 2 + ifd0Count * 12 + 4;

  const overflow: number[] = [];
  const pushOverflow = (data: number[]): number => {
    const at = cursor + overflow.length;
    overflow.push(...data);
    if (overflow.length % 2 === 1) overflow.push(0); // keep offsets even
    return at;
  };

  for (const [tag, entries] of [
    [IFD_EXIF_POINTER, opts.exif],
    [IFD_GPS_POINTER, opts.gps],
  ] as const) {
    if (!entries) continue;
    const b = new Buf(little);
    b.u16(entries.length);
    const inner: number[] = [];
    const base = cursor + overflow.length;
    const bodyLength = 2 + entries.length * 12 + 4;
    for (const e of entries) {
      const data = encodeValue(e, little);
      b.u16(e.tag);
      b.u16(e.type);
      b.u32(componentsOf(e));
      if (data.length <= 4) {
        b.raw(...data, ...new Array(4 - data.length).fill(0));
      } else {
        b.u32(base + bodyLength + inner.length);
        inner.push(...data);
      }
    }
    b.u32(0);
    subs.push({ tag, entries, offset: pushOverflow([...b.bytes, ...inner]) });
  }

  const head = new Buf(little);
  head.raw(little ? 0x49 : 0x4d, little ? 0x49 : 0x4d);
  head.u16(opts.badMagic ? 1234 : 42);
  head.u32(8);

  const ifd = new Buf(little);
  ifd.u16(ifd0Count);
  for (const e of image) {
    const data = encodeValue(e, little);
    ifd.u16(e.tag);
    ifd.u16(e.type);
    ifd.u32(componentsOf(e));
    if (data.length <= 4) ifd.raw(...data, ...new Array(4 - data.length).fill(0));
    else ifd.u32(pushOverflow(data));
  }
  for (const s of subs) {
    ifd.u16(s.tag);
    ifd.u16(4);
    ifd.u32(1);
    ifd.u32(s.offset);
  }
  ifd.u32(0); // no thumbnail IFD

  return new Uint8Array([...head.bytes, ...ifd.bytes, ...overflow]);
};

const be16 = (n: number): number[] => [(n >> 8) & 0xff, n & 0xff];
const be32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const a = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));

/** A JPEG carrying an Exif APP1, and optionally a JFIF APP0 as well. */
export const jpegWithExif = (
  tiff: Uint8Array,
  opts: { width?: number; height?: number; jfif?: { units: number; x: number; y: number } } = {},
): Uint8Array => {
  const w = opts.width ?? 640;
  const h = opts.height ?? 480;
  const bytes: number[] = [0xff, 0xd8];
  if (opts.jfif) {
    bytes.push(
      0xff, 0xe0, ...be16(16), ...a("JFIF"), 0,
      1, 2, opts.jfif.units, ...be16(opts.jfif.x), ...be16(opts.jfif.y), 0, 0,
    );
  }
  const payload = [...a("Exif"), 0, 0, ...tiff];
  bytes.push(0xff, 0xe1, ...be16(payload.length + 2), ...payload);
  bytes.push(0xff, 0xc0, ...be16(17), 8, ...be16(h), ...be16(w), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1);
  bytes.push(0xff, 0xd9);
  return new Uint8Array(bytes);
};

/** A PNG carrying an eXIf chunk, which unlike JPEG has no Exif prefix. */
export const pngWithExif = (tiff: Uint8Array, w = 640, h = 480): Uint8Array =>
  new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...be32(13), ...a("IHDR"), ...be32(w), ...be32(h), 8, 6, 0, 0, 0, 0, 0, 0, 0,
    ...be32(tiff.length), ...a("eXIf"), ...tiff, 0, 0, 0, 0,
    ...be32(0), ...a("IEND"), 0, 0, 0, 0,
  ]);
