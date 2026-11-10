import { maxRoutines, validRoutineId } from "../public/medication/routine-plan.js";
import { WebPhase, WebSlot, nextMedicationPhaseDay, validMedicationPhases } from "../public/care-engine/care-core.mjs";

import { dayMs, timezone, localWall, instantForWall } from "../public/medication/wall-clock.js";

const minuteMs = 60_000;
const validDay = day => Number.isInteger(day) && day >= -719162 && day <= 2932896;
const validMinute = minute => Number.isInteger(minute) && minute >= 0 && minute < 1440;
const validLabel = (text, limit) => typeof text === "string" && text.length <= limit &&
  !/[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(text);
const validAmount = value => value === null || (Number.isFinite(value) && value > 0 && value <= 1_000_000);
const validInstant = at => Number.isSafeInteger(at) && at > 0 && at < 2932897 * dayMs;

function phaseOf(rule) {
  return new WebPhase(rule.start, rule.end, rule.interval, rule.mask, rule.minutes.map(minute => new WebSlot(minute, null)));
}

function validRules(input, limit, routine = false) {
  if (!Array.isArray(input) || input.length > limit) return null;
  let skips = 0;
  let specificDays = 0;
  const rules = [];
  for (const rule of input) {
    if (!validDay(rule?.start) || (rule.end !== null && !validDay(rule.end)) ||
        !Number.isInteger(rule.interval) || !Number.isInteger(rule.mask) || !Array.isArray(rule.minutes) ||
        rule.minutes.length < 1 || rule.minutes.length > 12 || !rule.minutes.every(validMinute) ||
        !Array.isArray(rule.skip)) return null;
    skips += rule.skip.length;
    if (skips > 256 || !rule.skip.every(pair => Array.isArray(pair) && pair.length === 2 && validDay(pair[0]) && validMinute(pair[1]))) return null;
    const clean = { start: rule.start, end: rule.end, interval: rule.interval, mask: rule.mask, minutes: rule.minutes, skip: rule.skip };
    if (routine && rule.routineId !== undefined) {
      if (!validRoutineId(rule.routineId)) return null;
      clean.routineId = rule.routineId;
    }
    if (rule.name !== undefined) {
      if (!validLabel(rule.name, 80) || !validLabel(rule.unit, 24) || !Array.isArray(rule.amounts) ||
          rule.amounts.length !== rule.minutes.length || !rule.amounts.every(validAmount)) return null;
      Object.assign(clean, { name: rule.name, unit: rule.unit, amounts: rule.amounts });
    }
    const phase = phaseOf(clean);
    if (!validMedicationPhases([phase])) return null;
    if (rule.days !== undefined) {
      if (!Array.isArray(rule.days) || !rule.days.every(day => validDay(day) && day >= phase.startDay)) return null;
      specificDays += rule.days.length;
      if (specificDays > 4096) return null;
      clean.days = [...new Set(rule.days)].sort((a, b) => a - b);
    }
    if (rule.notBefore !== undefined) {
      if (rule.notBefore !== 0 && !validInstant(rule.notBefore)) return null;
      clean.notBefore = rule.notBefore;
    }
    if (rule.snoozes !== undefined) {
      if (!Array.isArray(rule.snoozes) || rule.snoozes.length > rule.skip.length || !rule.snoozes.every(entry => {
        if (!Array.isArray(entry) || entry.length !== 3) return false;
        const [day, minute, until] = entry;
        return validDay(day) && rule.minutes.includes(minute) && validInstant(until) &&
          rule.skip.some(pair => pair[0] === day && pair[1] === minute);
      })) return null;
      clean.snoozes = rule.snoozes.filter(([day]) => nextMedicationPhaseDay(phase, day) === day &&
        (clean.days === undefined || clean.days.includes(day)));
    }
    rules.push(clean);
  }
  return rules;
}

export function validSchedule(body) {
  if (typeof body?.zone !== "string" || body.zone.length > 64 || !/^[A-Za-z0-9_+/-]+$/.test(body.zone)) return null;
  try { timezone(body.zone); } catch { return null; }
  const rules = validRules(body.rules, 100);
  const routineRules = validRules(body.routineRules === undefined ? [] : body.routineRules, maxRoutines, true);
  if (!rules || !routineRules || routineRules.some(rule => rule.end !== null || rule.minutes.length !== 1 ||
    rule.skip.length > 1 || rule.days !== undefined || rule.notBefore !== undefined || rule.snoozes !== undefined)) return null;
  const appointments = body.appointments === undefined ? [] : body.appointments;
  if (!Array.isArray(appointments) || appointments.length > 1200 ||
      !appointments.every(item => Array.isArray(item) && (item.length === 3 || item.length === 4) &&
        validInstant(item[0]) && validDay(item[1]) && validInstant(item[2]) && item[2] > item[0] &&
        (item.length === 3 || (Array.isArray(item[3]) && item[3].length <= 3 && item[3].every(entry =>
          Array.isArray(entry) && entry.length === 2 && validInstant(entry[0]) && entry[0] > item[0] &&
          entry[0] <= item[2] && validLabel(entry[1], 80)))))) return null;
  const water = body.water ?? null;
  if (water !== null && (!validMinute(water.start) || !validMinute(water.end) || water.end <= water.start ||
      !Number.isInteger(water.interval) || water.interval < 15 || water.interval > 240 ||
      !Number.isInteger(water.repeat) || water.repeat < 0 || water.repeat >= water.interval ||
      (water.pauseUntil !== 0 && !validInstant(water.pauseUntil)) ||
      (water.goalDay !== null && !validDay(water.goalDay)))) return null;
  return {
    zone: body.zone, rules, ...(routineRules.length ? { routineRules } : {}), appointments: appointments.sort((a, b) => a[0] - b[0]),
    water: water && { start: water.start, end: water.end, interval: water.interval, repeat: water.repeat,
      pauseUntil: water.pauseUntil, goalDay: water.goalDay }
  };
}

export function nextMedicationReminder(schedule, after) {
  const clock = timezone(schedule.zone);
  const day = Math.floor(localWall(after, clock) / dayMs);
  const offsets = new Map();
  let earliest = null;
  function consider(at, day, rule, minute) {
    if (earliest && at > earliest.at) return;
    if (!earliest || at < earliest.at) {
      earliest = { at, day, ...(rule.routineId ? { routineId: rule.routineId } : {}) };
    } else if (earliest.routineId !== rule.routineId) {
      // A grouped reminder cannot point at a single routine.
      delete earliest.routineId;
    }
    if (!rule.name) return;
    const details = earliest.details ??= [];
    const amount = rule.amounts[rule.minutes.indexOf(minute)];
    if (details.length < 3 && !details.some(item => item.name === rule.name && item.amount === amount && item.unit === rule.unit)) {
      details.push({ name: rule.name, amount, unit: rule.unit });
    }
  }
  for (const rule of schedule.rules) {
    const phase = phaseOf(rule);
    const skip = new Set(rule.skip.map(pair => pair.join(":")));
    for (const [day, minute, until] of rule.snoozes ?? []) {
      const at = Math.max(until, instantForWall(day * dayMs + minute * minuteMs, clock, offsets));
      if (at > after) consider(at, day, rule, minute);
    }
    const cutoff = Math.max(after, (rule.notBefore ?? 0) - 1);
    const fromDay = cutoff === after ? day : Math.floor(localWall(cutoff, clock) / dayMs);
    let dateIndex = rule.days?.findIndex(date => date >= fromDay);
    let candidate = rule.days ? rule.days[dateIndex] ?? null : nextMedicationPhaseDay(phase, fromDay);
    while (candidate !== null && validDay(candidate)) {
      let found = false;
      for (const minute of rule.minutes) {
        if (skip.has(`${candidate}:${minute}`)) continue;
        const due = instantForWall(candidate * dayMs + minute * minuteMs, clock, offsets);
        if (due <= cutoff) continue;
        consider(due, candidate, rule, minute);
        found = true;
      }
      if (found) break;
      candidate = rule.days ? rule.days[++dateIndex] ?? null : nextMedicationPhaseDay(phase, candidate + 1);
    }
  }
  return earliest;
}

function nextWater(schedule, after) {
  const { water } = schedule;
  if (!water) return null;
  const clock = timezone(schedule.zone);
  const startAt = Math.max(after, water.pauseUntil - 1);
  const startDay = Math.floor(localWall(startAt, clock) / dayMs);
  const offsets = new Map();
  for (let day = startDay; day <= startDay + 3; day++) {
    if (day === water.goalDay) continue;
    let earliest = Infinity;
    for (let minute = water.start; minute < water.end; minute += water.interval) {
      for (const delay of water.repeat ? [0, water.repeat] : [0]) {
        if (minute + delay >= water.end) continue;
        const at = instantForWall(day * dayMs + (minute + delay) * minuteMs, clock, offsets);
        if (!(at > startAt) || at >= earliest) continue;
        const localMinute = (localWall(at, clock) - day * dayMs) / minuteMs;
        if (localMinute >= water.start && localMinute < water.end) earliest = at;
      }
    }
    if (Number.isFinite(earliest)) return { at: earliest, day };
  }
  return null;
}

export function nextCareReminder(schedule, after) {
  const appointment = schedule.appointments?.find(([at]) => at > after);
  const candidates = [
    ["dose", nextMedicationReminder(schedule, after)],
    ["appointment", appointment && { at: appointment[0], day: appointment[1], expires: appointment[2], details: appointment[3] }],
    ["water", nextWater(schedule, after)],
    ["routine", schedule.routineRules?.length && nextMedicationReminder({ zone: schedule.zone, rules: schedule.routineRules }, after)]
  ].filter(([, next]) => next);
  if (!candidates.length) return null;
  const at = Math.min(...candidates.map(([, next]) => next.at));
  const matching = candidates.filter(([, next]) => next.at === at);
  const details = Object.fromEntries(matching.filter(([, next]) => next.details?.length).map(([kind, next]) => [kind, next.details]));
  const routineId = matching.find(([kind]) => kind === "routine")?.[1].routineId;
  return { at, day: matching[0][1].day, kinds: matching.map(([kind]) => kind),
    ...(Object.keys(details).length ? { details } : {}),
    ...(routineId ? { routineId } : {}),
    appointmentExpires: matching.find(([kind]) => kind === "appointment")?.[1].expires };
}
