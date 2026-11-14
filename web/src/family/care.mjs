import { createCareIndex, doseId, scheduledRoutinesOn } from "../../public/medication/domain/care-index.js";
import { dayMs, timezone, instantForWall, localWall } from "../../public/medication/domain/wall-clock.js";
import { routineComplete, routineLog } from "../../public/medication/domain/routine-plan.js";
import * as engine from "../../public/medication/domain/medication-rules.js";
import { emptyCareRecords } from "../../public/medication/domain/family.js";
import { cycleIsEnabled } from "../../public/medication/domain/profile.js";

export const idPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export const clean = (value, max) => typeof value === "string" && value.length <= max && !/\p{Cc}/u.test(value) ? value.trim() : "";
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const clockMinute = time => typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : -1;

export function applyFamilyChange(snapshot, data, actor, homeZone, now = Date.now()) {
  const records = snapshot ?? emptyCareRecords();
  const clock = timezone(homeZone);
  const today = Math.floor(localWall(now, clock) / dayMs);
  const offsets = new Map();
  const at = (day, minute) => instantForWall(day * dayMs + minute * 60_000, clock, offsets);
  const { day, kind, id, action } = data;
  const scheduledTime = clockMinute(data.time);
  const validDay = integer(day, -719162, 2932896);
  const author = { recordedBy: actor, recordedAt: now };

  if (action === "add") {
    const name = clean(data.name, 100);
    if (!name || !validDay || day < today || day > today + 3660 || scheduledTime < 0) return "invalid";
    if (kind === "medicine") {
      const unit = clean(data.unit, 24);
      if (!unit || !integer(data.amount, 1, 1_000_000_000) || !["once", "daily"].includes(data.repeat)) return "invalid";
      records.medicines[id] = { id, name, unit, stock: null, revision: 1, color: "purple",
        phases: [{ start: day, end: data.repeat === "once" ? day + 1 : null, interval: 1, mask: 127,
          slots: [{ minute: scheduledTime, amount: data.amount }] }], ...author };
    } else if (kind === "visit") {
      records.visits[id] = { id, name, day, time: data.time, zone: homeZone, notes: "", ...author };
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
    cycles[day] = { end, flow: data.flow, note: note.trim(), ...author };
  } else return "invalid";
  return records;
}
