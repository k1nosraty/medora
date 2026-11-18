import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";

const roots = new WeakMap<HTMLElement, Root>();
export function paintFeature(host: HTMLElement, view: ReactNode) {
  const root = roots.get(host) ?? createRoot(host);
  roots.set(host, root);
  flushSync(() => root.render(view));
}

export function clearFeature(host: HTMLElement) {
  const root = roots.get(host);
  if (root) {
    root.unmount();
    roots.delete(host);
  }
  host.replaceChildren();
}
