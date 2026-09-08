import { describe, expect, it } from "vitest";
import {
  aspectRatio,
  cmToInches,
  dpiFor,
  formatLength,
  formatSize,
  inchesToCm,
  inchesToMm,
  mmToInches,
  pxToInches,
  roundTo,
} from "../src/units.js";

describe("conversion", () => {
  it("uses the exact inch, not an approximation", () => {
    expect(inchesToMm(1)).toBe(25.4);
    expect(inchesToCm(1)).toBe(2.54);
  });

  it("round-trips through every unit", () => {
    expect(mmToInches(inchesToMm(7.5))).toBeCloseTo(7.5, 10);
    expect(cmToInches(inchesToCm(7.5))).toBeCloseTo(7.5, 10);
  });

  it("agrees with the A-series definition", () => {
    // A4 is 210 x 297 mm by definition, so this is a fixed external check
    // rather than a restatement of the implementation.
    expect(mmToInches(210)).toBeCloseTo(8.268, 3);
    expect(mmToInches(297)).toBeCloseTo(11.693, 3);
  });
});

describe("density", () => {
  it("converts a pixel count to a physical size", () => {
    expect(pxToInches(3600, 300)).toBe(12);
  });

  it("reports the density a pixel count lands at for a given size", () => {
    expect(dpiFor(3600, 12)).toBe(300);
  });

  it("is the inverse of itself", () => {
    expect(dpiFor(4500, pxToInches(4500, 216))).toBeCloseTo(216, 10);
  });
});

describe("formatting", () => {
  it("labels inches with a quote and metric with a unit", () => {
    expect(formatLength(12, "in")).toBe('12"');
    expect(formatLength(12, "mm")).toBe("305 mm");
    expect(formatLength(12, "cm")).toBe("30.5 cm");
  });

  it("gives a size one unit label, not two", () => {
    expect(formatSize(12, 16, "in")).toBe('12 × 16"');
    expect(formatSize(12, 16, "mm")).toBe("305 × 406 mm");
  });

  it("rounds millimetres to whole numbers and inches to a tenth", () => {
    // A tenth of an inch is 2.5mm, which is a visible amount on a mount
    // border, so inches need the decimal. Tenths of a millimetre do not
    // survive contact with a real frame.
    expect(formatLength(8.2677, "in")).toBe('8.3"');
    expect(formatLength(8.2677, "mm")).toBe("210 mm");
  });

  it("rounds half away from zero, not to even", () => {
    expect(roundTo(2.5, 0)).toBe(3);
    expect(roundTo(1.25, 1)).toBe(1.3);
  });
});

describe("aspectRatio", () => {
  it("reduces a common photo ratio", () => {
    expect(aspectRatio(3000, 2000)).toEqual([3, 2]);
    expect(aspectRatio(4032, 3024)).toEqual([4, 3]);
    expect(aspectRatio(1920, 1080)).toEqual([16, 9]);
  });

  it("handles portrait as well as landscape", () => {
    expect(aspectRatio(2000, 3000)).toEqual([2, 3]);
  });

  it("returns 1:1 for a square", () => {
    expect(aspectRatio(800, 800)).toEqual([1, 1]);
  });

  it("returns the true ratio for an arbitrary crop rather than rounding to a lie", () => {
    // 1493:997 is useless to a person, and that is the caller's problem to
    // present. Rounding it here to "about 3:2" would be a different number
    // presented as the same one.
    expect(aspectRatio(1493, 997)).toEqual([1493, 997]);
  });
});
