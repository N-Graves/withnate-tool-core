export type AttrValue = string | boolean | number | null | undefined;

export type Attrs = Record<string, AttrValue>;

export type Child = Node | string | null | undefined;

export const h = (tag: string, attrs: Attrs = {}, ...children: Child[]): HTMLElement => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === null || v === undefined) continue;
    if (k === "class") node.className = String(v);
    else if (v === true) node.setAttribute(k, "");
    else node.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined) continue;
    node.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
};
