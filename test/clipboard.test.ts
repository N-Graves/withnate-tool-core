// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "../src/clipboard.js";

const setClipboard = (value: unknown): void => {
  Object.defineProperty(window.navigator, "clipboard", { value, configurable: true });
};

const setExecCommand = (fn: unknown): void => {
  Object.defineProperty(document, "execCommand", { value: fn, configurable: true });
};

const textareas = (): HTMLTextAreaElement[] =>
  Array.from(document.querySelectorAll("textarea"));

afterEach(() => {
  setClipboard(undefined);
  Reflect.deleteProperty(document, "execCommand");
  document.body.innerHTML = "";
});

describe("copyText, modern path", () => {
  it("uses the clipboard API and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });

    await expect(copyText("hello")).resolves.toEqual({ ok: true, method: "clipboard" });
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("touches the document at all only when it has to", async () => {
    setClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
    await copyText("hello");
    expect(textareas()).toHaveLength(0);
  });
});

describe("copyText, fallback path", () => {
  it("falls back when there is no clipboard API", async () => {
    setExecCommand(vi.fn().mockReturnValue(true));
    await expect(copyText("hello")).resolves.toEqual({ ok: true, method: "exec-command" });
  });

  // The case that matters most in the wild: the API is present and rejects, because the
  // page is on http:// or the permission was refused. Reporting failure here would be
  // wrong when the older route still works.
  it("falls back when writeText rejects rather than reporting failure", async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error("NotAllowedError")) });
    setExecCommand(vi.fn().mockReturnValue(true));

    await expect(copyText("hello")).resolves.toEqual({ ok: true, method: "exec-command" });
  });

  it("puts the exact text in the field it copies from", async () => {
    let seen: string | null = null;
    setExecCommand(
      vi.fn(() => {
        seen = textareas()[0]?.value ?? null;
        return true;
      }),
    );

    await copyText("line one\nline two\ttabbed");
    expect(seen).toBe("line one\nline two\ttabbed");
  });

  // display:none, hidden and visibility:hidden each make the selection silently fail.
  // This asserts the property that keeps the fallback working, not the exact CSS.
  it("renders the field rather than hiding it", async () => {
    let style = "";
    setExecCommand(
      vi.fn(() => {
        style = textareas()[0]?.style.cssText ?? "";
        return true;
      }),
    );

    await copyText("hello");
    expect(style).not.toMatch(/display\s*:\s*none/);
    expect(style).not.toMatch(/visibility\s*:\s*hidden/);
    expect(style).toMatch(/position\s*:\s*fixed/);
  });

  it("copies an empty string without throwing", async () => {
    setExecCommand(vi.fn().mockReturnValue(true));
    await expect(copyText("")).resolves.toEqual({ ok: true, method: "exec-command" });
  });
});

describe("copyText, when it cannot", () => {
  it("reports manual when the browser has neither route", async () => {
    await expect(copyText("hello")).resolves.toEqual({ ok: false, method: "manual" });
  });

  it("reports manual when execCommand declines", async () => {
    setExecCommand(vi.fn().mockReturnValue(false));
    await expect(copyText("hello")).resolves.toEqual({ ok: false, method: "manual" });
  });

  it("reports manual when execCommand throws", async () => {
    setExecCommand(
      vi.fn(() => {
        throw new Error("not supported");
      }),
    );
    await expect(copyText("hello")).resolves.toEqual({ ok: false, method: "manual" });
  });
});

describe("copyText leaves the page as it found it", () => {
  it.each([
    ["succeeds", () => true],
    ["declines", () => false],
    [
      "throws",
      () => {
        throw new Error("nope");
      },
    ],
  ])("removes the scratch field when execCommand %s", async (_label, impl) => {
    setExecCommand(vi.fn(impl));
    await copyText("hello");
    expect(textareas()).toHaveLength(0);
  });

  it("gives focus back to whatever had it", async () => {
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    expect(document.activeElement).toBe(input);

    setExecCommand(vi.fn().mockReturnValue(true));
    await copyText("hello");

    expect(document.activeElement).toBe(input);
  });
});
