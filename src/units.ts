export const MM_PER_INCH = 25.4;
export const CM_PER_INCH = MM_PER_INCH / 10;
export const MM_PER_METRE = 1000;

export const inchesToMm = (inches: number): number => inches * MM_PER_INCH;
export const mmToInches = (mm: number): number => mm / MM_PER_INCH;
export const inchesToCm = (inches: number): number => inches * CM_PER_INCH;
export const cmToInches = (cm: number): number => cm / CM_PER_INCH;

export const pxToInches = (px: number, dpi: number): number => px / dpi;
export const dpiFor = (px: number, inches: number): number => px / inches;

export const roundTo = (value: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
};

export type LengthUnit = "in" | "mm" | "cm";

const PRECISION: Record<LengthUnit, number> = { in: 1, mm: 0, cm: 1 };

export const convertFromInches = (inches: number, unit: LengthUnit): number =>
  unit === "in" ? inches : unit === "mm" ? inchesToMm(inches) : inchesToCm(inches);

export const formatLength = (inches: number, unit: LengthUnit): string =>
  `${roundTo(convertFromInches(inches, unit), PRECISION[unit])}${unit === "in" ? '"' : ` ${unit}`}`;

export const formatSize = (wIn: number, hIn: number, unit: LengthUnit): string => {
  const dp = PRECISION[unit];
  const w = roundTo(convertFromInches(wIn, unit), dp);
  const h = roundTo(convertFromInches(hIn, unit), dp);
  return unit === "in" ? `${w} × ${h}"` : `${w} × ${h} ${unit}`;
};

export const formatBytes = (n: number): string => {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1000) return `${Math.round(n)} B`;
  const kb = Math.round(n / 1000);
  if (kb < 1000) return `${kb} KB`;
  return `${roundTo(n / 1e6, 1)} MB`;
};

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

export const aspectRatio = (width: number, height: number): [number, number] => {
  const w = Math.round(width);
  const h = Math.round(height);
  const g = gcd(Math.max(w, h), Math.min(w, h)) || 1;
  return [w / g, h / g];
};
