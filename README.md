# withnate-tool-core

The shared spine for the free browser tools on [withnate.co.uk](https://withnate.co.uk) — file
intake, header-only image measurement, unit arithmetic, and the bridge to the site's runtime.

**Nothing here touches the network and nothing here writes to storage.** That is not a policy
statement bolted on afterwards; it is the reason the tools built on it can say *your image never
leaves your device* and have it be true.

MIT licensed.

## Install

```bash
npm install @nasdigitaluk/withnate-tool-core
```

## What is in it

| Module | Exports | Pure? |
|---|---|---|
| `sniff` | `sniffFormat`, `HEADER_BYTES` | yes |
| `dimensions` | `measureImage` | yes |
| `units` | conversions, `formatSize`, `aspectRatio` | yes |
| `intake` | `attachIntake`, `readHeaderBytes` | no — DOM |
| `mount` | `mount`, `revealed` | no — DOM |

The split is deliberate and it is the point of the design: **everything with a decision in it is a
pure function over numbers and bytes, and the DOM is a thin wrapper around it.** That is what makes
the interesting parts testable in Node with no browser and no native canvas dependency, and it is
the same shape the image tooling elsewhere in this project settled on after doing it the other way
round first.

## Measurement reads the header, never the pixels

`measureImage` takes the leading bytes of a file and returns width, height and any declared print
density. It decodes nothing.

```ts
import { measureImage, readHeaderBytes } from "@nasdigitaluk/withnate-tool-core";

const bytes = await readHeaderBytes(file);   // a slice, not the whole file
const m = measureImage(bytes);               // { format, width, height, density }
```

`createImageBitmap` on a 60 megapixel phone photo costs hundreds of megabytes and a visible stall to
learn two integers. Parsing PNG's `IHDR`, JPEG's `SOF`, GIF's screen descriptor or WebP's `VP8X`
costs a few hundred bytes.

Formats: PNG, JPEG (baseline and progressive), GIF, WebP (lossy, lossless and extended).

**`measureImage` returns `null` rather than throwing** — for an unsupported format, a truncated file,
or a header that does not parse. A tool showing *we could not read this file* is a better outcome
than an exception every caller has to remember to catch, and there is nothing useful a caller could
do with the distinction anyway.

## Density is what the file claims, not what it is worth

`density` is the number written into the file, and it is reported as exactly that. A 900 × 600 image
tagged 300 DPI is still 900 × 600; the tag only declares that it should print three inches wide.
Callers are expected to say so rather than repeat the number approvingly.

⚠️ **Two cases return `null` that look like they should return a value.** PNG `pHYs` with unit `0`
and JFIF with units `0` both carry two real numbers that are an *aspect ratio*, not a density.
Reporting them as DPI would be inventing a fact the file does not contain.

## Known gaps

Stated here rather than left to be discovered:

- **JPEG density comes from the JFIF APP0 segment only, not from Exif `XResolution`.** Cameras and
  phones write Exif and frequently no JFIF, so a photo straight off a phone usually reports
  `density: null`. That is the absence of a number rather than a wrong one, and it does not affect
  anything derived from the pixel count. Exif parsing arrives with the metadata viewer and gets
  extracted back into this module then.
- **No BMP, TIFF, HEIC or AVIF.** `sniffFormat` returns `null` for them and `measureImage` refuses,
  which is honest. HEIC in particular is what an iPhone produces by default and is worth adding.
- **`aspectRatio` returns the true reduced ratio, however unhelpful.** A 1493 × 997 crop gives
  `[1493, 997]`, not "about 3:2". Presenting that is the caller's problem; rounding it here would be
  a different number wearing the same name.

## Mounting, and the site's runtime

The site loads one `core.js` that owns a single `requestAnimationFrame` loop, an event bus and the
scroll-reveal observer, exposed as `window.WN`. Its rule is explicit: one rAF loop, not five
competing ones.

```ts
mount("#tool-root", ({ root, wn, reduced }) => { /* ... */ });
```

`mount` bails silently when the element is absent, because a tool script is loaded on one page and
must do nothing on every other. **`WN` is deliberately not required** — a tool that does not animate
works without it, and refusing to run because an unrelated script has not loaded would turn a
cosmetic dependency into an outage. Feature-test before use; `revealed()` does exactly that for the
one call that is easy to forget, and forgetting it leaves injected elements at `opacity: 0` forever.

`attachIntake` *finds* the `<input type="file">` in your markup rather than creating one, because
the site requires that content never depends on JavaScript to be visible.

## Scope

This was extracted from what the first tool genuinely needed, not designed ahead of five of them.
That mistake was already made and corrected once in this codebase — nine MCP servers each carrying a
byte-for-byte copy of the same three modules, drifted apart before anyone noticed — and the fix was
to extract, so this starts small on purpose and grows when a second tool actually needs something.

## Testing

```bash
npm run lint    # tsc --noEmit
npm test        # 43 tests
```

Test fixtures are file headers built byte by byte rather than checked-in binaries, so every byte a
test depends on is visible in the diff, and a test can set a density unit or a marker order no
encoder on this machine would produce.

## Licence

MIT.
