import { withoutPrivateFields } from "./private-fields.js";
import { cycleIsEnabled } from "./profile.js";

export const familyPlacementOf = value => value === "top" || value === "bottom" ? value : "hidden";

export const familySections = ["profile", "medicines", "doses", "visits", "routines", "water", "cycle"];

export function emptyCareRecords() {
  return { medicines: {}, doses: {}, visits: {}, routines: {}, routineLogs: {}, water: [], cycleRecords: {}, settings: {} };
}

export function sharedCare(records, sections) {
  const allowed = key => sections.includes(key);
  const data = records ?? emptyCareRecords();
  const shared = (kind, rows = data[kind]) => Object.fromEntries(Object.entries(rows ?? {})
    .map(([id, row]) => [id, withoutPrivateFields(kind, row)]));
  const history = kind => (data.scheduleHistory?.[kind] ?? []).map(version => ({
    ...version, plan: withoutPrivateFields(kind, version.plan)
  }));
  const { personalProfile, gender, waterGoal } = data.settings;
  return {
    ...(allowed("profile") && { profile: { ...personalProfile, gender } }),
    ...(allowed("medicines") && { medicines: shared("medicines") }),
    ...(allowed("doses") && { doses: shared("doses") }),
    ...(allowed("visits") && { visits: shared("visits") }),
    ...(allowed("routines") && { routines: shared("routines"),
      routineLogs: Object.fromEntries(Object.entries(data.routineLogs ?? {}).map(([day, rows]) => [day, shared("routines", rows)])) }),
    ...(allowed("water") && { water: data.water, waterGoal }),
    ...(allowed("cycle") && { cycleRecords: shared("cycleRecords"), cycleEnabled: cycleIsEnabled(data.settings) }),
    scheduleHistory: {
      ...(allowed("medicines") && { medicines: history("medicines") }),
      ...(allowed("routines") && { routines: history("routines") })
    }
  };
}
