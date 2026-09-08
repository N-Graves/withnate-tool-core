/**
 * Shared spine for the withnate.co.uk browser tools.
 *
 * Scope is deliberately narrow. This was extracted from what the first tool
 * genuinely needed, not designed ahead of five of them - the same mistake was
 * already made and corrected once in this codebase, where nine MCP servers
 * each carried a byte-for-byte copy of the same three modules and the copies
 * had drifted before anyone noticed. It grows by extraction when a second
 * tool actually needs something, and not before.
 *
 * Two rules hold everywhere in here: no network, and no storage. The site's
 * privacy policy states that nothing is contacted and nothing is kept, and it
 * is checked against the code rather than the other way round.
 */

export { sniffFormat, HEADER_BYTES, type ImageFormat } from "./sniff.js";
export { measureImage, type Measurement, type Density } from "./dimensions.js";
export {
  parseExif,
  exifNumber,
  exifString,
  exifResolution,
  exifGps,
  type ExifData,
  type ExifEntry,
  type ExifIfd,
  type ExifValue,
  type Rational,
} from "./exif.js";
export {
  MM_PER_INCH,
  inchesToMm,
  mmToInches,
  inchesToCm,
  cmToInches,
  pxToInches,
  dpiFor,
  roundTo,
  convertFromInches,
  formatLength,
  formatSize,
  aspectRatio,
  type LengthUnit,
} from "./units.js";
export { attachIntake, readHeaderBytes, type IntakeOptions } from "./intake.js";
export { mount, revealed, type MountContext, type WnBus } from "./mount.js";
