import { dayNumber } from "../../product-assets/public/medication/shared/ui/dates.js";
import { timeText } from "../../product-assets/public/medication/domain/care-index.js";
import { useLayoutEffect, useRef, useState } from "react";
import {
  listSeparator,
  localDigits,
  t,
} from "../../product-assets/public/medication/shared/i18n/locale.js";
import { timeZoneCity } from "../../product-assets/public/medication/shared/ui/time-zone-picker.js";
import { amountText } from "../../product-assets/public/medication/features/medicines/quantity.js";
import {
  equal,
  medicineScheduleFields,
} from "../../product-assets/public/medication/features/sync/merge.js";

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
type FormatDay = (day: number) => string;
type Difference = [label: string, key: string, local: unknown, cloud: unknown];
interface Conflict {
  path: [kind: keyof typeof kinds, id: string, field?: string];
  local?: unknown;
  cloud?: unknown;
}
interface DifferenceRow {
  label: string;
  local: string;
  cloud: string;
}

const ui = (key: string) => t("ui." + key);
const fieldLabel = (key: string) => ui(fields[key] ?? "sync-additional-field");

function child(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object") return;
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}

function readable(
  value: unknown,
  key: string,
  kind: string,
  unit: unknown,
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

function describeConflict(
  conflict: Conflict,
  snapshot: unknown,
  formatDay: FormatDay,
) {
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
  const title = [ui(kinds[kind]), name].filter(Boolean).join(" · ");

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
      const presence = (value: unknown) =>
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
  function add(label: string, key: string, left: unknown, right: unknown) {
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

  const unit = child(record, "unit") ?? child(medicine, "unit");
  const displayRows = differences.map(([label, key, left, right]) => ({
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
  }));
  return { title, rows: displayRows };
}

export function SyncConflictReview({
  conflict,
  snapshot,
  formatDay,
  choose,
}: {
  conflict: Conflict;
  snapshot: unknown;
  formatDay: FormatDay;
  choose(side: "device" | "cloud"): void;
}) {
  const [start, setStart] = useState(0);
  const [requestedFocus, setRequestedFocus] = useState<
    "previous" | "next" | null
  >(null);
  const previous = useRef<HTMLButtonElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const { title, rows } = describeConflict(conflict, snapshot, formatDay);
  const pageSize = 16;
  const end = Math.min(start + pageSize, rows.length);

  useLayoutEffect(() => {
    if (requestedFocus === "previous") previous.current?.focus();
    if (requestedFocus === "next") next.current?.focus();
    if (requestedFocus) setRequestedFocus(null);
  }, [requestedFocus]);

  return (
    <section
      id="account-sync-review"
      aria-labelledby="account-sync-review-title"
    >
      <h4 id="account-sync-review-title">{ui("sync-review-title")}</h4>
      <p>
        <bdi id="account-sync-record">{title}</bdi>
      </p>
      <dl id="account-sync-differences">
        <Differences rows={rows.slice(start, end)} />
      </dl>
      <div
        id="account-sync-pages"
        className="buttons"
        hidden={rows.length <= pageSize}
      >
        <button
          id="account-sync-prev"
          type="button"
          className="secondary"
          ref={previous}
          disabled={start === 0}
          onClick={() => {
            setStart(start - pageSize);
            if (start === pageSize) setRequestedFocus("next");
          }}
        >
          {ui("previous")}
        </button>
        <p id="account-sync-page" role="status">
          {t(
            "ui.sync-difference-range",
            localDigits(start + 1),
            localDigits(end),
            localDigits(rows.length),
          )}
        </p>
        <button
          id="account-sync-next"
          type="button"
          className="secondary"
          ref={next}
          disabled={end === rows.length}
          onClick={() => {
            setStart(end);
            if (end + pageSize >= rows.length) setRequestedFocus("previous");
          }}
        >
          {ui("next")}
        </button>
      </div>
      <button
        id="account-sync-keep-device"
        type="button"
        className="secondary"
        onClick={() => choose("device")}
      >
        {ui("sync-keep-device")}
      </button>
      <button
        id="account-sync-keep-cloud"
        type="button"
        className="secondary"
        onClick={() => choose("cloud")}
      >
        {ui("sync-keep-cloud")}
      </button>
    </section>
  );
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
