import { dayNumber } from "../../shared/ui/dates.js";
import { timeText } from "../../domain/care-index.js";
import { $, element } from "../../shared/ui/dom.js";
import { listSeparator, localDigits, t } from "../../shared/i18n/locale.js";
import { timeZoneCity } from "../../shared/ui/time-zone-picker.js";
import { amountText } from "../medicines/quantity.js";
import { equal, medicineScheduleFields } from "./merge.js";

const kinds = {
  medicines: "medicines", visits: "appointment", water: "water-intake",
  routines: "routine", routineLogs: "routine-progress", cycleRecords: "cycle",
  doses: "medication-dose", settings: "medora-settings", scheduleHistory: "schedule-history"
};
const fields = {
  name: "name", day: "date", start: "start-date", end: "end-date", time: "time", minute: "time", zone: "clinic-time-zone",
  contact: "contact-information", sharedContact: "contact-information", note: "notes", notes: "notes", sharedNote: "notes",
  place: "location", category: "category", categoryName: "category", color: "color", icon: "icon",
  amount: "sync-amount", instructions: "dose-instructions", unit: "unit", stock: "stock", threshold: "sync-stock-threshold",
  phases: "sync-phase", slots: "dose", dates: "selected-dates", interval: "repeat-interval", mask: "days-of-the-week",
  paused: "sync-paused", archived: "sync-archived", phased: "sync-phased", mode: "tracking-method",
  target: "goal", steps: "sync-steps", done: "done", checked: "sync-checked",
  remindersOff: "sync-reminders-off", offsets: "appointment-reminders", reminder: "reminders", enabled: "enabled",
  completed: "attended", cancelled: "cancelled-appointment", status: "sync-status", flow: "sync-flow",
  planned: "sync-planned", actual: "sync-actual", debit: "sync-debit", snoozeUntil: "sync-snooze-until",
  waterGoal: "water-goal", waterReminders: "water-reminders", appointmentReminders: "appointment-reminders",
  medicationSnoozeMinutes: "medication-reminder-snooze", reminderDetails: "notification-details",
  theme: "appearance", accent: "accent-color", finish: "appearance-style", gender: "gender", calendar: "calendar",
  cycleEnabled: "cycle", personalProfile: "my-profile", firstName: "first-name", lastName: "last-name", birthDate: "date-of-birth",
  heightCm: "height-cm", weightKg: "weight-kg",
  plan: "dose-schedule", until: "end-date", effectiveFrom: "sync-effective-from", scheduleFrom: "sync-effective-from",
  stockTrackedFrom: "sync-stock-tracked-from", resolvedAt: "sync-recorded-at", repeat: "repeat", pauseUntil: "sync-pause-until"
};
const internal = new Set(["id", "medicineId", "revision", "privateText"]);
const dates = new Set(["day", "start", "end", "dates"]);
const instants = new Set(["snoozeUntil", "until", "resolvedAt", "effectiveFrom", "scheduleFrom", "stockTrackedFrom", "pauseUntil"]);
const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const enums = {
  status: { taken: "taken", skipped: "skipped", snoozed: "snoozed" },
  flow: { light: "cycle-flow-light", medium: "cycle-flow-medium", heavy: "cycle-flow-heavy" },
  mode: { done: "done", quantity: "quantity-goal", steps: "steps-checklist" },
  theme: { light: "light", dark: "dark", system: "system" }
};
const ui = key => t("ui." + key);
const fieldLabel = key => fields[key] ? ui(fields[key]) : ui("sync-additional-field");

function readable(value, key, kind, unit, formatDay) {
  if (value == null || value === "") return ui("sync-not-set");
  if (typeof value === "boolean") return ui(value ? "sync-yes" : "sync-no");
  if (typeof value === "number") {
    if (dates.has(key)) return formatDay(value - (key === "end" && kind === "medicines" ? 1 : 0));
    if (instants.has(key)) return new Date(value).toLocaleString(document.documentElement.lang);
    if (key === "minute") return localDigits(timeText(value));
    if (key === "mask") return weekdays.filter((_, index) => value & (1 << index)).map(ui).join(listSeparator);
    if (key === "waterGoal" || kind === "water" && key === "amount") return t("ui.value-ml", localDigits(value));
    if (key === "offsets" || key === "medicationSnoozeMinutes") return t("ui.sync-minutes", localDigits(value));
    if (["medicines", "doses"].includes(kind) && ["amount", "actual", "planned", "debit", "stock", "threshold"].includes(key)) {
      return [amountText(value), unit].filter(Boolean).join(" ");
    }
    return localDigits(value);
  }
  if (key === "zone") return timeZoneCity(value);
  if (key === "birthDate") return formatDay(dayNumber(value));
  const translated = enums[key] && Object.hasOwn(enums[key], value) ? enums[key][value] : null;
  return translated ? ui(translated) : String(value);
}

