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
| `bytes` | `u8`, `be16`/`le16`/`le24`/`be32`/`le32`, `matchBytes`, `matchAscii` | yes |
| `sniff` | `sniffFormat`, `HEADER_BYTES` | yes |
| `dimensions` | `measureImage` | yes |
| `exif` | `parseExif`, `exifResolution`, `exifGps`, accessors | yes |
| `units` | conversions, `formatSize`, `aspectRatio` | yes |
| `intake` | `attachIntake`, `readHeaderBytes` | no — DOM |
| `mount` | `mount`, `revealed` | no — DOM |
| `dom` | `h` | no — DOM |

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

- **No BMP, TIFF, HEIC or AVIF.** `sniffFormat` returns `null` for them and `measureImage` refuses,
  which is honest. HEIC in particular is what an iPhone produces by default and is worth adding.
- **`aspectRatio` returns the true reduced ratio, however unhelpful.** A 1493 × 997 crop gives
  `[1493, 997]`, not "about 3:2". Presenting that is the caller's problem; rounding it here would be
  a different number wearing the same name.

## Exif

`parseExif` reads the TIFF block out of a JPEG APP1, a PNG `eXIf` chunk or a WebP `EXIF` chunk, walks
IFD0 and the Exif and GPS sub-directories, and hands back every entry it could read. `exifResolution`
and `exifGps` are the two the tools actually want.

**This closed a gap this file used to document.** JPEG density was read from JFIF only, so a photo
straight off a phone - Exif, no JFIF - reported no declared density at all and the print-size tool had
nothing to explain. `measureImage` now falls back to Exif, and the container's own declaration still
wins where a file carries both, because those two are usually written by different tools at different
times and the container field is the one the decoder honours.

⚠️ **ResolutionUnit 1 yields no density**, the same rule `pHYs` unit 0 and JFIF units 0 already
follow: those two numbers are an aspect ratio and carry no physical size.

`parseExif` returns `null` rather than throwing for anything unreadable, and a test truncates a valid
file at every third byte to prove it. Metadata is decoration on top of an image that is otherwise
perfectly good, and a malformed block must never be the reason a tool refuses a photo.

### The parser treats the file as hostile

Every number in an Exif block — offsets, component counts, directory lengths — is attacker-chosen,
because "the attacker" is whoever made the file. Four limits hold, and each has a test that fails
when it is removed:

| Limit | Value | What it stops |
|---|---|---|
| Entries per block | 4,096 | A directory claiming 65,535 entries in every one of its IFDs |
| Components per entry | 1,024 | A tag claiming four billion components, materialised as an array |
| Block size | 4 MB | A container declaring an Exif segment larger than any real one |
| IFD depth / revisits | 4 / once | A sub-directory pointing at itself, or a longer cycle |

Text fields are decoded as UTF-8 rather than byte-by-byte — modern phones genuinely write UTF-8 into
fields the spec calls ASCII — and **C0 control characters and `DEL` are stripped**. A camera name is
displayed somewhere eventually, and an `ESC[` sequence smuggled through a metadata field into a
terminal or a log is a real trick, not a hypothetical one. Nothing else is altered.

Values are never trusted as bounds: an entry whose declared value would read past the end of the
block is skipped, not clamped. All reads go through one bounds-checked accessor (`bytes.u8`), so a
truncated file fails the same way everywhere instead of silently yielding zeroes.

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

`h` is that rule firing, and it fired late. **Four** tools had a copy of the same tiny element
builder, and by the time it was extracted they had drifted into **three** variants: two guarded
against an `undefined` attribute value and child, two did not, and one could not even accept a
numeric attribute. The two that did not guard would put the literal text `undefined` into an
attribute or onto the page the first time an optional field was absent — a real bug, sitting in two
shipped tools, produced by nothing more than copying. The core takes the strictest variant, which is
a superset of all three, so adopting it is a fix rather than a swap.

`formatBytes` is the same rule firing again, and this time the drift was in the units themselves.
There were two implementations: this package's own private one, which was **binary** and rendered
13,213,000 bytes as `12MB`, and the raster tracer's, which was **decimal** and rendered the same
number as `13.2 MB`. Both were reachable from one page. The core keeps the decimal one, because that
is the SI reading of the prefix and what macOS, cameras and phones all report, and because a size
quoted in MB on an upload form is more often decimal than not.

Nothing visible changed when they were consolidated, which is worth stating rather than assuming:
`maxBytes` is the only caller of the binary one, and **no tool sets it**, so the string it produced
had never reached a visitor.

`MB` is deliberately the largest tier. Nothing this library handles reaches a gigabyte, so a reading
of `1500 MB` is a clearer signal that something has gone wrong than a tidy `1.5 GB` would be.

## Testing

```bash
npm run lint    # tsc --noEmit
npm test        # 93 tests
```

Test fixtures are file headers built byte by byte rather than checked-in binaries, so every byte a
test depends on is visible in the diff, and a test can set a density unit or a marker order no
encoder on this machine would produce.

## Security posture

The strongest property here is what is absent, and it is checked rather than asserted:

- **Zero runtime dependencies.** `dependencies` and `peerDependencies` are both empty. Nothing in
  the published tarball can be replaced by a compromised upstream, because there is no upstream.
  `npm audit --omit=dev` reports no vulnerabilities, and that is a real answer rather than a lucky
  one.
- **No sinks.** No `innerHTML`, `insertAdjacentHTML`, `eval`, `new Function`, or `document.write`
  anywhere. This package never builds markup; it returns numbers, strings and typed arrays, and the
  tools render them with `textContent`.
- **No network and no storage.** No `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`,
  `localStorage`, `sessionStorage`, `indexedDB` or dynamic `import()`. This is what lets the tools
  claim your file never leaves the tab.
- **Only `dist`, `README.md` and `LICENSE` are published** — `files` is explicit, so sources, tests
  and fixtures stay in the repository.

Strings that came out of a file are still **untrusted content**. This package sanitises Exif text of
control characters only; it does not HTML-escape, because it does not know where the caller is
putting it. Render with `textContent`, never `innerHTML`.

## Licence

MIT.
