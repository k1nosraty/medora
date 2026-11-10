import { routineComplete, routineOccurs } from "./routine-plan.js";
import { dayMs, timezone, localWall, instantForWall } from "./wall-clock.js";

export const minuteMs = 60_000;
export const clockMinute = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export const waterDefaults = { enabled: false, start: "08:00", end: "22:00", interval: 60, repeat: 0, pauseUntil: 0 };
export const appointmentDefaults = { start: "08:00", interval: 120 };
export const appointmentOffsets = [60, 120, 1440];

export function waterGoalReached(state, day) {
  return (state.water ?? []).reduce((sum, entry) => sum + (entry.day === day ? entry.amount : 0), 0) >=
    (state.waterGoal ?? 2000);
}

export function visitInstant(visit, fallbackZone, clocks = new Map()) {
  const zone = visit.zone ?? fallbackZone;
  if (!clocks.has(zone)) clocks.set(zone, { clock: timezone(zone), offsets: new Map() });
  const { clock, offsets } = clocks.get(zone);
  const base = instantForWall(visit.day * dayMs + clockMinute(visit.time) * minuteMs, clock, offsets);
  return base + Math.floor(Number(visit.time.slice(6)) * 1000);
}

export function appointmentReminders(visit, settings, zone, at = visitInstant(visit, zone)) {
  if (visit.remindersOff) return [];
  const clock = timezone(visit.zone ?? zone);
  const offsets = new Map();
  let start = instantForWall(visit.day * dayMs + clockMinute(settings.start) * minuteMs, clock, offsets);
  if (start >= at) start = at - 60 * minuteMs;
  const events = new Set();
  for (let next = start; next < at; next += settings.interval * minuteMs) events.add(next);
  for (const offset of visit.offsets ?? [60]) if (offset > 0) events.add(at - offset * minuteMs);
  return [...events].sort((a, b) => a - b);
}

export function scheduleForPush(state, zone, today, now = Date.now()) {
  const excluded = new Map();
  for (const dose of Object.values(state.doses)) {
    const postponed = dose.status === "snoozed" && dose.snoozeUntil > now;
    if (!postponed && (dose.day < today || !["taken", "skipped", "snoozed"].includes(dose.status))) continue;
    const items = excluded.get(dose.medicineId) ?? [];
    items.push(dose);
    excluded.set(dose.medicineId, items);
  }
  const rules = Object.values(state.medicines).filter(medicine => !medicine.paused && !medicine.archived)
    .flatMap(medicine => medicine.phases.map(phase => {
      const suppressed = (excluded.get(medicine.id) ?? []).filter(({ day, minute }) =>
        day >= phase.start && (phase.end === null || day < phase.end) && phase.slots.some(slot => slot.minute === minute));
      return {
        start: phase.start, end: phase.end, interval: phase.interval, mask: phase.mask,
        ...(medicine.dates?.length ? { days: medicine.dates.filter(day => day >= phase.start && (
          day >= today || suppressed.some(dose => dose.day === day && dose.status === "snoozed" && dose.snoozeUntil > now)
        )) } : {}),
        ...(medicine.effectiveFrom ? { notBefore: medicine.effectiveFrom } : {}),
        minutes: phase.slots.map(slot => slot.minute), skip: suppressed.map(dose => [dose.day, dose.minute]),
        snoozes: suppressed.filter(dose => dose.status === "snoozed" && dose.snoozeUntil > now)
          .map(dose => [dose.day, dose.minute, dose.snoozeUntil])
      };
    }));
  const appointments = new Map();
  const visitSettings = state.appointmentReminders ?? appointmentDefaults;
  const displayClock = timezone(zone);
  const visitClocks = new Map();
  for (const visit of Object.values(state.visits ?? {})) {
    if (visit.cancelled) continue;
    const instant = visitInstant(visit, zone, visitClocks);
    if (!(instant > now)) continue;
    const day = Math.floor(localWall(instant, displayClock) / dayMs);
    for (const at of appointmentReminders(visit, visitSettings, zone, instant)) {
      if (at > now && instant > (appointments.get(at)?.[2] ?? 0)) appointments.set(at, [at, day, instant]);
    }
  }
  const waterSettings = state.waterReminders ?? waterDefaults;
  const water = waterSettings.enabled ? {
    start: clockMinute(waterSettings.start), end: clockMinute(waterSettings.end), interval: waterSettings.interval,
    repeat: waterSettings.repeat, pauseUntil: waterSettings.pauseUntil, goalDay: waterGoalReached(state, today) ? today : null
  } : null;
  const todayLogs = state.routineLogs?.[today] ?? {};
  const routineRules = Object.values(state.routines ?? {})
    .filter(routine => routine.reminder && !routine.paused && routine.minute !== null)
    .map(routine => ({
      start: routine.start, end: null, interval: routine.interval, mask: routine.mask,
      minutes: [routine.minute],
      skip: todayLogs[routine.id] && routineOccurs(routine, today) && routineComplete(todayLogs[routine.id])
        ? [[today, routine.minute]] : []
    }));
  return { zone, rules, ...(routineRules.length ? { routineRules } : {}), appointments: [...appointments.values()], water };
}
