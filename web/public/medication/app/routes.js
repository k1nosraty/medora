const screens = new Set(["today", "medications", "appointments", "routines", "insights", "water", "cycle"]);

export function routeFromLocation() {
  const { searchParams } = new URL(location.href);
  const view = searchParams.get("view");
  return screens.has(view) ? view : "today";
}

export function installRoutes({ root, titles, canOpen, activate, openSettings }) {
  const panels = [...root.querySelectorAll("[data-screen]")];
  const dock = root.querySelector(".dock");
  const heading = root.querySelector("#screen-title");
  const back = document.querySelector("#screen-back");
  let current = "today";
  const brandTitle = document.title;

  function show(destination, notifications = false, options = {}) {
    const { mode = "push", focus = true } = options;
    if (destination === "settings") { openSettings(notifications); return; }
    if (!screens.has(destination) || !canOpen(destination)) return;
    const previous = current;
    if (mode === "replace" || (mode === "push" && destination !== previous)) {
      const url = new URL(location.href);
      if (destination === "today") url.searchParams.delete("view");
      else url.searchParams.set("view", destination);
      // Notification parameters apply to the incoming entry only.
      if (mode === "push") {
        url.searchParams.delete("day");
        url.searchParams.delete("routine");
      }
      if (mode === "replace") history.replaceState({ ...history.state, medoraRoute: true }, "", url);
      else history.pushState({ medoraRoute: true, medoraBack: previous }, "", url);
    }
    current = destination;
    root.dataset.activeScreen = current;
    for (const panel of panels) panel.hidden = panel.dataset.screen !== current;
    for (const item of dock.querySelectorAll("[data-destination]")) {
      if (item.dataset.destination === current) item.setAttribute("aria-current", "page");
      else if (item.dataset.destination === "today" && current !== "insights") item.setAttribute("aria-current", "location");
      else item.removeAttribute("aria-current");
    }
    heading.textContent = titles[current];
    document.title = `${titles[current]} · ${brandTitle}`;
    back.hidden = current === "today" || current === "insights";
    activate(current, previous, mode);
    if (focus) {
      window.scrollTo(0, 0);
      heading.focus({ preventScroll: true });
    }
    return true;
  }

  root.ownerDocument.addEventListener("click", event => {
    const control = event.target.closest("[data-destination]");
    if (control && !control.disabled) show(control.dataset.destination, control.hasAttribute("data-open-notifications"));
  });
  back.addEventListener("click", () => {
    if (history.state?.medoraBack && canOpen(history.state.medoraBack)) history.back();
    else show("today", false, { mode: "replace" });
  });
  window.addEventListener("popstate", () => {
    const destination = routeFromLocation();
    if (canOpen(destination)) show(destination, false, { mode: "pop" });
    else show("today", false, { mode: "replace" });
  });
  return { show, screen: () => current };
}
