import { $ } from "../shared/ui/dom.js";
import { glassObject } from "./three-dimensional.js";

const settingsArt = {
  "": "control-settings",
  "notification-settings": "notification",
  "water-settings": "water",
  "snooze-settings": "bottle",
  "appointment-settings": "visit",
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
    $("settings-heading-art").replaceChildren(glassObject(settingsArt[settings.dataset.panel || ""], "control"));
  };
  new MutationObserver(renderHeading).observe(settings, { attributeFilter: ["data-panel"] });
  renderHeading();
}
