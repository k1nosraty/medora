import { WebPhase, WebSlot, nextMedicationPhaseDay, validMedicationPhases } from "../public/care-engine/care-core.mjs";

const minuteMs = 60_000;
const dayMs = 86_400_000;
const validDay = day => Number.isInteger(day) && day >= 0 && day <= 120_000;
const validMinute = minute => Number.isInteger(minute) && minute >= 0 && minute < 1440;

function timezone(zone) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, calendar: "gregory", numberingSystem: "latn", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
  });
}

function localWall(at, clock) {
  const part = Object.fromEntries(clock.formatToParts(at).map(({ type, value }) => [type, Number(value)]));
  return Date.UTC(part.year, part.month - 1, part.day, part.hour, part.minute);
}

function instantForWall(wall, clock, offsetsByDay) {
  const day = Math.floor(wall / dayMs);
  let offsets = offsetsByDay.get(day);
  if (!offsets) {
    offsets = new Set([-dayMs, 0, 2 * dayMs].map(delta => {
      const probe = day * dayMs + delta;
      return localWall(probe, clock) - probe;
    }));
    offsetsByDay.set(day, offsets);
  }
  const options = [...offsets].map(offset => wall - offset).sort((a, b) => a - b);
  // During a repeated hour use its earlier instant. Move a missing local time forward by the gap.
  const mapped = options.map(at => ({ at, difference: localWall(at, clock) - wall }));
  return mapped.find(option => option.difference === 0)?.at ??
    mapped.filter(option => option.difference > 0).sort((a, b) => a.difference - b.difference)[0]?.at;
}

function phaseOf(rule) {
  return new WebPhase(rule.start, rule.end, rule.interval, rule.mask, rule.minutes.map(minute => new WebSlot(minute, null)));
}

export function validSchedule(body) {
  if (typeof body?.zone !== "string" || body.zone.length > 64 || !/^[A-Za-z0-9_+/-]+$/.test(body.zone) ||
      !Array.isArray(body.rules) || body.rules.length > 100) return null;
  try { timezone(body.zone); } catch { return null; }
  let skips = 0;
  const rules = [];
  for (const rule of body.rules) {
    if (!validDay(rule?.start) || (rule.end !== null && !validDay(rule.end)) ||
        !Number.isInteger(rule.interval) || !Number.isInteger(rule.mask) || !Array.isArray(rule.minutes) ||
        rule.minutes.length < 1 || rule.minutes.length > 12 || !rule.minutes.every(validMinute) ||
        !Array.isArray(rule.skip)) return null;
    skips += rule.skip.length;
    if (skips > 256 || !rule.skip.every(pair => Array.isArray(pair) && pair.length === 2 && validDay(pair[0]) && validMinute(pair[1]))) return null;
    const clean = { start: rule.start, end: rule.end, interval: rule.interval, mask: rule.mask, minutes: rule.minutes, skip: rule.skip };
    if (!validMedicationPhases([phaseOf(clean)])) return null;
    rules.push(clean);
  }
  return { zone: body.zone, rules };
}

export function nextMedicationReminder(schedule, after) {
  const clock = timezone(schedule.zone);
  const day = Math.floor(localWall(after, clock) / dayMs);
  const offsets = new Map();
  let earliest = null;
  for (const rule of schedule.rules) {
    const phase = phaseOf(rule);
    const skip = new Set(rule.skip.map(pair => pair.join(":")));
    let candidate = nextMedicationPhaseDay(phase, day);
    while (candidate !== null && validDay(candidate)) {
      let at = null;
      for (const minute of rule.minutes) {
        if (skip.has(`${candidate}:${minute}`)) continue;
        const due = instantForWall(candidate * dayMs + minute * minuteMs, clock, offsets);
        if (due > after && (at === null || due < at)) at = due;
      }
      if (at !== null) {
        if (!earliest || at < earliest.at) earliest = { at, day: candidate };
        break;
      }
      candidate = nextMedicationPhaseDay(phase, candidate + 1);
    }
  }
  return earliest;
}
