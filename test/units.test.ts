import { describe, expect, it } from "vitest";
import {
  aspectRatio,
  cmToInches,
  dpiFor,
  formatBytes,
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

    expect(aspectRatio(1493, 997)).toEqual([1493, 997]);
  });
});

describe("formatBytes", () => {
  it("reads in decimal, so a megabyte is a million bytes", () => {
    expect(formatBytes(1_000_000)).toBe("1 MB");
    expect(formatBytes(13_213_000)).toBe("13.2 MB");
  });

  it("does not agree with the binary reading, which is the whole reason it exists", () => {

    expect(formatBytes(13_213_000)).not.toBe("12MB");
  });

  it("shows plain bytes below a kilobyte, because a tiny file is not 0 KB", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(812)).toBe("812 B");
    expect(formatBytes(999)).toBe("999 B");
  });

  it("chooses the tier from the rounded value, so nothing formats as 1000 KB", () => {

    expect(formatBytes(999_500)).toBe("1 MB");
    expect(formatBytes(999_000)).toBe("999 KB");
  });

  it("keeps megabytes to one decimal and kilobytes to none", () => {
    expect(formatBytes(2_400_000)).toBe("2.4 MB");
    expect(formatBytes(310_400)).toBe("310 KB");
  });

  it("stays in megabytes past a gigabyte, so an absurd number reads as absurd", () => {

    expect(formatBytes(1_500_000_000)).toBe("1500 MB");
  });

  it("refuses to render a number that is not a size", () => {
    expect(formatBytes(Number.NaN)).toBe("—");
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("—");
    expect(formatBytes(-1)).toBe("—");
  });

  it("is monotonic across both tier boundaries", () => {

    const sizes = [0, 999, 1000, 1001, 999_499, 999_500, 1_000_000, 9_999_999];
    const parsed = sizes.map((n) => {
      const s = formatBytes(n);
      const value = Number.parseFloat(s);
      const unit = s.endsWith("MB") ? 1e6 : s.endsWith("KB") ? 1e3 : 1;
      return value * unit;
    });
    for (let i = 1; i < parsed.length; i += 1) {
      expect(parsed[i]!).toBeGreaterThanOrEqual(parsed[i - 1]!);
    }
  });
});
