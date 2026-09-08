import { describe, expect, it } from "vitest";
import { measureImage } from "../src/dimensions.js";
import { gif, jpeg, png, webpVp8, webpVp8l, webpVp8x } from "./fixtures.js";

describe("PNG", () => {
  it("reads dimensions from IHDR", () => {
    expect(measureImage(png(3000, 2000))).toMatchObject({
      format: "png",
      width: 3000,
      height: 2000,
      density: null,
    });
  });

  it("converts a pHYs chunk in pixels per metre to DPI", () => {

    const m = measureImage(png(100, 100, { pixelsPerMetre: { x: 11811, y: 11811 } }));
    expect(m?.density?.source).toBe("png-phys");
    expect(m?.density?.x).toBeCloseTo(300, 1);
    expect(m?.density?.y).toBeCloseTo(300, 1);
  });

  it("reports no density when pHYs declares an aspect ratio rather than a physical size", () => {

    const m = measureImage(png(100, 100, { pixelsPerMetre: { x: 1, y: 2 }, physUnit: 0 }));
    expect(m?.density).toBeNull();
  });

  it("reports no density when pHYs declares zero pixels per metre", () => {
    for (const ppm of [
      { x: 0, y: 0 },
      { x: 0, y: 11811 },
      { x: 11811, y: 0 },
    ]) {
      const m = measureImage(png(900, 600, { pixelsPerMetre: ppm, physUnit: 1 }));
      expect(m?.width).toBe(900);
      expect(m?.density).toBeNull();
    }
  });

  it("survives a dimension with the high bit set", () => {

    expect(measureImage(png(0x80000001, 10))?.width).toBe(0x80000001);
  });
});

describe("JPEG", () => {
  it("reads dimensions from SOF0, height before width", () => {

    expect(measureImage(jpeg(1600, 900))).toMatchObject({
      format: "jpeg",
      width: 1600,
      height: 900,
    });
  });

  it("reads JFIF density in dots per inch", () => {
    const m = measureImage(jpeg(10, 10, { jfif: { units: 1, x: 300, y: 300 } }));
    expect(m?.density).toEqual({ x: 300, y: 300, source: "jfif" });
  });

  it("converts JFIF density given in dots per centimetre", () => {
    const m = measureImage(jpeg(10, 10, { jfif: { units: 2, x: 118, y: 118 } }));
    expect(m?.density?.x).toBeCloseTo(299.7, 1);
  });

  it("reports no density when JFIF units are aspect-ratio-only", () => {
    const m = measureImage(jpeg(10, 10, { jfif: { units: 0, x: 1, y: 1 } }));
    expect(m?.density).toBeNull();
  });

  it("walks past segments it does not care about", () => {
    const m = measureImage(jpeg(640, 480, { padSegments: 5 }));
    expect(m).toMatchObject({ width: 640, height: 480 });
  });

  it("reads a progressive frame as well as a baseline one", () => {

    expect(measureImage(jpeg(800, 600, { sofMarker: 0xc2 }))).toMatchObject({
      width: 800,
      height: 600,
    });
  });

  it("does not mistake a table marker for a frame marker", () => {

    const bytes = jpeg(320, 240);
    const withTable = new Uint8Array([
      ...bytes.slice(0, 2),
      0xff, 0xc4, 0x00, 0x06, 0x00, 0x11, 0x22, 0x33,
      ...bytes.slice(2),
    ]);
    expect(measureImage(withTable)).toMatchObject({ width: 320, height: 240 });
  });
});

describe("GIF", () => {
  it("reads little-endian dimensions", () => {
    expect(measureImage(gif(500, 300))).toMatchObject({
      format: "gif",
      width: 500,
      height: 300,
      density: null,
    });
  });

  it("accepts the 87a version as well as 89a", () => {
    expect(measureImage(gif(12, 34, "GIF87a"))?.width).toBe(12);
  });
});

describe("WebP", () => {
  it("reads an extended (VP8X) canvas size", () => {
    expect(measureImage(webpVp8x(2400, 1600))).toMatchObject({
      format: "webp",
      width: 2400,
      height: 1600,
    });
  });

  it("reads a lossy (VP8) frame", () => {
    expect(measureImage(webpVp8(640, 480))).toMatchObject({ width: 640, height: 480 });
  });

  it("reads a lossless (VP8L) frame", () => {
    expect(measureImage(webpVp8l(1024, 768))).toMatchObject({ width: 1024, height: 768 });
  });

  it("handles the 14-bit ceiling on a lossless frame", () => {
    expect(measureImage(webpVp8l(16383, 16383))).toMatchObject({ width: 16383, height: 16383 });
  });
});

describe("refusals", () => {
  it("returns null for a format it does not recognise", () => {
    expect(measureImage(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull();
  });

  it("returns null for an empty buffer", () => {
    expect(measureImage(new Uint8Array(0))).toBeNull();
  });

  it("returns null for a truncated file rather than throwing", () => {

    expect(measureImage(png(100, 100).slice(0, 12))).toBeNull();
  });

  it("returns null for a header that parses to a zero dimension", () => {

    expect(measureImage(png(0, 100))).toBeNull();
  });

  it("returns null for a JPEG with no frame segment", () => {
    expect(measureImage(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
  });

  it("returns null for a RIFF container that is not WebP", () => {
    const wav = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45,
    ]);
    expect(measureImage(wav)).toBeNull();
  });
});
