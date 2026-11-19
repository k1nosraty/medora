import { $, button, element } from "../../shared/ui/dom.js";
import { t } from "../../shared/i18n/locale.js";
export { sharedContext } from "./projection.js";

export function avatar(label, id = "") {
  const initials = label.trim().split(/[\s_]+/u).slice(0, 2).map(part => Array.from(part)[0]).join("").toLocaleUpperCase();
  const node = element("span", initials, "family-avatar");
  node.setAttribute("aria-hidden", "true");
  node.dataset.tint = (id.charCodeAt(0) || 0) % 4;
  return node;
}

export function renderMemberHeader(view) {
  const bar = $("family-member-bar");
  bar.hidden = !view;
  $("open-family").hidden = Boolean(view);
  $("app").toggleAttribute("data-family-member", Boolean(view));
  if (!view) {
    $("family-member-name").textContent = $("family-member-group").textContent = "";
    $("family-member-avatar").replaceChildren();
    return;
  }
  $("family-member-name").textContent = view.name;
  $("family-member-group").textContent = view.group.name;
  $("family-member-avatar").replaceChildren(avatar(view.name, view.member.id));
  $("family-member-identity").disabled = !view.profile;
}

export function recordAction(label, handler) {
  const control = button(t(label), handler);
  control.classList.add("secondary", "care-record-action");
  return control;
}
