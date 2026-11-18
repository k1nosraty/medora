import { dayNumber } from "../../../../web/public/medication/shared/ui/dates.js";
import { timeText } from "../../../../web/public/medication/domain/care-index.js";
import { clearFeature, paintFeature } from "./renderer";
import {
  listSeparator,
  localDigits,
  t,
} from "../../../../web/public/medication/shared/i18n/locale.js";
import { timeZoneCity } from "../../../../web/public/medication/shared/ui/time-zone-picker.js";
import { amountText } from "../../../../web/public/medication/features/medicines/quantity.js";
import {
  equal,
  medicineScheduleFields,
} from "../../../../web/public/medication/features/sync/merge.js";

const kinds = {
  medicines: "medicines",
  visits: "appointment",
  water: "water-intake",
  routines: "routine",
  routineLogs: "routine-progress",
  cycleRecords: "cycle",
  cycleDays: "cycle-day-log",
  sleepRecords: "sleep",
  doses: "medication-dose",
  settings: "medora-settings",
  scheduleHistory: "schedule-history",
};
const fields: Record<string, string> = {
  name: "name",
  day: "date",
  start: "start-date",
  end: "end-date",
  time: "time",
  minute: "time",
  zone: "clinic-time-zone",
  contact: "contact-information",
  sharedContact: "contact-information",
  note: "notes",
  notes: "notes",
  sharedNote: "notes",
  place: "location",
  category: "category",
  categoryName: "category",
  color: "color",
  icon: "icon",
  amount: "sync-amount",
  instructions: "dose-instructions",
  unit: "unit",
  stock: "stock",
  threshold: "sync-stock-threshold",
  phases: "sync-phase",
  slots: "dose",
  dates: "selected-dates",
  interval: "repeat-interval",
  mask: "days-of-the-week",
  paused: "sync-paused",
  archived: "sync-archived",
  phased: "sync-phased",
  mode: "tracking-method",
  target: "goal",
  steps: "sync-steps",
  done: "done",
  checked: "sync-checked",
  remindersOff: "sync-reminders-off",
  offsets: "appointment-reminders",
  reminder: "reminders",
  enabled: "enabled",
  completed: "attended",
  cancelled: "cancelled-appointment",
  status: "sync-status",
  flow: "sync-flow",
  planned: "sync-planned",
  actual: "sync-actual",
  debit: "sync-debit",
  snoozeUntil: "sync-snooze-until",
  waterGoal: "water-goal",
  waterReminders: "water-reminders",
  appointmentReminders: "appointment-reminders",
  medicationSnoozeMinutes: "medication-reminder-snooze",
  reminderDetails: "notification-details",
  theme: "appearance",
  accent: "accent-color",
  finish: "appearance-style",
  gender: "gender",
  calendar: "calendar",
  cycleEnabled: "cycle",
  sleepEnabled: "sleep",
  sleepSettings: "sleep-settings-subtitle",
  cycleCardSize: "today-card-size",
  sleepCardSize: "today-card-size",
  cycleOptions: "cycle-tracking-settings",
  quality: "sleep-quality",
  kind: "sleep-kind",
  symptoms: "cycle-symptoms",
  tags: "cycle-tags",
  personalProfile: "my-profile",
  firstName: "first-name",
  lastName: "last-name",
  birthDate: "date-of-birth",
  heightCm: "height-cm",
  weightKg: "weight-kg",
  plan: "dose-schedule",
  until: "end-date",
  effectiveFrom: "sync-effective-from",
  scheduleFrom: "sync-effective-from",
  stockTrackedFrom: "sync-stock-tracked-from",
  resolvedAt: "sync-recorded-at",
  repeat: "repeat",
  pauseUntil: "sync-pause-until",
};
const internal = new Set(["id", "medicineId", "revision", "privateText"]);
const dates = new Set(["day", "start", "end", "dates"]);
const instants = new Set([
  "snoozeUntil",
  "until",
  "resolvedAt",
  "effectiveFrom",
  "scheduleFrom",
  "stockTrackedFrom",
  "pauseUntil",
]);
const weekdays = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
const enums: Record<string, Record<string, string>> = {
  status: { taken: "taken", skipped: "skipped", snoozed: "snoozed" },
  quality: { good: "sleep-good", fair: "sleep-fair", poor: "sleep-poor" },
  kind: { main: "sleep-main", nap: "sleep-nap" },
  flow: {
    none: "cycle-no-flow",
    spotting: "cycle-spotting",
    light: "cycle-flow-light",
    medium: "cycle-flow-medium",
    heavy: "cycle-flow-heavy",
  },
  mode: { done: "done", quantity: "quantity-goal", steps: "steps-checklist" },
  theme: { light: "light", dark: "dark", system: "system" },
};
type Value =
  | null
  | number
  | boolean
  | string
  | Value[]
  | { [key: string]: Value | undefined };
