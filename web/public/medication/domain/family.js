import { cycleIsEnabled } from "./profile.js";

export const familyPlacementOf = value => value === "bottom" || value === "hidden" ? value : "top";

export const familySections = ["profile", "medicines", "doses", "visits", "routines", "water", "cycle"];

export function emptyCareRecords() {
  return { medicines: {}, doses: {}, visits: {}, routines: {}, routineLogs: {}, water: [], cycleRecords: {}, settings: {} };
}

export function sharedCare(records, sections) {
  const allowed = key => sections.includes(key);
  const data = records ?? emptyCareRecords();
  const { personalProfile, gender, waterGoal } = data.settings;
  return {
    ...(allowed("profile") && { profile: { ...personalProfile, gender } }),
    ...(allowed("medicines") && { medicines: data.medicines }),
    ...(allowed("doses") && { doses: data.doses }),
    ...(allowed("visits") && { visits: data.visits }),
    ...(allowed("routines") && { routines: data.routines, routineLogs: data.routineLogs }),
    ...(allowed("water") && { water: data.water, waterGoal }),
    ...(allowed("cycle") && { cycleRecords: data.cycleRecords ?? {}, cycleEnabled: cycleIsEnabled(data.settings) }),
    scheduleHistory: {
      ...(allowed("medicines") && { medicines: data.scheduleHistory?.medicines ?? [] }),
      ...(allowed("routines") && { routines: data.scheduleHistory?.routines ?? [] })
    }
  };
}
