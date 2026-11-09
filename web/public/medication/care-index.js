import { dayMs, timezone, localWall } from "./wall-clock.js";
import { visitInstant } from "./care-plan.js";

export const isoDay = day => new Date(day * dayMs).toISOString().slice(0, 10);
export const timeText = minute => [Math.floor(minute / 60), minute % 60].map(part => String(part).padStart(2, "0")).join(":");
export const doseId = (medicine, day, minute) => `${medicine.id}|${day}|${minute}`;
export const doseTime = (day, minute) => new Date(`${isoDay(day)}T${timeText(minute)}:00`).getTime();

export function compilePhases(engine, phases) {
  return phases.map(phase => new engine.WebPhase(
    phase.start, phase.end, phase.interval, phase.mask,
    phase.slots.map(slot => new engine.WebSlot(slot.minute, slot.amount))
  ));
}

function groupByDay(records, dayOf) {
  const days = new Map();
  for (const record of records) {
    const day = dayOf(record);
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(record);
  }
  return days;
}

export function createCareIndex(state, engine, zone) {
  let recorded;
  let active;
  let visits;
  let visitDays;
  let waterDays;
  let waterTotals;
  const scheduled = new Map();

  function recordedOn(day) {
    recorded ??= groupByDay(Object.entries(state.doses), ([, dose]) => dose.day);
    return recorded.get(day) ?? [];
  }

  function activePlans() {
    return active ??= Object.values(state.medicines).filter(medicine => !medicine.paused).map(medicine => ({
      medicine, phases: compilePhases(engine, medicine.phases),
      dates: medicine.dates?.length ? new Set(medicine.dates) : null
    }));
  }

  function slotsOn({ medicine, phases, dates }, day) {
    if (dates && !dates.has(day)) return [];
    const slots = engine.medicationSlots(phases, day);
    return medicine.effectiveFrom ? slots.filter(slot => doseTime(day, slot.minuteOfDay) >= medicine.effectiveFrom) : slots;
  }

  function isRecorded(dose) {
    return dose.imported || dose.status || !state.medicines[dose.medicineId];
  }

  function dosesOn(day) {
    if (scheduled.has(day)) return scheduled.get(day);
    const doses = new Map();
    for (const plan of activePlans()) {
      const { medicine } = plan;
      for (const slot of slotsOn(plan, day)) {
        doses.set(doseId(medicine, day, slot.minuteOfDay),
          { medicineId: medicine.id, day, minute: slot.minuteOfDay, planned: slot.milliUnits });
      }
    }
    for (const [id, dose] of recordedOn(day)) {
      if (isRecorded(dose) || doses.has(id)) doses.set(id, dose);
    }
    const ordered = [...doses.values()].sort((a, b) => a.minute - b.minute);
    scheduled.set(day, ordered);
    return ordered;
  }

  function hasDoses(day) {
    if (scheduled.has(day)) return scheduled.get(day).length > 0;
    return recordedOn(day).some(([, dose]) => isRecorded(dose)) ||
      activePlans().some(plan => slotsOn(plan, day).length > 0);
  }

  function allVisits() {
    if (visits) return visits;
    const clocks = new Map();
    const clock = timezone(zone);
    visits = Object.values(state.visits ?? {}).map(visit => {
      const instant = visitInstant(visit, zone, clocks);
      const wall = localWall(instant, clock);
      return { visit, instant, day: Math.floor(wall / dayMs), time: new Date(wall).toISOString().slice(11, 16) };
    });
    return visits;
  }

  function visitsOn(day) {
    visitDays ??= groupByDay(allVisits(), visit => visit.day);
    return visitDays.get(day) ?? [];
  }

  function waterOn(day) {
    waterDays ??= groupByDay(state.water ?? [], entry => entry.day);
    return waterDays.get(day) ?? [];
  }

  function waterTotal(day) {
    waterTotals ??= new Map();
    if (!waterTotals.has(day)) waterTotals.set(day, waterOn(day).reduce((sum, entry) => sum + entry.amount, 0));
    return waterTotals.get(day);
  }

  function doseTotals(first, last) {
    let taken = 0;
    let recorded = 0;
    for (let day = first; day <= last; day++) {
      for (const [, dose] of recordedOn(day)) {
        if (dose.status === "taken") taken++;
        if (dose.status === "taken" || dose.status === "skipped") recorded++;
      }
    }
    return { taken, recorded };
  }

  return { zone, dosesOn, hasDoses, allVisits, visitsOn, waterOn, waterTotal, doseTotals };
}
