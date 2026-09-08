import { describe, expect, it } from "vitest";
import { sniffFormat } from "../src/sniff.js";
import { gif, jpeg, png, webpVp8x } from "./fixtures.js";

describe("sniffFormat", () => {
  it("recognises each supported format from its signature", () => {
    expect(sniffFormat(png(1, 1))).toBe("png");
    expect(sniffFormat(jpeg(1, 1))).toBe("jpeg");
    expect(sniffFormat(gif(1, 1))).toBe("gif");
    expect(sniffFormat(webpVp8x(1, 1))).toBe("webp");
  });

  it("ignores the name and reads the bytes", () => {
    // The whole reason this function exists. A PNG saved as .jpg is common,
    // and trusting File.type would hand it to the JPEG parser, which would
    // report a corrupt file for one that opens fine everywhere else.
    const bytes = png(50, 60);
    expect(sniffFormat(bytes)).toBe("png");
  });

  it("does not accept a RIFF container that is not WebP", () => {
    const wav = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x08, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
    ]);
    expect(sniffFormat(wav)).toBeNull();
  });

  it("requires the third byte of a JPEG signature", () => {
    // FF D8 alone matches too much. FF D8 FF is the marker that actually
    // starts a JPEG stream.
    expect(sniffFormat(new Uint8Array([0xff, 0xd8, 0x00]))).toBeNull();
    expect(sniffFormat(new Uint8Array([0xff, 0xd8, 0xff]))).toBe("jpeg");
  });

  it("returns null rather than throwing on a buffer shorter than any signature", () => {
    expect(sniffFormat(new Uint8Array([0x89]))).toBeNull();
    expect(sniffFormat(new Uint8Array(0))).toBeNull();
  });

  it("returns null for a format it does not support", () => {
    expect(sniffFormat(new Uint8Array([0x42, 0x4d]))).toBeNull(); // BMP
    expect(sniffFormat(new Uint8Array([0x49, 0x49, 0x2a, 0x00]))).toBeNull(); // TIFF
  });
});
