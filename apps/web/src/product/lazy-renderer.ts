import type { ReactNode } from "react";
import type { paint } from "./renderer";

let render: typeof paint | undefined;
let loading: Promise<void> | undefined;

// Cold deep links remain usable while React DOM loads. Reconcile on the next
// ordinary paint so completing a download cannot interrupt a pointer or focus.
export function paintFeature(
  host: HTMLElement,
  view: ReactNode,
  firstPaint: () => void,
  beforeReact?: () => void,
) {
  if (render) {
    beforeReact?.();
    return render(host, view);
  }
  firstPaint();
  loading ??= import("./renderer")
    .then((module) => {
      render = module.paint;
    })
    .catch(() => {
      loading = undefined;
    });
}

export function clearFeature(host: HTMLElement) {
  if (render) render(host, null);
  else host.replaceChildren();
}
