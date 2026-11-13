import { $ } from "../medication/shared/ui/dom.js";
import { heart } from "./catalog.js";

export function renderMedicineCover(accent) {
  const cover = $("medication-dialog").querySelector(".wizard-visual");
  cover.querySelector("img")?.replaceWith(heart(accent));
}
