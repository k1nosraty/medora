import { $, element } from "../shared/ui/dom.js";
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
    marker.replaceWith(glassObject(marker.dataset.surfaceArt, "image", { className: marker.getAttribute("class") ?? "" }));
  }
  const settings = $("settings-dialog");
  const renderHeading = () => {
    $("settings-heading-art").replaceChildren(glassObject(settingsArt[settings.dataset.panel || ""], "control"));
  };
  new MutationObserver(renderHeading).observe(settings, { attributeFilter: ["data-panel"] });
  renderHeading();

  const amount = $("water-dialog").querySelector(".water-amount-field");
  const hero = element("div", "", "water-log-hero");
  amount.before(hero);
  hero.append(amount, glassObject("water", "water"));
}