type FormatDay = (day: number) => string;
type Difference = [
  label: string,
  key: string,
  local: Value | undefined,
  cloud: Value | undefined,
];
interface Conflict {
  path: [kind: keyof typeof kinds, id: string, field?: string];
  local?: Value;
  cloud?: Value;
}
interface DifferenceRow {
  label: string;
  local: string;
  cloud: string;
}

const ui = (key: string) => t("ui." + key);
const fieldLabel = (key: string) => ui(fields[key] ?? "sync-additional-field");

function child(value: Value | undefined, key: string): Value | undefined {
  if (value === null || typeof value !== "object") return;
  return Array.isArray(value) ? value[Number(key)] : value[key];
}

function $<T extends HTMLElement = HTMLElement>(id: string) {
  return document.getElementById(id)! as T;
}

function readable(
  value: Value | undefined,
  key: string,
  kind: string,
  unit: Value | undefined,
  formatDay: FormatDay,
) {
  if (value == null || value === "") return ui("sync-not-set");
  if (typeof value === "boolean") return ui(value ? "sync-yes" : "sync-no");
  if (typeof value === "number") {
    if (kind === "sleepRecords" && (key === "start" || key === "end"))
      return new Date(value).toLocaleString(document.documentElement.lang);
    if (dates.has(key))
      return formatDay(value - (key === "end" && kind === "medicines" ? 1 : 0));
    if (instants.has(key))
      return new Date(value).toLocaleString(document.documentElement.lang);
    if (key === "minute") return localDigits(timeText(value));
    if (key === "mask")
      return weekdays
        .filter((_, index) => value & (1 << index))
        .map(ui)
        .join(listSeparator);
    if (key === "waterGoal" || (kind === "water" && key === "amount"))
      return t("ui.value-ml", localDigits(value));
    if (key === "offsets" || key === "medicationSnoozeMinutes")
      return t("ui.sync-minutes", localDigits(value));
    if (
      ["medicines", "doses"].includes(kind) &&
      ["amount", "actual", "planned", "debit", "stock", "threshold"].includes(
        key,
      )
    ) {
      return [amountText(value), unit].filter(Boolean).join(" ");
    }
    return localDigits(value);
  }
  if (key === "zone" && typeof value === "string") return timeZoneCity(value);
  if (key === "birthDate" && typeof value === "string")
    return formatDay(dayNumber(value));
  const options = enums[key];
  const translated =
    typeof value === "string" && options && Object.hasOwn(options, value)
      ? options[value]
      : undefined;
  return translated ? ui(translated) : String(value);
}

