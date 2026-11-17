import { $ } from "../shared/ui/dom.js";
import { glassObject } from "./three-dimensional.js";
import { sleepImage } from "../features/sleep/presentation.js";

const settingsArt = {
  "": "control-settings",
  "notification-settings": "notification",
  "water-settings": "water",
  "cycle-settings": "cycle",
  "snooze-settings": "bottle",
  "appointment-settings": "visit-main",
  "display-settings": "control-sun",
  "backup-settings": "backup",
  "profile-settings": "control-user"
};

export function installSurfaceArt() {
  for (const marker of document.querySelectorAll("[data-surface-art]")) {
    const art = glassObject(marker.dataset.surfaceArt, "image", { className: marker.getAttribute("class") ?? "" });
    if (marker.closest("#quick-dialog")) art.loading = "eager";
    marker.replaceWith(art);
  }
  const settings = $("settings-dialog");
  const renderHeading = () => {
    const panel = settings.dataset.panel;
    $("settings-heading-art").replaceChildren(panel === "sleep-settings"
      ? sleepImage() : glassObject(settingsArt[panel] ?? settingsArt[""], "control"));
  };
  new MutationObserver(renderHeading).observe(settings, { attributeFilter: ["data-panel"] });
  renderHeading();
}
