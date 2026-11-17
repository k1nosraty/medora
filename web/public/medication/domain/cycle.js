import { cycleIsEnabled } from "./profile.js";

export function cycleForecast(records) {
  const starts = Object.keys(records ?? {}).map(Number).sort((a, b) => a - b);
  if (starts.length < 3) return null;
  const recent = starts.slice(-4);
  const intervals = recent.slice(1).map((day, index) => day - recent[index]);
  const last = recent.at(-1);
  return { first: last + Math.min(...intervals), last: last + Math.max(...intervals) };
}

export function cycleTotals(records, first, last, daily) {
  let starts = 0;
  let latestStart = null;
  const loggedDays = new Set();
  for (const [key, record] of Object.entries(records ?? {})) {
    const start = Number(key);
    if (start >= first && start <= last) {
      starts++;
      latestStart = Math.max(latestStart ?? start, start);
    }
    const end = Math.min(record.end ?? start, last);
    for (let day = Math.max(start, first); day <= end; day++) loggedDays.add(day);
  }
  for (const [key, row] of Object.entries(daily ?? {})) {
    const day = Number(key);
    if (day < first || day > last) continue;
    if (["light", "medium", "heavy"].includes(row.flow)) loggedDays.add(day);
    else if (row.flow === "none" || row.flow === "spotting") loggedDays.delete(day);
  }
  return { starts, days: loggedDays.size, latestStart };
}

export const cycleFlows = ["", "none", "spotting", "light", "medium", "heavy"];
export const cycleSymptoms = ["cramps", "headache", "bloating", "backache", "sleep", "energy", "mood"];
export const cycleOptionDefaults = { hideToday: false, minute: null, routines: [] };
export const cycleDataFields = ["cycleRecords", "cycleDays"];
export const cyclePreferenceFields = ["cycleEnabled", "cycleOptions", "cycleSupport", "cycleChecklist", "cycleLocalOnly"];

export function withoutCycle(snapshot) {
  if (!snapshot) return snapshot;
  const copy = { ...snapshot, settings: { ...snapshot.settings } };
  for (const key of cycleDataFields) delete copy[key];
  for (const key of cyclePreferenceFields) delete copy.settings[key];
  return copy;
}

export function cycleEntries(records) {
  return Object.entries(records ?? {}).map(([key, row]) => ({ ...row, start: Number(key) })).sort((a, b) => b.start - a.start);
}

export function cycleOn(records, day, today = day) {
  return cycleEntries(records).find((row, index) => row.start <= day && day <= (row.end ?? (index ? row.start : Math.max(row.start, today))));
}

export function cycleEstimate(records) {
  const estimate = cycleForecast(records);
  if (!estimate) return null;
  const samples = Math.min(Object.keys(records).length, 4);
  return { ...estimate, samples, uncertain: samples === 3 || estimate.last - estimate.first >= 7 };
}

export function cyclePatterns(records, daily) {
  const starts = cycleEntries(records).slice(0, 6);
  const windows = starts.map(({ start }) => Array.from({ length: 5 }, (_, index) => daily?.[start + index - 2]).filter(Boolean));
  const logged = windows.filter(rows => rows.some(row => Object.keys(row.symptoms).length)).length;
  return {
    logged, total: starts.length,
    symptoms: cycleSymptoms.map(key => [key, windows.filter(rows => rows.some(row => row.symptoms[key])).length]).filter(([, count]) => count),
    spotting: Object.values(daily ?? {}).filter(row => row.flow === "spotting").length,
    longest: starts.filter(row => row.end !== null).reduce((max, row) => Math.max(max, row.end - row.start + 1), 0)
  };
}

export function cycleRoutineOccurs(state, plan, day, fallback, today = day) {
  const options = state.cycleOptions;
  if (options?.since > day || !options?.routines.includes(plan.id)) return fallback;
  return cycleIsEnabled(state) && !plan.paused && day >= plan.start && Boolean(cycleOn(state.cycleRecords, day, today));
}

export function cycleTimeReminder(records, options, today) {
  if (!Number.isInteger(options?.minute)) return [];
  const forecast = cycleForecast(records);
  if (!forecast || forecast.last + 1 < today) return [];
  const upcoming = forecast.first - 1;
  return [upcoming, forecast.last + 1].filter(day => day >= today).map(day => [day, options.minute]);
}
