import { compilePhases, createCareIndex, doseId, scheduledRoutinesOn } from "../../../domain/src/browser/care-index.js";
import { dayMs, timezone, instantForWall, localWall } from "../../../domain/src/browser/wall-clock.js";
import { maxRoutines, routineComplete, routineLog } from "../../../domain/src/browser/routine-plan.js";
import * as engine from "../../../domain/src/browser/medication-rules.js";
import { emptyCareRecords } from "../../../domain/src/browser/family.js";
import { cycleIsEnabled } from "../../../domain/src/browser/profile.js";
import { validatePortable } from "../../../domain/src/browser/care-records.js";

export const idPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export const clean = (value, max) => typeof value === "string" && value.length <= max && !/\p{Cc}/u.test(value) ? value.trim() : "";
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const clockMinute = time => typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : -1;

function planFor(data, zone) {
  const { plan, kind, id } = data;
  const name = clean(plan?.name, 120);
  if (!name || typeof plan !== "object" || Array.isArray(plan)) return null;
  const dateAllowed = value => integer(value, -719162, 2932896);
  const present = (value, max) => value == null || typeof value === "string" && value.length <= max;
  const asset = value => typeof value === "string" && /^[a-z0-9-]{1,48}$/.test(value);
  let scope, row;
  if (kind === "medicine") {
    const { phases, dates, stock, threshold, unit, instructions, icon, color, phased } = plan;
    if (!Array.isArray(phases) || !phases.length || phases.length > 50 ||
        !phases.every(phase => phase && dateAllowed(phase.start) && (phase.end === null || integer(phase.end, phase.start + 1, 2932896)) &&
          integer(phase.interval, 1, 52) && integer(phase.mask, 1, 127) && Array.isArray(phase.slots) &&
          phase.slots.length > 0 && phase.slots.length <= 12 &&
          phase.slots.every(slot => slot && integer(slot.minute, 0, 1439) &&
            (slot.amount === null ? stock === null : integer(slot.amount, 1, 1_000_000_000) && Boolean(unit)))) ||
        !Array.isArray(dates) || !dates.every(dateAllowed) || !present(unit, 32) ||
        !present(instructions, 2000) || (stock !== null && !integer(stock, 0, 1_000_000_000)) ||
        !integer(threshold, 0, Number.MAX_SAFE_INTEGER) || !asset(icon) || !asset(color)) return null;
    scope = "medicines";
    row = { id, name, unit, sharedInstructions: instructions, stock, threshold, icon, color, phased: phased === true, revision: 1, dates,
      phases: phases.map(({ start, end, interval, mask, slots, autoEnd }) => ({ start, end, interval, mask,
        slots: slots.map(({ minute, amount }) => ({ minute, amount })), ...(autoEnd === true && { autoEnd }) })) };
  } else if (kind === "visit") {
    const { day, time, place, note, contact, category, color, categoryName, offsets = [], remindersOff } = plan;
    if (!dateAllowed(day) || !present(place, 200) || !present(note, 2000) || !present(contact, 160) ||
        !present(categoryName, 100) || !asset(category) || !asset(color) ||
        !Array.isArray(offsets) || offsets.length > 20 || !present(plan.zone, 64)) return null;
    scope = "visits";
    row = { id, name, day, time, place, sharedNote: note, sharedContact: contact, category, color, categoryName, offsets,
      zone: plan.zone || zone, cancelled: false, remindersOff: remindersOff === true };
  } else if (kind === "routine") {
    const { start, mask, interval, minute, reminder, mode, notes, target, unit, steps, category, color } = plan;
    if (!dateAllowed(start) || !asset(category) || !asset(color) || !present(notes, 2000) || !present(unit, 40) ||
        (steps !== undefined && (!Array.isArray(steps) || !steps.every(step => present(step, 70)))) ||
        (reminder === true && minute === null)) return null;
    scope = "routines";
    row = { id, name, start, mask, interval, minute, reminder: reminder === true, mode, sharedNotes: notes, category, color, paused: false, revision: 1,
      ...(mode === "quantity" && { target, unit }), ...(mode === "steps" && { steps }) };
  } else return null;
  try {
    const sample = emptyCareRecords();
    sample[scope][id] = row;
    validatePortable(sample, phases => engine.validMedicationPhases(compilePhases(engine, phases)));
    return { scope, row };
  } catch { return null; }
}

