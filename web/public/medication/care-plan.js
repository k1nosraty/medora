import { dayMs, timezone, localWall, instantForWall } from "./wall-clock.js";

export const minuteMs = 60_000;
export const clockMinute = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export const waterDefaults = { enabled: false, start: "08:00", end: "22:00", interval: 60, repeat: 0, pauseUntil: 0 };
export const appointmentDefaults = { start: "08:00", interval: 120 };
export const appointmentOffsets = [60, 120, 1440];

export function visitInstant(visit, fallbackZone) {
  const base = instantForWall(visit.day * dayMs + clockMinute(visit.time) * minuteMs, timezone(visit.zone ?? fallbackZone), new Map());
  return base + Math.floor(Number(visit.time.slice(6)) * 1000);
}

export function appointmentReminders(visit, settings, zone, at = visitInstant(visit, zone)) {
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
  for (const visit of Object.values(state.visits ?? {})) {
    if (visit.cancelled) continue;
    const instant = visitInstant(visit, zone);
    if (!(instant > now)) continue;
    const day = Math.floor(localWall(instant, displayClock) / dayMs);
    for (const at of appointmentReminders(visit, visitSettings, zone, instant)) {
      if (at > now && instant > (appointments.get(at)?.[2] ?? 0)) appointments.set(at, [at, day, instant]);
    }
  }
  const waterSettings = state.waterReminders ?? waterDefaults;
  const total = (state.water ?? []).reduce((sum, entry) => sum + (entry.day === today ? entry.amount : 0), 0);
  const water = waterSettings.enabled ? {
    start: clockMinute(waterSettings.start), end: clockMinute(waterSettings.end), interval: waterSettings.interval,
    repeat: waterSettings.repeat, pauseUntil: waterSettings.pauseUntil, goalDay: total >= (state.waterGoal ?? 2000) ? today : null
  } : null;
  return { zone, rules, appointments: [...appointments.values()], water };
}
