import { HEADER_BYTES } from "./sniff.js";
import { formatBytes } from "./units.js";

export interface IntakeOptions {
  onFile: (file: File) => void;
  onReject?: (reason: string) => void;
  maxBytes?: number;
  draggingClass?: string;
}

const DEFAULT_DRAGGING_CLASS = "is-dragging";

export const attachIntake = (root: HTMLElement, opts: IntakeOptions): (() => void) => {
  const draggingClass = opts.draggingClass ?? DEFAULT_DRAGGING_CLASS;
  const input = root.querySelector<HTMLInputElement>('input[type="file"]');

  const accept = (file: File | null | undefined): void => {
    if (!file) return;
    if (opts.maxBytes && file.size > opts.maxBytes) {
      opts.onReject?.(
        `That file is ${formatBytes(file.size)}. The limit here is ${formatBytes(opts.maxBytes)}.`,
      );
      return;
    }
    if (file.size === 0) {
      opts.onReject?.("That file is empty.");
      return;
    }
    opts.onFile(file);
  };

  const onDragEnter = (e: DragEvent): void => {
    e.preventDefault();
    root.classList.add(draggingClass);
  };
  const onDragOver = (e: DragEvent): void => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  };
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

export const readHeaderBytes = async (file: File, n = HEADER_BYTES): Promise<Uint8Array> => {
  const buf = await file.slice(0, n).arrayBuffer();
  return new Uint8Array(buf);
};
