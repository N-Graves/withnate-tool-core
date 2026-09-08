/**
 * Unit arithmetic, in one place so the conversion constant appears once.
 *
 * Inches are the internal unit throughout. Not because the audience thinks in
 * inches - UK framing is a mix of A-series millimetres and imperial photo
 * sizes - but because DPI is defined per inch, so every other choice puts a
 * conversion inside the density maths where it is easiest to get wrong.
 */

export const MM_PER_INCH = 25.4;

export const inchesToMm = (inches: number): number => inches * MM_PER_INCH;
export const mmToInches = (mm: number): number => mm / MM_PER_INCH;
export const inchesToCm = (inches: number): number => (inches * MM_PER_INCH) / 10;
export const cmToInches = (cm: number): number => (cm * 10) / MM_PER_INCH;

/** Physical size of a pixel count at a given density. */
export const pxToInches = (px: number, dpi: number): number => px / dpi;

/** The density a pixel count would land at if printed to a given size. */
export const dpiFor = (px: number, inches: number): number => px / inches;

export const roundTo = (value: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
};

export type LengthUnit = "in" | "mm" | "cm";

/** Sensible precision per unit: a tenth of an inch, a whole millimetre. */
const PRECISION: Record<LengthUnit, number> = { in: 1, mm: 0, cm: 1 };

export const convertFromInches = (inches: number, unit: LengthUnit): number =>
  unit === "in" ? inches : unit === "mm" ? inchesToMm(inches) : inchesToCm(inches);

export const formatLength = (inches: number, unit: LengthUnit): string =>
  `${roundTo(convertFromInches(inches, unit), PRECISION[unit])}${unit === "in" ? '"' : ` ${unit}`}`;

/** `12 x 16"` / `305 x 406 mm`, with one unit label rather than two. */
export const formatSize = (wIn: number, hIn: number, unit: LengthUnit): string => {
  const dp = PRECISION[unit];
  const w = roundTo(convertFromInches(wIn, unit), dp);
  const h = roundTo(convertFromInches(hIn, unit), dp);
  return unit === "in" ? `${w} × ${h}"` : `${w} × ${h} ${unit}`;
};

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/**
 * Exact integer aspect ratio, reduced. `3000x2000` becomes `3:2`.
 *
 * Only useful when it reduces to something small - a 4032x3024 phone photo
 * gives a clean 4:3, but an arbitrary crop gives something like 1493:997,
 * which is true and useless. Callers decide what to do with a large result;
 * this function does not lie about it by rounding.
 */
export const aspectRatio = (width: number, height: number): [number, number] => {
  const w = Math.round(width);
  const h = Math.round(height);
  const g = gcd(Math.max(w, h), Math.min(w, h)) || 1;
  return [w / g, h / g];
};
