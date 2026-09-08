/**
 * Getting a file from the visitor, by drop, picker or paste.
 *
 * The file input is *found*, never created. The site's rule is that content
 * must never need JavaScript to become visible, so the page ships a real
 * `<input type="file">` and this enhances it. With scripting off the control
 * is still there and still says what it is, which is the difference between a
 * degraded page and a blank one.
 *
 * Nothing here uploads, stores or transmits anything. The File stays in the
 * tab; only its leading bytes are ever read.
 */

import { HEADER_BYTES } from "./sniff.js";

export interface IntakeOptions {
  /** Called with the first accepted file from any of the three routes. */
  onFile: (file: File) => void;
  /** Called instead of `onFile` when a file is refused, with a reason fit to show a person. */
  onReject?: (reason: string) => void;
  /** Refuse anything larger. Zero or undefined means no ceiling. */
  maxBytes?: number;
  /** Class toggled on the root while a drag is over it. */
  draggingClass?: string;
}

const DEFAULT_DRAGGING_CLASS = "is-dragging";

const humanBytes = (n: number): string =>
  n >= 1024 * 1024 ? `${Math.round(n / (1024 * 1024))}MB` : `${Math.round(n / 1024)}KB`;

/**
 * Wire drop, picker and paste on `root`. Returns a function that unwires them.
 *
 * The returned detach matters for the demo page and for tests; on the live
 * site the script outlives the page, so nothing calls it there.
 */
export const attachIntake = (root: HTMLElement, opts: IntakeOptions): (() => void) => {
  const draggingClass = opts.draggingClass ?? DEFAULT_DRAGGING_CLASS;
  const input = root.querySelector<HTMLInputElement>('input[type="file"]');

  const accept = (file: File | null | undefined): void => {
    if (!file) return;
    if (opts.maxBytes && file.size > opts.maxBytes) {
      opts.onReject?.(
        `That file is ${humanBytes(file.size)}. The limit here is ${humanBytes(opts.maxBytes)}.`,
      );
      return;
    }
    if (file.size === 0) {
      opts.onReject?.("That file is empty.");
      return;
    }
    opts.onFile(file);
  };

  // A drag has to be cancelled on both enter and over or the browser navigates
  // to the file instead of firing drop.
  const onDragEnter = (e: DragEvent): void => {
    e.preventDefault();
    root.classList.add(draggingClass);
  };
  const onDragOver = (e: DragEvent): void => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  };
  // dragleave fires when moving between children too, so only clear when the
  // pointer has genuinely left the element's box.
  const onDragLeave = (e: DragEvent): void => {
    if (e.relatedTarget instanceof Node && root.contains(e.relatedTarget)) return;
    root.classList.remove(draggingClass);
  };
  const onDrop = (e: DragEvent): void => {
    e.preventDefault();
    root.classList.remove(draggingClass);
    accept(e.dataTransfer?.files?.[0]);
  };
  const onChange = (): void => {
    accept(input?.files?.[0]);
    // Clear it, or picking the same file twice in a row fires nothing the
    // second time and reads as the tool having frozen.
    if (input) input.value = "";
  };
  const onPaste = (e: ClipboardEvent): void => {
    const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.kind === "file");
    const file = item?.getAsFile();
    if (file) {
      e.preventDefault();
      accept(file);
    }
  };

  root.addEventListener("dragenter", onDragEnter);
  root.addEventListener("dragover", onDragOver);
  root.addEventListener("dragleave", onDragLeave);
  root.addEventListener("drop", onDrop);
  input?.addEventListener("change", onChange);
  document.addEventListener("paste", onPaste);

  return () => {
    root.removeEventListener("dragenter", onDragEnter);
    root.removeEventListener("dragover", onDragOver);
    root.removeEventListener("dragleave", onDragLeave);
    root.removeEventListener("drop", onDrop);
    input?.removeEventListener("change", onChange);
    document.removeEventListener("paste", onPaste);
    root.classList.remove(draggingClass);
  };
};

/**
 * Read the leading bytes of a file.
 *
 * A slice, not the whole file: the measurers need a few hundred bytes, and
 * reading a 60 megapixel photo into memory to learn its width would stall the
 * tab for no gain.
 */
export const readHeaderBytes = async (file: File, n = HEADER_BYTES): Promise<Uint8Array> => {
  const buf = await file.slice(0, n).arrayBuffer();
  return new Uint8Array(buf);
};
