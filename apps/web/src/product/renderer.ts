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

export function mountCard(
  attributes: Record<string, string | undefined>,
  view: ReactNode,
) {
  const article = document.createElement("article");
  article.dataset.reactCard = "";
  for (const [key, value] of Object.entries(attributes))
    if (value !== undefined)
      article.setAttribute(key === "className" ? "class" : key, value);
  paintFeature(article, view);
  return article;
}

export function disposeCards(host: HTMLElement) {
  for (const card of host.querySelectorAll<HTMLElement>(
    "[data-react-card], [data-react-dose]",
  ))
    clearFeature(card);
}
