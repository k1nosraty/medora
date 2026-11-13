import * as engine from "../../domain/medication-rules.js";
import { compilePhases, doseTime } from "../../domain/care-index.js";
import { dayNumber, localDayNumber } from "../../shared/ui/dates.js";

export function nextPlannedDose(phases, dates = [], notBefore = 0, excluded = () => false) {
  const now = Date.now();
  const earliest = new Date(Math.max(now, notBefore));
  if (earliest.getFullYear() > 9999) return null;
  const compiled = compilePhases(engine, phases);
  const find = (day, slots) => slots.find(slot => {
    const at = doseTime(day, slot.minuteOfDay);
    return at > now && at >= notBefore && !excluded(day, slot.minuteOfDay);
  });
  const first = localDayNumber(earliest);
  const last = dayNumber("9999-12-31");
  if (dates.length) {
    for (const day of dates) {
      if (day < first) continue;
      const slot = find(day, engine.medicationSlots(compiled, day));
      if (slot) return { day, slot };
    }
  } else {
    for (const phase of compiled) {
      let day = engine.nextMedicationPhaseDay(phase, first);
      while (day !== null && day <= last) {
        const slot = find(day, phase.slots);
        if (slot) return { day, slot };
        day = engine.nextMedicationPhaseDay(phase, day + 1);
      }
    }
  }
  return null;
}
