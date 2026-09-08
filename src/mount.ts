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
  wn: WnBus | null;
  reduced: boolean;
}

const getWn = (): WnBus | null => (globalThis as { WN?: WnBus }).WN ?? null;

export const mount = (selector: string, init: (ctx: MountContext) => void): void => {
  const run = (): void => {
    const root = document.querySelector<HTMLElement>(selector);
    if (!root) return;
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

export const revealed = (wn: WnBus | null, el: Element): void => {
  if (wn?.observe) wn.observe(el);
};
