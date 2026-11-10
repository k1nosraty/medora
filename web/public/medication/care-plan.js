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

const planBudget = 92 * 1024;
const utf8 = new TextEncoder();
const jsonSize = value => utf8.encode(JSON.stringify(value)).length;

function fitReminderDetails(plan) {
  if (jsonSize(plan) <= planBudget) return plan;
  const names = [];
  for (const rule of [...plan.rules, ...(plan.routineRules ?? [])]) {
    const { name, unit, amounts } = rule;
    if (name === undefined) continue;
    names.push({ rule, details: { name, unit, amounts } });
    delete rule.name;
    delete rule.unit;
    delete rule.amounts;
  }
  const visits = plan.appointments.sort(([a], [b]) => a - b)
    .filter(item => item.length === 4).map(item => ({ item, details: item.pop() }));
  let remaining = planBudget - jsonSize(plan);
  for (const { rule, details } of names) {
    const size = jsonSize(details);
    if (size > remaining) continue;
    remaining -= size;
    Object.assign(rule, details);
  }
  for (const { item, details } of visits) {
    const size = jsonSize(details) + 1;
    if (size > remaining) continue;
    remaining -= size;
    item.push(details);
  }
  return plan;
}

function reminderLabel(text, limit) {
  return String(text ?? "").replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, " ").trim().slice(0, limit);
}

export function scheduleForPush(state, zone, today, now = Date.now()) {
  const details = state.reminderDetails === true;
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
        ...(details ? {
          name: reminderLabel(medicine.name, 80), unit: reminderLabel(medicine.unit, 24),
          amounts: phase.slots.map(slot => slot.amount == null ? null : slot.amount / 1000)
        } : {}),
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
    if (visit.cancelled || visit.completed) continue;
    const instant = visitInstant(visit, zone, visitClocks);
    if (!(instant > now)) continue;
    const day = Math.floor(localWall(instant, displayClock) / dayMs);
    for (const at of appointmentReminders(visit, visitSettings, zone, instant)) {
      if (at <= now) continue;
      const previous = appointments.get(at);
      const latest = instant > (previous?.[2] ?? 0);
      if (!details && !latest) continue;
      const names = details ? [...(previous?.[3] ?? []), [instant, reminderLabel(visit.name, 80)]]
        .sort(([a], [b]) => a - b).slice(0, 3) : [];
      appointments.set(at, [at, latest ? day : previous[1], latest ? instant : previous[2], ...(details ? [names] : [])]);
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
      ...(details ? {
        name: reminderLabel(routine.name, 80), unit: reminderLabel(routine.unit, 24),
        amounts: [routine.mode === "quantity" ? routine.target : null]
      } : {}),
      skip: todayLogs[routine.id] && routineOccurs(routine, today) && routineComplete(todayLogs[routine.id])
        ? [[today, routine.minute]] : []
    }));
  const plan = { zone, rules, ...(routineRules.length ? { routineRules } : {}), appointments: [...appointments.values()], water };
  return details ? fitReminderDetails(plan) : plan;
}
