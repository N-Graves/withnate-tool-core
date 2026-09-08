import { describe, expect, it } from "vitest";
import { measureImage } from "../src/dimensions.js";
import { exifGps, exifNumber, exifResolution, exifString, parseExif } from "../src/exif.js";
import { buildTiff, jpegWithExif, pngWithExif, rat, type Entry } from "./exif-fixtures.js";

const MAKE = 0x010f;
const MODEL = 0x0110;
const X_RES = 0x011a;
const Y_RES = 0x011b;
const RES_UNIT = 0x0128;
const ORIENTATION = 0x0112;
const ISO = 0x8827;
const GPS_LAT_REF = 0x0001;
const GPS_LAT = 0x0002;
const GPS_LON_REF = 0x0003;
const GPS_LON = 0x0004;

const camera: Entry[] = [
  { tag: MAKE, type: 2, value: "Fictional Camera Co" },
  { tag: MODEL, type: 2, value: "FC-1" },
  { tag: ORIENTATION, type: 3, value: 1 },
];

describe("parseExif", () => {
  it("reads a JPEG APP1 block", () => {
    const d = parseExif(jpegWithExif(buildTiff({ image: camera })));
    expect(exifString(d!, "image", MAKE)).toBe("Fictional Camera Co");
    expect(exifString(d!, "image", MODEL)).toBe("FC-1");
  });

  it("reads a PNG eXIf chunk, which carries no Exif prefix", () => {
    const d = parseExif(pngWithExif(buildTiff({ image: camera })));
    expect(exifString(d!, "image", MAKE)).toBe("Fictional Camera Co");
  });

  it("gives the same answer in both byte orders", () => {
    // Motorola order is rare in the wild and entirely legal, so a reader that
    // only handles Intel order works until the day it does not.
    const little = parseExif(jpegWithExif(buildTiff({ image: camera, little: true })));
    const big = parseExif(jpegWithExif(buildTiff({ image: camera, little: false })));
    expect(little!.byteOrder).toBe("little");
    expect(big!.byteOrder).toBe("big");
    expect(exifString(big!, "image", MAKE)).toBe(exifString(little!, "image", MAKE));
  });

  it("handles a value that fits inline and one that does not", () => {
    // Four bytes or fewer live in the entry; anything larger is a pointer.
    // Getting that boundary wrong reads an offset as a value, or the reverse,
    // and returns confident nonsense either way.
    const d = parseExif(
      jpegWithExif(
        buildTiff({
          image: [
            { tag: ORIENTATION, type: 3, value: 6 }, // 2 bytes, inline
            { tag: MAKE, type: 2, value: "A very long manufacturer name" }, // pointer
          ],
        }),
      ),
    );
    expect(exifNumber(d!, "image", ORIENTATION)).toBe(6);
    expect(exifString(d!, "image", MAKE)).toBe("A very long manufacturer name");
  });

  it("follows the Exif sub-directory pointer", () => {
    const d = parseExif(
      jpegWithExif(buildTiff({ image: camera, exif: [{ tag: ISO, type: 3, value: 400 }] })),
    );
    expect(exifNumber(d!, "exif", ISO)).toBe(400);
    // Tag numbers repeat across directories, so the directory has to be part
    // of the key or a GPS tag 1 would collide with an image tag 1.
    expect(exifNumber(d!, "image", ISO)).toBeNull();
  });

  it("returns null for a block with the wrong TIFF magic", () => {
    // Without the check, every offset read afterwards is noise presented as data.
    expect(parseExif(jpegWithExif(buildTiff({ image: camera, badMagic: true })))).toBeNull();
  });

  it("returns null for a file with no Exif at all", () => {
    expect(parseExif(jpegWithExif(new Uint8Array(0)))).toBeNull();
  });

  it("returns null rather than throwing on truncated or corrupt bytes", () => {
    // Metadata is decoration on top of an image that is otherwise fine. A
    // malformed block must never be the reason a tool refuses a photo.
    const good = jpegWithExif(buildTiff({ image: camera }));
    for (const cut of [12, 20, 30, 40, 60]) {
      expect(() => parseExif(good.slice(0, cut))).not.toThrow();
    }
    expect(() => parseExif(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08, 1, 2, 3, 4]))).not.toThrow();
  });
});

