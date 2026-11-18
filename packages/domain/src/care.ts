import * as engine from "../../../web/public/medication/domain/medication-rules.js";
import {
  compilePhases,
  createCareIndex,
  doseId,
  doseTime,
} from "../../../web/public/medication/domain/care-index.js";
import {
  routineLog,
  routineOccurs,
} from "../../../web/public/medication/domain/routine-plan.js";
import {
  validSleepRecord,
  sleepConflicts,
} from "../../../web/public/medication/domain/sleep.js";
import { cycleFlows } from "../../../web/public/medication/domain/cycle.js";

export type Fields = Record<string, unknown>;
export const kinds = [
  "medicines",
  "visits",
  "routines",
  "sleepRecords",
  "cycleDays",
] as const;
export type Kind = (typeof kinds)[number];
export interface PlanInput {
  kind: Kind;
  name: string;
  day: number;
  minute: number;
  zone: string;
  start: number;
  end: number;
  flow: string;
  unit: string;
  quantity: string;
  stock: string;
}
export function collection(
  state: Fields,
  kind: string,
): Record<string, Fields> {
  const value = state[kind];
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("invalid_collection");
  return value as Record<string, Fields>;
}
const minuteText = (m: number) =>
  [Math.floor(m / 60), m % 60].map((x) => String(x).padStart(2, "0")).join(":");
export function addPlan(
  state: Fields,
  k: PlanInput,
  id: string,
  at: number,
  today: number,
) {
  const rows = collection(state, k.kind);
  const name = k.name.trim();
  if (
    !Number.isInteger(k.day) ||
    k.day < -719162 ||
    k.day > 2932896 ||
    !Number.isInteger(k.minute) ||
    k.minute < 0 ||
    k.minute > 1439
  )
    throw Error("invalid_date");
  if (
    ["medicines", "routines", "visits"].includes(k.kind) &&
    (!name || name.length > 200)
  )
    throw Error("invalid_name");
  let row: Fields;
  switch (k.kind) {
    case "medicines": {
      const unit = k.unit.trim(),
        amount = k.quantity ? engine.quantityFromText(k.quantity) : null;
      const stock = k.stock ? engine.quantityFromText(k.stock) : null;
      if (
        (k.quantity && (!amount || !unit)) ||
        unit.length > 40 ||
        (k.stock && (stock === null || !amount))
      )
        throw Error("invalid_quantity");
      const phases = [
        {
          start: k.day,
          end: null,
          interval: 1,
          mask: 127,
          slots: [{ minute: k.minute, amount }],
        },
      ];
      if (!engine.validMedicationPhases(compilePhases(engine, phases)))
        throw Error("invalid_schedule");
      row = {
        id,
        name,
        unit,
        phases,
        dates: [],
        paused: false,
        revision: 1,
        stock,
        threshold: 0,
        stockTrackedFrom: stock === null ? 0 : at,
        effectiveFrom: 0,
        icon: "capsule",
        color: "gold",
      };
      break;
    }
    case "routines":
      row = {
        id,
        name,
        category: "health",
        start: k.day,
        interval: 1,
        mask: 127,
        minute: k.minute,
        mode: "done",
        paused: false,
        reminder: false,
        revision: 1,
      };
      break;
    case "visits":
      new Intl.DateTimeFormat("en", { timeZone: k.zone }).format(at);
      row = {
        id,
        name,
        day: k.day,
        time: minuteText(k.minute),
        zone: k.zone,
        offsets: [],
        remindersOff: true,
        cancelled: false,
      };
      break;
    case "sleepRecords":
      row = {
        kind: "main",
        start: k.start,
        end: k.end,
        zone: k.zone,
        quality: "",
        note: k.name,
      };
      if (
        !validSleepRecord(row) ||
        k.end > at ||
        sleepConflicts(rows, row, null)
      )
        throw Error("invalid_sleep");
      break;
    case "cycleDays":
      if (!cycleFlows.includes(k.flow) || k.day > today || k.name.length > 500)
        throw Error("invalid_cycle");
      id = String(k.day);
      row = {
        ...rows[id],
        flow: k.flow,
        symptoms: rows[id]?.symptoms ?? {},
        note: k.name,
      };
      break;
  }
  state[k.kind] = { ...rows, [id]: row };
}
export function timeline(
  state: Fields,
  day: number,
  zone: string,
  today: number,
) {
  const model = {
    ...state,
    medicines: collection(state, "medicines"),
    doses: collection(state, "doses"),
  };
  return createCareIndex(model, engine, zone, today).dosesOn(day) as Array<{
    medicineId: string;
    day: number;
    minute: number;
    planned: number | null;
    status?: string;
    historyPlan?: Fields;
  }>;
}
export function markDose(
  state: Fields,
  id: string,
  day: number,
  minute: number,
  status: "taken" | "skipped",
  zone: string,
  today: number,
  now: number,
) {
  if (day > today) throw Error("future");
  const medicines = collection(state, "medicines"),
    medicine = medicines[id];
  const dose = timeline(state, day, zone, today).find(
    (d) => d.medicineId === id && d.minute === minute,
  );
  if (!dose || !medicine || (medicine.paused && !dose.historyPlan))
    throw Error("stale_plan");
  const doses = collection(state, "doses"),
    key = doseId(medicine, day, minute),
    prior = doses[key];
  const actual = status === "taken" ? (prior?.actual ?? dose.planned) : null;
  const tracked =
    medicine.stock != null &&
    (prior?.unit ?? dose.historyPlan?.unit ?? medicine.unit) ===
      medicine.unit &&
    doseTime(day, minute) >= Number(medicine.stockTrackedFrom ?? 0);
  if (tracked && status === "taken" && typeof actual !== "number")
    throw Error("amount_required");
  const debit = tracked ? (actual ?? 0) : 0;
  if (medicine.stock != null)
    medicine.stock = engine.updateStock(
      medicine.stock,
      prior?.debit ?? 0,
      debit,
      0,
    );
  doses[key] = {
    ...prior,
    medicineId: id,
    day,
    minute,
    status,
    planned: dose.planned,
    actual,
    debit,
    snoozeUntil: 0,
    resolvedAt: prior?.resolvedAt ?? now,
    ...(dose.historyPlan && { unit: prior?.unit ?? dose.historyPlan.unit }),
  };
  state.doses = doses;
}
export function completeRoutine(state: Fields, id: string, day: number) {
  const plan = collection(state, "routines")[id];
  if (!plan || plan.paused || plan.mode !== "done" || !routineOccurs(plan, day))
    throw Error("routine_unavailable");
  const log = routineLog(plan, true);
  if (!log) throw Error("routine_unavailable");
  const logs = collection(state, "routineLogs");
  state.routineLogs = { ...logs, [day]: { ...logs[day], [id]: log } };
}
