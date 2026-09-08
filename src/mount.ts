/**
 * Mounting, and the bridge to the site's shared runtime.
 *
 * The site loads one `core.js` that owns a single requestAnimationFrame loop,
 * an event bus and the scroll-reveal observer, and exposes them as `window.WN`.
 * Its rule is explicit: one rAF loop, not five competing ones. Anything here
 * that wants a frame subscribes through the bus rather than calling
 * `requestAnimationFrame` directly.
 *
 * The root element is a hard requirement and its absence is a silent bail -
 * a tool script is loaded on one page and must do nothing on every other.
 * `WN` is deliberately NOT a hard requirement: a tool that does not animate
 * works perfectly without it, and refusing to run because an unrelated script
 * has not loaded would turn a cosmetic dependency into an outage.
 */

export interface WnBus {
  reduced?: boolean;
  frame?: (fn: (t: number) => void) => void;
  unframe?: (fn: (t: number) => void) => void;
  emit?: (name: string, detail?: unknown) => void;
  on?: (name: string, fn: (e: Event) => void) => void;
  observe?: (el: Element) => void;
}

export interface MountContext {
  root: HTMLElement;
  /** Null when the site runtime is not on the page. Always feature-test before use. */
  wn: WnBus | null;
  /** True when the visitor has asked for reduced motion, or when WN is absent and we cannot tell. */
  reduced: boolean;
}

const getWn = (): WnBus | null => {
  const w = globalThis as { WN?: WnBus };
  return w.WN ?? null;
};

/**
 * Run `init` against the first element matching `selector`, or do nothing.
 *
 * Waits for DOMContentLoaded when the document is still parsing, so the script
 * works whether it is loaded with `defer`, at the end of the body, or injected
 * later by a demo page.
 */
export const mount = (selector: string, init: (ctx: MountContext) => void): void => {
  const run = (): void => {
    const root = document.querySelector<HTMLElement>(selector);
    if (!root) return; // Not our page. Silent, by design.
    const wn = getWn();
    const reduced =
      wn?.reduced ??
      (typeof matchMedia === "function"
        ? matchMedia("(prefers-reduced-motion: reduce)").matches
        : true);
    init({ root, wn, reduced });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
};

/**
 * Hand a newly injected element to the site's reveal observer.
 *
 * Elements carrying `[data-reveal]` start at `opacity: 0` and are only made
 * visible when the observer sees them. One injected after the observer has
 * run stays invisible forever unless it is registered, which reads as a
 * rendering bug rather than a missing call.
 */
export const revealed = (wn: WnBus | null, el: Element): void => {
  if (wn?.observe) wn.observe(el);
};
