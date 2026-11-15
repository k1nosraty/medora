import { $, button, element } from "../../shared/ui/dom.js";
import { t } from "../../shared/i18n/locale.js";
import { profileName } from "../../domain/profile.js";
import { emptyCareRecords } from "../../domain/family.js";
import { dayMs, instantForWall, localWall, timezone } from "../../domain/wall-clock.js";

const programScopes = { medications: ["medicines", "doses"], appointments: ["visits"],
  routines: ["routines"], water: ["water"], cycle: ["cycle"], insights: ["doses", "visits", "routines", "water", "cycle", "medicines"] };

const actionScopes = { medicine: "medicines", visit: "visits", routine: "routines", water: "water", cycle: "cycle" };

export function sharedContext(data, group, member, { authorName, record, add, profile }) {
  const { records, policy, synced, zone } = data;
  const has = key => policy.sections.includes(key);
  const clock = timezone(zone);
  const offsets = new Map();
  const today = () => Math.floor(localWall(Date.now(), clock) / dayMs);
  const timeOf = (day, minute) => instantForWall(day * dayMs + minute * 60_000, clock, offsets);
  const canView = page => !programScopes[page] || programScopes[page].some(has);
  const canRecord = (kind, day = today()) => synced && policy.record && day <= today() &&
    has(actionScopes[kind]) && (kind !== "medicine" || has("doses")) &&
    (kind !== "cycle" || records.cycleEnabled);
  const canAdd = kind => synced && policy.add && ["medicine", "visit", "routine"].includes(kind) && has(actionScopes[kind]);
  const name = profileName(records.profile) || member.label;
  return {
    group, member, name, firstName: records.profile?.firstName || member.label, has, canView, canRecord, canAdd,
    state: { ...emptyCareRecords(), ...records, cycleEnabled: Boolean(records.cycleEnabled || Object.keys(records.cycleRecords ?? {}).length) },
    zone, get today() { return today(); }, timeOf, authorName, record, add, profile: has("profile") ? profile : null, synced
  };
}

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
