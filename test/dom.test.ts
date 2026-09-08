// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { h } from "../src/dom.js";

describe("h", () => {
  it("creates an element of the given tag", () => {
    expect(h("section").tagName).toBe("SECTION");
  });

  it("sets class through className rather than as a plain attribute", () => {
    const el = h("div", { class: "a b" });
    expect(el.className).toBe("a b");
    expect(el.getAttribute("class")).toBe("a b");
  });

  it("writes true as a valueless attribute", () => {
    const el = h("button", { disabled: true });
    expect(el.getAttribute("disabled")).toBe("");
    expect(el.hasAttribute("disabled")).toBe(true);
  });

  it("omits an attribute whose value is false", () => {
    expect(h("button", { disabled: false }).hasAttribute("disabled")).toBe(false);
  });

  it("stringifies a numeric attribute", () => {
    expect(h("td", { colspan: 3 }).getAttribute("colspan")).toBe("3");
  });

  it("appends a string child as text, never as markup", () => {
    const el = h("p", {}, "<script>alert(1)</script>");
    expect(el.children.length).toBe(0);
    expect(el.querySelector("script")).toBeNull();
    expect(el.textContent).toBe("<script>alert(1)</script>");
  });

  it("appends a node child", () => {
    const child = h("span", {}, "inner");
    const el = h("div", {}, child);
    expect(el.firstElementChild).toBe(child);
    expect(el.textContent).toBe("inner");
  });

  it("mixes string and node children in order", () => {
    const el = h("p", {}, "before ", h("b", {}, "bold"), " after");
    expect(el.textContent).toBe("before bold after");
  });

  it("nests to arbitrary depth", () => {
    const el = h("div", {}, h("ul", {}, h("li", {}, h("a", { href: "/x" }, "go"))));
    const a = el.querySelector("a");
    expect(a?.getAttribute("href")).toBe("/x");
    expect(a?.textContent).toBe("go");
  });

  // The four tools that carried a copy of this had drifted into three variants.
  // Two of them guarded only against null, so an undefined from an optional
  // field reached String() and put the literal text "undefined" on the page.
  it("omits an attribute whose value is undefined", () => {
    const el = h("div", { title: undefined });
    expect(el.hasAttribute("title")).toBe(false);
    expect(el.outerHTML).not.toContain("undefined");
  });

  it("omits an attribute whose value is null", () => {
    const el = h("div", { title: null });
    expect(el.hasAttribute("title")).toBe(false);
    expect(el.outerHTML).not.toContain("null");
  });

  it("skips an undefined child rather than rendering it", () => {
    const el = h("p", {}, "a", undefined, "b");
    expect(el.textContent).toBe("ab");
    expect(el.textContent).not.toContain("undefined");
  });

  it("skips a null child rather than rendering it", () => {
    const el = h("p", {}, "a", null, "b");
    expect(el.textContent).toBe("ab");
    expect(el.textContent).not.toContain("null");
  });

  it("takes no attributes and no children at all", () => {
    const el = h("hr");
    expect(el.attributes.length).toBe(0);
    expect(el.childNodes.length).toBe(0);
  });
});