export function showCareConflict(conflict, snapshot, formatDay) {
  const title = $("account-sync-record");
  const table = $("account-sync-differences");
  const pages = $("account-sync-pages");
  const previous = $("account-sync-prev");
  const next = $("account-sync-next");
  table.replaceChildren();
  pages.hidden = true;
  previous.onclick = next.onclick = null;
  if (!conflict) { title.textContent = ""; return; }

  const { path: [kind, id, field], local, cloud } = conflict;
  const recordKind = kind === "scheduleHistory" ? id : kind;
  const record = snapshot?.[recordKind]?.[id];
  const medicine = kind === "doses" ? snapshot?.medicines?.[(local ?? cloud)?.medicineId] : null;
  const routine = kind === "routineLogs" ? snapshot?.routines?.[id] : null;
  const name = (local ?? cloud)?.name ?? (local ?? cloud)?.plan?.name ?? record?.name ?? medicine?.name ?? routine?.name;
  title.textContent = [ui(kinds[kind]), name].filter(Boolean).join(" · ");

  const rows = [];
  const values = [local, cloud];
  if (field === "schedule") {
    rows.push(...medicineScheduleFields.flatMap(key =>
      equal(local?.[key], cloud?.[key]) ? [] : [[fieldLabel(key), key, local?.[key], cloud?.[key]]]));
  } else {
    const recordLevel = field === undefined && kind !== "settings" || kind === "scheduleHistory" || kind === "routineLogs";
    if (recordLevel && values.includes(undefined)) {
      rows.push([ui("sync-status"), "", ...values.map(value => ui(value === undefined ? "sync-record-deleted" : "sync-record-present"))]);
    }
    rows.push([recordLevel ? "" : fieldLabel(field ?? id), recordLevel ? "" : field ?? id, local, cloud]);
  }

  const differences = [];
  function add(label, key, left, right) {
    if (equal(left, right)) return;
    const sample = left ?? right;
    if (sample && typeof sample === "object" && [left, right].every(value => value == null || typeof value === "object")) {
      const array = Array.isArray(sample);
      const keys = new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})]);
      for (const child of keys) {
        if (!array && internal.has(child)) continue;
        const part = array ? localDigits(Number(child) + 1) : fieldLabel(child);
        add(label ? label + " / " + part : part, array ? key : child, left?.[child], right?.[child]);
      }
      return;
    }
    differences.push([label || ui("sync-additional-field"), key, left, right]);
  }
  for (const row of rows) add(...row);
  if (!differences.length) differences.push([ui("sync-additional-field"), "", ui("sync-other-differences"), ui("sync-other-differences")]);

  const pageSize = 16;
  let start = 0;
  function render() {
    table.replaceChildren(...differences.slice(start, start + pageSize).map(([label, key, left, right]) => {
      const row = element("div");
      row.append(element("dt", label));
      for (const [index, value] of [left, right].entries()) {
        const side = element("dd");
        side.append(element("small", ui(index ? "sync-cloud-version" : "sync-device-version")));
        const text = element("bdi", readable(value, key, recordKind, values[index]?.unit ?? record?.unit ?? medicine?.unit, formatDay));
        side.append(text);
        row.append(side);
      }
      return row;
    }));
    pages.hidden = differences.length <= pageSize;
    previous.disabled = start === 0;
    next.disabled = start + pageSize >= differences.length;
    $("account-sync-page").textContent = t("ui.sync-difference-range", localDigits(start + 1),
      localDigits(Math.min(start + pageSize, differences.length)), localDigits(differences.length));
  }
  previous.onclick = () => { start -= pageSize; render(); if (previous.disabled) next.focus(); };
  next.onclick = () => { start += pageSize; render(); if (next.disabled) previous.focus(); };
  render();
}
