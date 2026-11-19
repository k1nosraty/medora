import { dayMs, instantForWall, localWall, timezone } from "./wall-clock.js";

const minuteMs = 60_000;
const clockPattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export const sleepDefaults = { goal: 0, mask: 127, bedtime: "", wake: "", paused: false };
export const sleepIsEnabled = state => state.sleepEnabled !== false;

export function validSleepSettings(value) {
  return value && Number.isInteger(value.goal) && (value.goal === 0 || value.goal >= 30 && value.goal <= 1440) &&
    Number.isInteger(value.mask) && value.mask > 0 && value.mask <= 127 &&
    [value.bedtime, value.wake].every(clock => typeof clock === "string" && (clock === "" || clockPattern.test(clock))) && typeof value.paused === "boolean";
}

export function validSleepRecord(row) {
  const instant = value => Number.isSafeInteger(value) && value >= 0 && value <= 253402300799999;
  if (!instant(row.start) || row.end !== null && (!instant(row.end) || row.end <= row.start) ||
      !["main", "nap"].includes(row.kind) || !["", "good", "fair", "poor"].includes(row.quality) ||
      typeof row.zone !== "string" || row.zone.length > 64 ||
      row.note !== undefined && (typeof row.note !== "string" || row.note.length > 500)) return false;
  try { timezone(row.zone); return true; } catch { return false; }
}

export function sleepDay(row) {
  return Math.floor(localWall(row.end ?? row.start, timezone(row.zone)) / dayMs);
}

export function sleepWall(at, zone) {
  const wall = localWall(at, timezone(zone));
  const local = new Date(wall).toISOString();
  return { day: local.slice(0, 10), time: local.slice(11, 16) };
}

export function sleepInstant(day, time, zone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !clockPattern.test(time)) return NaN;
  const wall = Date.parse(day + "T" + time + ":00Z");
  if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 10) !== day) return NaN;
  const clock = timezone(zone);
  const instant = instantForWall(wall, clock, new Map());
  return instant !== undefined && localWall(instant, clock) === wall ? instant : NaN;
}

export const sleepMinutes = row => row.end === null ? 0 : Math.round((row.end - row.start) / minuteMs);

export function sleepConflicts(rows, row, exclude) {
  return Object.entries(rows).some(([id, other]) =>
    id !== exclude && row.start < (other.end ?? Infinity) && other.start < (row.end ?? Infinity));
}

export function validSleepTimeline(records) {
  const rows = Object.values(records).sort((a, b) => a.start - b.start);
  return rows.every((row, index) => index === 0 || row.start >= (rows[index - 1].end ?? Infinity));
}

export function sleepReport(rows, first, last) {
  const nights = new Map();
  let naps = 0;
  for (const row of Object.values(rows ?? {})) {
    if (row.end === null) continue;
    const day = sleepDay(row);
    if (day < first || day > last) continue;
    if (row.kind === "nap") naps += sleepMinutes(row);
    else nights.set(day, (nights.get(day) ?? 0) + sleepMinutes(row));
  }
  const average = nights.size ? Math.round([...nights.values()].reduce((sum, minutes) => sum + minutes, 0) / nights.size) : null;
  return { nights, average, naps };
}