describe("exifResolution", () => {
  const withRes = (x: number, y: number, unit: number): Entry[] => [
    { tag: X_RES, type: 5, value: rat(x, 1) },
    { tag: Y_RES, type: 5, value: rat(y, 1) },
    { tag: RES_UNIT, type: 3, value: unit },
  ];

  it("reads inches directly", () => {
    const d = parseExif(jpegWithExif(buildTiff({ image: withRes(300, 300, 2) })));
    expect(exifResolution(d!)).toEqual({ x: 300, y: 300 });
  });

  it("converts centimetres", () => {
    const d = parseExif(jpegWithExif(buildTiff({ image: withRes(118, 118, 3) })));
    expect(exifResolution(d!)!.x).toBeCloseTo(299.7, 1);
  });

  it("returns null for unit 1, which means there is no absolute unit", () => {
    // The same rule the pHYs and JFIF readers already follow: those two
    // numbers are an aspect ratio and carry no physical size, so calling them
    // DPI would invent a fact the file does not contain.
    const d = parseExif(jpegWithExif(buildTiff({ image: withRes(72, 72, 1) })));
    expect(exifResolution(d!)).toBeNull();
  });

  it("handles a non-integer rational", () => {
    const d = parseExif(
      jpegWithExif(
        buildTiff({
          image: [
            { tag: X_RES, type: 5, value: rat(7200000, 10000) },
            { tag: Y_RES, type: 5, value: rat(7200000, 10000) },
            { tag: RES_UNIT, type: 3, value: 2 },
          ],
        }),
      ),
    );
    expect(exifResolution(d!)!.x).toBeCloseTo(720, 4);
  });

  it("returns null rather than dividing by a zero denominator", () => {
    const d = parseExif(
      jpegWithExif(
        buildTiff({
          image: [
            { tag: X_RES, type: 5, value: rat(300, 0) },
            { tag: Y_RES, type: 5, value: rat(300, 1) },
            { tag: RES_UNIT, type: 3, value: 2 },
          ],
        }),
      ),
    );
    expect(exifResolution(d!)).toBeNull();
  });
});

describe("exifGps", () => {
  const at = (latRef: string, lat: [number, number, number], lonRef: string, lon: [number, number, number]): Entry[] => [
    { tag: GPS_LAT_REF, type: 2, value: latRef },
    { tag: GPS_LAT, type: 5, value: lat.map((v) => rat(Math.round(v * 1000), 1000)) },
    { tag: GPS_LON_REF, type: 2, value: lonRef },
    { tag: GPS_LON, type: 5, value: lon.map((v) => rat(Math.round(v * 1000), 1000)) },
  ];

  it("converts degrees, minutes and seconds to decimal", () => {
    // 53 deg 33' 36" N, 0 deg 22' 12" W - somewhere in north Lincolnshire.
    const d = parseExif(jpegWithExif(buildTiff({ image: camera, gps: at("N", [53, 33, 36], "W", [0, 22, 12]) })));
    const g = exifGps(d!)!;
    expect(g.latitude).toBeCloseTo(53.56, 4);
    expect(g.longitude).toBeCloseTo(-0.37, 4);
  });

  it("makes south and west negative", () => {
    // Getting the hemisphere wrong puts a Lincolnshire garden in the Atlantic,
    // which is a wrong answer that looks like a working feature.
    const d = parseExif(jpegWithExif(buildTiff({ image: camera, gps: at("S", [33, 55, 0], "E", [151, 12, 0]) })));
    const g = exifGps(d!)!;
    expect(g.latitude).toBeCloseTo(-33.9167, 3);
    expect(g.longitude).toBeCloseTo(151.2, 3);
  });

  it("returns null when there is no GPS directory", () => {
    expect(exifGps(parseExif(jpegWithExif(buildTiff({ image: camera })))!)).toBeNull();
  });
});

describe("measureImage now reads density from Exif", () => {
  const res300: Entry[] = [
    { tag: X_RES, type: 5, value: rat(300, 1) },
    { tag: Y_RES, type: 5, value: rat(300, 1) },
    { tag: RES_UNIT, type: 3, value: 2 },
  ];

  it("closes the gap this module used to document", () => {
    // A photo straight off a phone: Exif, no JFIF. Before this it reported no
    // declared density at all and the print-size tool had nothing to explain.
    const m = measureImage(jpegWithExif(buildTiff({ image: res300 }), { width: 4000, height: 3000 }));
    expect(m).toMatchObject({ width: 4000, height: 3000 });
    expect(m!.density).toEqual({ x: 300, y: 300, source: "exif" });
  });

  it("lets the container's own declaration win over Exif", () => {
    // Where a file carries both, they were usually written by different tools
    // at different times, and JFIF is the one the decoder itself honours.
    const m = measureImage(
      jpegWithExif(buildTiff({ image: res300 }), { jfif: { units: 1, x: 72, y: 72 } }),
    );
    expect(m!.density).toEqual({ x: 72, y: 72, source: "jfif" });
  });

  it("reads Exif density out of a PNG too", () => {
    const m = measureImage(pngWithExif(buildTiff({ image: res300 }), 1200, 900));
    expect(m!.density?.source).toBe("exif");
    expect(m!.density?.x).toBe(300);
  });

  it("still reports no density when the file genuinely declares none", () => {
    const m = measureImage(jpegWithExif(buildTiff({ image: [{ tag: MAKE, type: 2, value: "FC" }] })));
    expect(m!.density).toBeNull();
  });
});
