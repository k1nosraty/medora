const screens = new Set([
  "today",
  "medications",
  "appointments",
  "routines",
  "insights",
  "water",
  "cycle",
  "sleep",
] as const);

export type Screen = typeof screens extends Set<infer Value> ? Value : never;
export type Mode = "push" | "replace" | "pop";

function isScreen(value: unknown): value is Screen {
  return typeof value === "string" && screens.has(value as Screen);
}

export function routeFromLocation(): Screen {
  const view = new URL(location.href).searchParams.get("view");
  return isScreen(view) ? view : "today";
}

interface RouteOptions {
  root: HTMLElement;
  titles: Record<Screen, string>;
  canOpen: (destination: Screen) => boolean;
  activate: (destination: Screen, previous: Screen, mode: Mode) => void;
  openSettings: (notifications: boolean) => void;
}

export function installRoutes({
  root,
  titles,
  canOpen,
  activate,
  openSettings,
}: RouteOptions) {
  const panels = root.querySelectorAll<HTMLElement>("[data-screen]");
  const dock = root.ownerDocument.getElementById("app-dock")!;
  const heading = root.querySelector<HTMLElement>("#screen-title")!;
  const back = root.ownerDocument.querySelector<HTMLElement>("#screen-back")!;
  const brandTitle = root.ownerDocument.title;
  let current: Screen = "today";

  function show(
    destination: string | undefined,
    notifications = false,
    { mode = "push", focus = true }: { mode?: Mode; focus?: boolean } = {},
  ) {
    if (destination === "settings") {
      openSettings(notifications);
      return;
    }
    if (!isScreen(destination) || !canOpen(destination)) return;
    const previous = current;
    if (mode === "replace" || (mode === "push" && destination !== previous)) {
      const url = new URL(location.href);
      if (destination === "today") url.searchParams.delete("view");
      else url.searchParams.set("view", destination);
      if (mode === "push") {
        // Notification parameters apply to the incoming entry only.
        url.searchParams.delete("day");
        url.searchParams.delete("routine");
        url.searchParams.delete("log");
        history.pushState({ medoraRoute: true, medoraBack: previous }, "", url);
      } else {
        history.replaceState({ ...history.state, medoraRoute: true }, "", url);
      }
    }
    current = destination;
    root.dataset.activeScreen = current;
    for (const panel of panels) panel.hidden = panel.dataset.screen !== current;
    for (const item of dock.querySelectorAll<HTMLElement>(
      "[data-destination]",
    )) {
      if (item.dataset.destination === current) {
        item.setAttribute("aria-current", "page");
      } else if (
        item.dataset.destination === "today" &&
        current !== "insights"
      ) {
        item.setAttribute("aria-current", "location");
      } else {
        item.removeAttribute("aria-current");
      }
    }
    heading.textContent = titles[current];
    root.ownerDocument.title = `${titles[current]} · ${brandTitle}`;
    back.hidden = current === "today" || current === "insights";
    activate(current, previous, mode);
    if (focus) {
      window.scrollTo(0, 0);
      heading.focus({ preventScroll: true });
    }
    return true;
  }

  root.ownerDocument.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const control = event.target.closest<HTMLElement>("[data-destination]");
    if (control && !("disabled" in control && control.disabled)) {
      show(
        control.dataset.destination,
        control.hasAttribute("data-open-notifications"),
      );
    }
  });
  back.addEventListener("click", () => {
    const destination: unknown = history.state?.medoraBack;
    if (isScreen(destination) && canOpen(destination)) history.back();
    else show("today", false, { mode: "replace" });
  });
  window.addEventListener("popstate", () => {
    const destination = routeFromLocation();
    if (canOpen(destination)) show(destination, false, { mode: "pop" });
    else show("today", false, { mode: "replace" });
  });
  return { show, screen: () => current };
}