export function applyFamilyChange(snapshot, data, actor, homeZone, now = Date.now(), displayName) {
  const records = snapshot ?? emptyCareRecords();
  const clock = timezone(homeZone);
  const today = Math.floor(localWall(now, clock) / dayMs);
  const offsets = new Map();
  const at = (day, minute) => instantForWall(day * dayMs + minute * 60_000, clock, offsets);
  const { day, kind, id, action } = data;
  const scheduledTime = clockMinute(data.time);
  const validDay = integer(day, -719162, 2932896);
  const author = { recordedBy: actor, recordedAt: now, recordedByName: displayName || null };

  if (action === "add") {
    if (kind === "routine" && Object.keys(records.routines).length >= maxRoutines) return "limit";
    if (data.plan !== undefined) {
      const entry = planFor(data, homeZone);
      if (!entry) return "invalid";
      records[entry.scope][id] = { ...entry.row, ...author };
      return records;
    }
    const name = clean(data.name, 100);
    if (!name || !validDay || day < today || day > today + 3660 || scheduledTime < 0) return "invalid";
    if (kind === "medicine") {
      const unit = clean(data.unit, 24);
      if (!unit || !integer(data.amount, 1, 1_000_000_000) || !["once", "daily"].includes(data.repeat)) return "invalid";
      records.medicines[id] = { id, name, unit, stock: null, revision: 1, color: "purple",
        phases: [{ start: day, end: data.repeat === "once" ? day + 1 : null, interval: 1, mask: 127,
          slots: [{ minute: scheduledTime, amount: data.amount }] }], ...author };
    } else if (kind === "visit") {
      records.visits[id] = { id, name, day, time: data.time, zone: homeZone, ...author };
    } else if (kind === "routine") {
      records.routines[id] = { id, name, start: day, interval: 1, mask: 127, minute: scheduledTime, category: "custom",
        mode: "done", color: "coral", paused: false, reminder: false, revision: 1, ...author };
    } else return "invalid";
    return records;
  }

  if (!validDay || day > today) return "invalid";
  if (kind === "medicine") {
    if (!integer(data.minute, 0, 1439) || !["taken", "skipped"].includes(data.status) ||
        (data.status === "taken" && at(day, data.minute) > now)) return "invalid";
    const medicine = Object.hasOwn(records.medicines, id) && records.medicines[id];
    if (!medicine) return "missing";
    const slot = createCareIndex(records, engine, homeZone, today, at).dosesOn(day)
      .find(dose => dose.medicineId === id && dose.minute === data.minute);
    if (!slot || (medicine.paused && !slot.historyPlan)) return "missing";
    const key = doseId(medicine, day, data.minute);
    const existing = records.doses[key];
    if (existing?.status === "taken" || existing?.status === "skipped") return "already_recorded";
    const actual = data.status === "taken" ? data.amount ?? slot.planned : null;
    if (actual !== null && !integer(actual, 1, 1_000_000_000)) return "invalid";
    const track = medicine.stock != null && (existing?.unit ?? slot.historyPlan?.unit ?? medicine.unit) === medicine.unit &&
      at(day, data.minute) >= (medicine.stockTrackedFrom ?? 0);
    if (track && data.status === "taken" && actual === null) return "invalid";
    const debit = track ? actual ?? 0 : 0;
    if (medicine.stock != null) {
      try { medicine.stock = engine.updateStock(medicine.stock, existing?.debit ?? 0, debit, 0); }
      catch { return "invalid"; }
    }
    records.doses[key] = { ...existing, medicineId: id, day, minute: data.minute, planned: slot.planned,
      actual, status: data.status, debit, snoozeUntil: 0, resolvedAt: now, ...author };
    if (slot.historyPlan?.unit) records.doses[key].unit = slot.historyPlan.unit;
  } else if (kind === "water") {
    if (!integer(data.amount, 1, 10000) || scheduledTime < 0) return "invalid";
    records.water.push({ id, day, amount: data.amount, time: data.time, ...author });
  } else if (kind === "visit") {
    const visit = Object.hasOwn(records.visits, id) && records.visits[id];
    const local = createCareIndex(records, engine, homeZone, today, at).visitsOn(day).some(row => row.visit.id === id);
    if (!visit || !local || visit.cancelled) return "missing";
    if (visit.completed) return "already_recorded";
    Object.assign(visit, { completed: true, resolvedAt: now, ...author });
  } else if (kind === "routine") {
    const dayLogs = records.routineLogs[day] ??= {};
    const plan = scheduledRoutinesOn(records, day, undefined, at).get(id);
    if (!plan && !Object.hasOwn(dayLogs, id)) return "missing";
    const previous = Object.hasOwn(dayLogs, id) && dayLogs[id];
    if (previous && routineComplete(previous)) return "already_recorded";
    const entry = routineLog(previous || plan, data.result);
    if (!entry) return "invalid";
    dayLogs[id] = { ...entry, ...(routineComplete(entry) && { resolvedAt: now }), ...author };
  } else if (kind === "cycle") {
    if (!cycleIsEnabled(records.settings)) return "invalid";
    const end = data.end ?? null;
    const note = data.note ?? "";
    if ((end !== null && !integer(end, day, today)) || !["", "light", "medium", "heavy"].includes(data.flow) ||
        typeof note !== "string" || note.length > 500) return "invalid";
    const cycles = records.cycleRecords ??= {};
    if (Object.hasOwn(cycles, day)) return "already_recorded";
    cycles[day] = { end, flow: data.flow, ...(note.trim() && { sharedNote: note.trim() }), ...author };
  } else return "invalid";
  return records;
}
