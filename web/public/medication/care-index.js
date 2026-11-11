import { dayMs, timezone, localWall } from "./wall-clock.js";
import { routineComplete, routineEntriesOn, routineOccurs } from "./routine-plan.js";
import { visitInstant } from "./care-plan.js";

export const isoDay = day => new Date(day * dayMs).toISOString().slice(0, 10);
export const timeText = minute => [Math.floor(minute / 60), minute % 60].map(part => String(part).padStart(2, "0")).join(":");
export const doseId = (medicine, day, minute) => `${medicine.id}|${day}|${minute}`;
export const doseTime = (day, minute) => new Date(`${isoDay(day)}T${timeText(minute)}:00`).getTime();

export function trackSchedule(state, kind, previous, next, at) {
  if (!previous) return;
  const fields = kind === "medicines" ? ["phases", "dates", "paused"] :
    ["start", "mask", "interval", "minute", "mode", "target", "unit", "steps", "paused"];
  if (next && fields.every(field => JSON.stringify(previous[field]) === JSON.stringify(next[field]))) {
    if (previous.scheduleFrom !== undefined) next.scheduleFrom = previous.scheduleFrom;
    return;
  }
  if (!previous.paused && (previous.scheduleFrom ?? -Infinity) < at) {
    const history = (state.scheduleHistory ??= {});
    const versions = (history[kind] ??= []);
    versions.push({ until: at, plan: { ...previous } });
  }
  if (next) next.scheduleFrom = at;
}

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

export function createCareIndex(state, engine, zone, today = Math.floor(localWall(Date.now(), timezone(zone)) / dayMs)) {
  let recorded;
  let active;
  let visits;
  let visitDays;
  let waterDays;
  let waterTotals;
  const scheduled = new Map();
  const routineDays = new Map();
  const routineCalendar = new Map();
  const plans = Object.values(state.routines ?? {});
  let previousMedicines;

  function recordedOn(day) {
    recorded ??= groupByDay(Object.entries(state.doses), ([, dose]) => dose.day);
    return recorded.get(day) ?? [];
  }

  function activePlans() {
    return active ??= Object.values(state.medicines).filter(medicine => !medicine.paused).map(medicine => compilePlan(medicine));
  }

  function compilePlan(medicine, until) {
    return { medicine, until, phases: compilePhases(engine, medicine.phases),
      dates: medicine.dates?.length ? new Set(medicine.dates) : null };
  }

  function slotsOn({ medicine, phases, dates, until }, day) {
    if (dates && !dates.has(day)) return [];
    const from = Math.max(medicine.effectiveFrom ?? 0, medicine.scheduleFrom ?? 0);
    if ((until !== undefined && doseTime(day, 0) >= until) || (from && doseTime(day, 1439) < from)) return [];
    const slots = engine.medicationSlots(phases, day);
    return from || until !== undefined ? slots.filter(slot => {
      const at = doseTime(day, slot.minuteOfDay);
      return (!from || at >= from) && (until === undefined || at < until);
    }) : slots;
  }

  function isRecorded(dose) {
    return dose.imported || dose.status || !state.medicines[dose.medicineId];
  }

  function collectDoses(day) {
    const doses = new Map();
    function addSlots(plan) {
      const { medicine, until } = plan;
      for (const slot of slotsOn(plan, day)) {
        doses.set(doseId(medicine, day, slot.minuteOfDay),
          { medicineId: medicine.id, day, minute: slot.minuteOfDay, planned: slot.milliUnits,
            ...(until === undefined ? {} : { historyPlan: medicine }) });
      }
    }
    previousMedicines ??= (state.scheduleHistory?.medicines ?? []).map(({ plan, until }) => compilePlan(plan, until));
    for (const plan of previousMedicines) addSlots(plan);
    for (const plan of activePlans()) addSlots(plan);
    for (const [id, dose] of recordedOn(day)) {
      if (isRecorded(dose) || doses.has(id)) {
        const historyPlan = doses.get(id)?.historyPlan;
        doses.set(id, historyPlan ? { ...dose, historyPlan } : dose);
      }
    }
    return [...doses.values()];
  }

  function dosesOn(day) {
    if (!scheduled.has(day)) scheduled.set(day, collectDoses(day).sort((a, b) => a.minute - b.minute));
    return scheduled.get(day);
  }

  function hasDoses(day) {
    return (scheduled.get(day)?.length ?? collectDoses(day).length) > 0;
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

  function doseTotals(first, last, now = Date.now()) {
    let taken = 0;
    let skipped = 0;
    let unrecorded = 0;
    for (let day = first; day <= last; day++) {
      for (const dose of scheduled.get(day) ?? collectDoses(day)) {
        if (dose.status === "taken") taken++;
        else if (dose.status === "skipped") skipped++;
        else {
          const due = dose.status === "snoozed" && dose.snoozeUntil ? dose.snoozeUntil : doseTime(day, dose.minute);
          if (due <= now) unrecorded++;
        }
      }
    }
    return { taken, skipped, unrecorded };
  }

  function routinesOn(day) {
    if (!routineDays.has(day)) {
      routineDays.set(day, routineEntriesOn(state, day, today, plans));
    }
    return routineDays.get(day);
  }

  function calendarRoutinesOn(day) {
    if (routineCalendar.has(day)) return routineCalendar.get(day);
    const entries = new Map();
    const scheduledAt = plan => doseTime(day, plan.minute ?? 1439);
    for (const { plan, until } of state.scheduleHistory?.routines ?? []) {
      if (routineOccurs(plan, day) && scheduledAt(plan) < until && scheduledAt(plan) >= (plan.scheduleFrom ?? -Infinity)) {
        entries.set(plan.id, { ...plan, historical: true });
      }
    }
    for (const plan of plans) {
      if (routineOccurs(plan, day) && (!plan.scheduleFrom || scheduledAt(plan) >= plan.scheduleFrom)) entries.set(plan.id, plan);
    }
    for (const [id, entry] of Object.entries(state.routineLogs?.[day] ?? {})) entries.set(id, { ...entry, id });
    const result = [...entries.values()];
    routineCalendar.set(day, result);
    return result;
  }

  function routineTotals(first, last, now = Date.now()) {
    let completed = 0;
    let partial = 0;
    let scheduled = 0;
    let activeDays = 0;
    for (let day = first; day <= last; day++) {
      const logs = state.routineLogs?.[day] ?? {};
      if (Object.keys(logs).length) activeDays++;
      for (const entry of calendarRoutinesOn(day)) {
        if (routineComplete(entry)) completed++;
        else if (Object.hasOwn(logs, entry.id)) partial++;
        else if (day < today || (entry.minute != null && doseTime(day, entry.minute) <= now)) scheduled++;
      }
    }
    return { completed, partial, unrecorded: scheduled, activeDays };
  }

  function visitTotals(first, last, now = Date.now()) {
    const totals = { attended: 0, unrecorded: 0, upcoming: 0, cancelled: 0 };
    for (const { visit, day, instant } of allVisits()) {
      if (day < first || day > last) continue;
      totals[visit.cancelled ? "cancelled" : visit.completed ? "attended" : instant <= now ? "unrecorded" : "upcoming"]++;
    }
    return totals;
  }

  return { zone, routinesOn, calendarRoutinesOn, routineTotals, dosesOn, hasDoses, allVisits, visitsOn, visitTotals, waterOn, waterTotal, doseTotals };
}
