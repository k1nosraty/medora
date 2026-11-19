const MAX_QUANTITY = 1_000_000_000;
const MAX_DAY = 2_147_483_647;

export class WebSlot {
  constructor(minuteOfDay, milliUnits) {
    this.minuteOfDay = minuteOfDay;
    this.milliUnits = milliUnits;
  }
}

export class WebPhase {
  constructor(startDay, endBeforeDay, intervalWeeks, weekdayMask, slots) {
    Object.assign(this, { startDay, endBeforeDay, intervalWeeks, weekdayMask, slots });
  }
}

const integerIn = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

function occurs(phase, day) {
  if (day < phase.startDay || (phase.endBeforeDay != null && day >= phase.endBeforeDay)) return false;
  const weekday = ((day + 3) % 7 + 7) % 7;
  return Math.floor((day - phase.startDay) / 7) % phase.intervalWeeks === 0 &&
    (phase.weekdayMask & (1 << weekday)) !== 0;
}

export function validMedicationPhases(phases) {
  return Array.isArray(phases) && phases.length >= 1 && phases.length <= 50 &&
    phases.every((phase, index) => {
      const next = phases[index + 1];
      return phase && integerIn(phase.intervalWeeks, 1, 52) && integerIn(phase.weekdayMask, 1, 127) &&
        (phase.endBeforeDay == null || phase.endBeforeDay > phase.startDay) &&
        (!next || (phase.endBeforeDay != null && phase.endBeforeDay <= next.startDay)) &&
        Array.isArray(phase.slots) && phase.slots.length >= 1 && phase.slots.length <= 12 &&
        phase.slots.every((slot, i, slots) => slot && integerIn(slot.minuteOfDay, 0, 1439) &&
          (i === 0 || slots[i - 1].minuteOfDay < slot.minuteOfDay) &&
          (slot.milliUnits == null || integerIn(slot.milliUnits, 1, MAX_QUANTITY)));
    });
}

export function medicationSlots(phases, day) {
  const phase = phases.find(candidate => occurs(candidate, day));
  return phase ? phase.slots.map(slot => new WebSlot(slot.minuteOfDay, slot.milliUnits)) : [];
}

export function nextMedicationPhaseDay(phase, fromDay) {
  const first = Math.max(phase.startDay, fromDay);
  const period = 7 * phase.intervalWeeks;
  if (period < 7) return null;
  const position = (first - phase.startDay) % period;
  const nextPeriod = first + period - position;
  for (const [start, end] of [[first, first + 7 - position], [nextPeriod, nextPeriod + 7]]) {
    for (let day = start; day < end && day <= MAX_DAY; day += 1) {
      if (occurs(phase, day)) return day;
    }
  }
  return null;
}

export function updateStock(balance, previousDebit, newDebit, added) {
  if (![previousDebit, newDebit, added].every(value => integerIn(value, 0, MAX_QUANTITY))) {
    throw new RangeError("Invalid stock adjustment");
  }
  const result = balance + previousDebit - newDebit + added;
  if (!integerIn(result, -MAX_QUANTITY, MAX_QUANTITY)) throw new RangeError("Stock out of range");
  return result;
}

export function isLowStock(balance, threshold, nextAmount) {
  return balance <= threshold || balance < nextAmount;
}

export function quantityFromText(text) {
  const normalized = text.trim().replace(/[۰-۹٠-٩٫]/g, char => char === "٫" ? "." : String(char.charCodeAt(0) & 15));
  if (!/^[0-9]{1,7}(\.[0-9]{1,3})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const result = Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
  return result <= MAX_QUANTITY ? result : null;
}

export function quantityToText(milliUnits) {
  const amount = Math.abs(milliUnits);
  const fraction = String(amount % 1000).padStart(3, "0").replace(/0+$/, "");
  return (milliUnits < 0 ? "-" : "") + Math.floor(amount / 1000) + (fraction ? "." + fraction : "");
}
