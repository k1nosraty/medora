import { cycleIsEnabled } from "./profile.js";

export const familyPlacementOf = value => value === "top" || value === "bottom" ? value : "hidden";

export const familySections = ["profile", "medicines", "doses", "visits", "routines", "water", "cycle"];

export function emptyCareRecords() {
  return { medicines: {}, doses: {}, visits: {}, routines: {}, routineLogs: {}, water: [], cycleRecords: {}, settings: {} };
}

const attribution = ["recordedBy", "recordedByName", "recordedAt", "resolvedAt"];
const projectionFields = {
  medicines: ["id", "name", "unit", "stock", "threshold", "stockTrackedFrom", "icon", "color", "phased", "paused",
    "archived", "dates", "revision", "effectiveFrom", "scheduleFrom", "sharedInstructions", ...attribution],
  doses: ["medicineId", "day", "minute", "planned", "actual", "debit", "status", "snoozeUntil", "name", "unit",
    "icon", "color", ...attribution],
  visits: ["id", "name", "day", "time", "place", "category", "categoryName", "zone", "color", "offsets", "cancelled",
    "completed", "remindersOff", "sharedNote", "sharedContact", ...attribution],
  routines: ["id", "name", "category", "color", "start", "interval", "mask", "minute", "mode", "steps", "checked",
    "target", "amount", "done", "unit", "paused", "reminder", "revision", "scheduleFrom", "sharedNotes", ...attribution],
  water: ["id", "day", "time", "amount", ...attribution],
  cycleRecords: ["end", "flow", "sharedNote", ...attribution]
};

const listFields = ["dates", "offsets", "steps", "checked"];
const scalar = value => value === null || typeof value === "string" || typeof value === "boolean" || Number.isFinite(value);

function selectFields(row, keys) {
  return Object.fromEntries(keys.flatMap(key => {
    if (!Object.hasOwn(row ?? {}, key)) return [];
    const value = row[key];
    if (scalar(value) || (listFields.includes(key) && Array.isArray(value) && value.every(scalar))) return [[key, value]];
    return [];
  }));
}

function project(kind, row) {
  const result = selectFields(row, projectionFields[kind]);
  if (kind === "medicines") result.phases = (row.phases ?? []).map(phase => ({
    ...selectFields(phase, ["start", "end", "interval", "mask", "autoEnd"]),
    slots: (phase.slots ?? []).map(slot => selectFields(slot, ["minute", "amount"]))
  }));
  return result;
}

export function sharedCare(records, sections) {
  const allowed = key => sections.includes(key);
  const data = records ?? emptyCareRecords();
  const shared = (kind, rows = data[kind]) => Object.fromEntries(Object.entries(rows ?? {})
    .map(([id, row]) => [id, project(kind, row)]));
  const history = kind => (data.scheduleHistory?.[kind] ?? []).map(version => ({
    until: version.until, plan: project(kind, version.plan)
  }));
  const { personalProfile, gender, waterGoal } = data.settings;
  return {
    ...(allowed("profile") && { profile: { ...selectFields(personalProfile, ["firstName", "lastName", "birthDate", "weightKg", "heightCm"]), gender } }),
    ...(allowed("medicines") && { medicines: shared("medicines") }),
    ...(allowed("doses") && { doses: shared("doses") }),
    ...(allowed("visits") && { visits: shared("visits") }),
    ...(allowed("routines") && { routines: shared("routines"),
      routineLogs: Object.fromEntries(Object.entries(data.routineLogs ?? {}).map(([day, rows]) => [day, shared("routines", rows)])) }),
    ...(allowed("water") && { water: data.water.map(row => project("water", row)), waterGoal }),
    ...(allowed("cycle") && { cycleRecords: shared("cycleRecords"), cycleEnabled: cycleIsEnabled(data.settings) }),
    scheduleHistory: {
      ...(allowed("medicines") && { medicines: history("medicines") }),
      ...(allowed("routines") && { routines: history("routines") })
    }
  };
}