export function showCareConflict(
  conflict: Conflict | null,
  snapshot: Value | undefined,
  formatDay: FormatDay,
) {
  const title = $("account-sync-record");
  const table = $("account-sync-differences");
  const pages = $("account-sync-pages");
  const previous = $<HTMLButtonElement>("account-sync-prev");
  const next = $<HTMLButtonElement>("account-sync-next");
  clearFeature(table);
  pages.hidden = true;
  previous.onclick = next.onclick = null;
  if (!conflict) {
    title.textContent = "";
    return;
  }

  const {
    path: [kind, id, field],
    local,
    cloud,
  } = conflict;
  const recordKind = kind === "scheduleHistory" ? id : kind;
  const record = child(child(snapshot, recordKind), id);
  const chosen = local ?? cloud;
  const medicineId = child(chosen, "medicineId");
  const medicine =
    kind === "doses" && typeof medicineId === "string"
      ? child(child(snapshot, "medicines"), medicineId)
      : null;
  const routine =
    kind === "routineLogs" ? child(child(snapshot, "routines"), id) : null;
  const name =
    child(chosen, "name") ??
    child(child(chosen, "plan"), "name") ??
    child(record, "name") ??
    child(medicine, "name") ??
    child(routine, "name");
  title.textContent = [ui(kinds[kind]), name].filter(Boolean).join(" · ");

  const rows: Difference[] = [];
  if (field === "schedule") {
    rows.push(
      ...medicineScheduleFields.flatMap((key): Difference[] => {
        const left = child(local, key);
        const right = child(cloud, key);
        return equal(left, right) ? [] : [[fieldLabel(key), key, left, right]];
      }),
    );
  } else {
    const recordLevel =
      (field === undefined && kind !== "settings") ||
      kind === "scheduleHistory" ||
      kind === "routineLogs";
    if (recordLevel && (local === undefined || cloud === undefined)) {
      const presence = (value: Value | undefined) =>
        ui(value === undefined ? "sync-record-deleted" : "sync-record-present");
      rows.push([ui("sync-status"), "", presence(local), presence(cloud)]);
    }
    rows.push([
      recordLevel ? "" : fieldLabel(field ?? id),
      recordLevel ? "" : (field ?? id),
      local,
      cloud,
    ]);
  }

  const differences: Difference[] = [];
  function add(
    label: string,
    key: string,
    left: Value | undefined,
    right: Value | undefined,
  ) {
    if (equal(left, right)) return;
    const sample = left ?? right;
    if (
      sample &&
      typeof sample === "object" &&
      [left, right].every((value) => value == null || typeof value === "object")
    ) {
      const array = Array.isArray(sample);
      const keys = new Set([
        ...Object.keys(left ?? {}),
        ...Object.keys(right ?? {}),
      ]);
      for (const field of keys) {
        if (!array && internal.has(field)) continue;
        const part = array ? localDigits(Number(field) + 1) : fieldLabel(field);
        add(
          label ? label + " / " + part : part,
          array ? key : field,
          child(left, field),
          child(right, field),
        );
      }
      return;
    }
    differences.push([label || ui("sync-additional-field"), key, left, right]);
  }
  for (const row of rows) add(...row);
  if (!differences.length)
    differences.push([
      ui("sync-additional-field"),
      "",
      ui("sync-other-differences"),
      ui("sync-other-differences"),
    ]);

  const pageSize = 16;
  let start = 0;
  function render() {
    const rows: DifferenceRow[] = differences
      .slice(start, start + pageSize)
      .map(([label, key, left, right]) => {
        const unit = child(record, "unit") ?? child(medicine, "unit");
        return {
          label,
          local: readable(
            left,
            key,
            recordKind,
            child(local, "unit") ?? unit,
            formatDay,
          ),
          cloud: readable(
            right,
            key,
            recordKind,
            child(cloud, "unit") ?? unit,
            formatDay,
          ),
        };
      });
    paintFeature(table, <Differences rows={rows} />);
    pages.hidden = differences.length <= pageSize;
    previous.disabled = start === 0;
    next.disabled = start + pageSize >= differences.length;
    $("account-sync-page").textContent = t(
      "ui.sync-difference-range",
      localDigits(start + 1),
      localDigits(Math.min(start + pageSize, differences.length)),
      localDigits(differences.length),
    );
  }
  previous.onclick = () => {
    start -= pageSize;
    render();
    if (previous.disabled) next.focus();
  };
  next.onclick = () => {
    start += pageSize;
    render();
    if (next.disabled) previous.focus();
  };
  render();
}

function Differences({ rows }: { rows: DifferenceRow[] }) {
  return rows.map(({ label, local, cloud }, index) => (
    <div key={index}>
      <dt>{label}</dt>
      <dd>
        <small>{ui("sync-device-version")}</small>
        <bdi>{local}</bdi>
      </dd>
      <dd>
        <small>{ui("sync-cloud-version")}</small>
        <bdi>{cloud}</bdi>
      </dd>
    </div>
  ));
}
