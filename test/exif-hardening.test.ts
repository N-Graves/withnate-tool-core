import { describe, expect, it } from "vitest";
import { exifString, parseExif } from "../src/exif.js";
import { buildTiff, jpegWithExif, type Entry } from "./exif-fixtures.js";

const MAKE = 0x010f;
const MODEL = 0x0110;

const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);
const CONTROL = /[\u0000-\u001f\u007f]/;

const parse = (image: Entry[]) => parseExif(jpegWithExif(buildTiff({ image })));

describe("exif hardening", () => {
  it("strips control characters out of ascii fields", () => {
    const hostile = `Cam${ESC}[31mera${BEL} Co`;
    const d = parse([{ tag: MAKE, type: 2, value: hostile }]);
    const got = exifString(d!, "image", MAKE);
    expect(got).toBe("Cam[31mera Co");
    expect(CONTROL.test(got!)).toBe(false);
  });

  it("keeps a plain ascii field byte for byte", () => {
    const d = parse([{ tag: MAKE, type: 2, value: "Fictional Camera Co" }]);
    expect(exifString(d!, "image", MAKE)).toBe("Fictional Camera Co");
  });

  it("decodes a utf-8 name that a phone wrote into an ascii field", () => {
    const utf8 = [...new TextEncoder().encode("Nikon Café")]
      .map((b) => String.fromCharCode(b))
      .join("");
    const d = parse([{ tag: MAKE, type: 2, value: utf8 }]);
    expect(exifString(d!, "image", MAKE)).toBe("Nikon Café");
  });

  it("skips an entry claiming more components than the cap allows", () => {
    const huge = Array.from({ length: 2000 }, (_, i) => i & 0xffff);
    const d = parse([
      { tag: MAKE, type: 2, value: "Fictional Camera Co" },
      { tag: MODEL, type: 3, value: huge },
    ]);
    expect(d).not.toBeNull();
    expect(d!.byKey.has(`image:${MODEL}`)).toBe(false);
    expect(exifString(d!, "image", MAKE)).toBe("Fictional Camera Co");
  });

  it("still reads an array that sits under the cap", () => {
    const ok = Array.from({ length: 64 }, (_, i) => i);
    const d = parse([{ tag: MODEL, type: 3, value: ok }]);
    expect(d!.byKey.get(`image:${MODEL}`)!.value).toHaveLength(64);
  });

  it("caps the total entry count rather than accepting an unbounded directory", () => {
    const many: Entry[] = Array.from({ length: 5000 }, (_, i) => ({
      tag: 0xa000 + (i % 0x0fff),
      type: 3,
      value: i & 0xffff,
    }));
    const d = parse(many);
    expect(d).not.toBeNull();
    expect(d!.entries.length).toBeLessThanOrEqual(4096);
  });

  it("never throws on a block truncated part way through", () => {
    const whole = jpegWithExif(buildTiff({ image: [{ tag: MAKE, type: 2, value: "Cam" }] }));
    for (let cut = 2; cut < whole.length; cut += 3) {
      expect(() => parseExif(whole.subarray(0, cut))).not.toThrow();
    }
  });
});
