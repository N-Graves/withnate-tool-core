export type CopyMethod = "clipboard" | "exec-command" | "manual";

export interface CopyResult {
  ok: boolean;
  method: CopyMethod;
}

const clipboardOf = (doc: Document): Clipboard | undefined => {
  const view = doc.defaultView as (Window & typeof globalThis) | null;
  const nav = view?.navigator ?? (typeof navigator === "undefined" ? undefined : navigator);
  return nav?.clipboard;
};

const selectAndCopy = (text: string, doc: Document): CopyResult => {
  if (!doc.body || typeof doc.execCommand !== "function") return { ok: false, method: "manual" };

  const previous = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
  const field = doc.createElement("textarea");
  field.value = text;

  // Rendered but invisible. display:none, hidden and visibility:hidden all make the
  // selection silently fail, which is the usual reason this fallback "does nothing".
  field.style.cssText =
    "position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;";

  // iOS Safari will not select a plain textarea. readOnly keeps its keyboard down,
  // contentEditable is what actually makes the selection take.
  field.readOnly = true;
  field.contentEditable = "true";

  doc.body.append(field);
  try {
    field.focus();
    field.select();
    // iOS ignores select() on its own and needs the range spelled out.
    field.setSelectionRange(0, text.length);
    return doc.execCommand("copy")
      ? { ok: true, method: "exec-command" }
      : { ok: false, method: "manual" };
  } catch {
    return { ok: false, method: "manual" };
  } finally {
    field.remove();
    previous?.focus();
  }
};

export const copyText = async (text: string, doc: Document = document): Promise<CopyResult> => {
  const clipboard = clipboardOf(doc);

  // writeText is called before anything is awaited on purpose. It needs a secure context,
  // and WebKit additionally requires it to happen inside the user-gesture task - await
  // anything first and it rejects. That is also why this takes the text itself rather
  // than a callback that might go and fetch it.
  if (clipboard && typeof clipboard.writeText === "function") {
    try {
      await clipboard.writeText(text);
      return { ok: true, method: "clipboard" };
    } catch {
      // Blocked by permissions, an insecure origin, or a browser that lies about
      // having the API. Fall through rather than reporting a failure the older
      // route can still handle.
    }
  }

  return selectAndCopy(text, doc);
};
