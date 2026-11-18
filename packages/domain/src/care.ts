import { visitInstant } from "../../../web/public/medication/domain/care-plan.js";
import {
  localWall,
  timezone,
  dayMs,
} from "../../../web/public/medication/domain/wall-clock.js";
import * as engine from "../../../web/public/medication/domain/medication-rules.js";
import {
  compilePhases,
  createCareIndex,
  trackSchedule,
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

import { collection, type Fields } from "./collections";
export { collection, type Fields } from "./collections";
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
  sleepKind?: string;
  quality?: string;
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
        kind: k.sleepKind ?? "main",
        start: k.start,
        end: k.end,
        zone: k.zone,
        quality: k.quality ?? "",
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

export function setPaused(
  state: Fields,
  kind: "medicines" | "routines",
  id: string,
  pause: boolean,
  now: number,
) {
  const rows = collection(state, kind),
    old = rows[id];
  if (!old) throw Error("missing_plan");
  if (Boolean(old.paused) === pause) return;
  const next = {
    ...old,
    paused: pause,
    revision: Number(old.revision ?? 0) + 1,
  };
  trackSchedule(state, kind, old, next, now);
  rows[id] = next;
}
export function addStock(state: Fields, id: string, amount: string) {
  const row = collection(state, "medicines")[id],
    size = engine.quantityFromText(amount);
  if (!row || typeof row.stock !== "number" || !size || size <= 0)
    throw Error("invalid_quantity");
  row.stock = engine.updateStock(row.stock, 0, 0, size);
}
export function visitDay(row: Fields, zone: string) {
  return Math.floor(
    localWall(visitInstant(row, zone, new Map()), timezone(zone)) / dayMs,
  );
}
export function changeVisit(
  state: Fields,
  id: string,
  action: "cancel" | "restore" | "attend" | "unattend",
  today: number,
  zone: string,
  now: number,
) {
  const row = collection(state, "visits")[id];
  if (!row) throw Error("missing_visit");
  if (action === "attend" || action === "unattend") {
    if (row.cancelled || visitDay(row, zone) > today)
      throw Error("invalid_visit");
    row.completed = action === "attend";
    if (row.completed) row.resolvedAt ??= now;
    else delete row.resolvedAt;
  } else {
    row.cancelled = action === "cancel";
    if (row.cancelled) {
      delete row.completed;
      delete row.resolvedAt;
    }
  }
}
export function agenda(
  state: Fields,
  day: number,
  zone: string,
  today: number,
) {
  const medicines = collection(state, "medicines");
  const index = createCareIndex(
    { ...state, medicines, doses: collection(state, "doses") },
    engine,
    zone,
    today,
  );
  type Item = {
    id: string;
    kind: "medicines" | "visits" | "routines";
    label: string;
    time: string;
  };
  const items: Item[] = [];
  for (const d of index.dosesOn(day))
    items.push({
      id: String(d.medicineId) + "-" + d.minute,
      kind: "medicines",
      label: String(
        d.historyPlan?.name ?? medicines[d.medicineId]?.name ?? d.medicineId,
      ),
      time: minuteText(d.minute),
    });
  for (const v of index.visitsOn(day))
    if (!v.visit.cancelled)
      items.push({
        id: v.visit.id,
        kind: "visits",
        label: v.visit.name,
        time: v.time,
      });
  for (const r of index.routinesOn(day))
    items.push({
      id: r.id,
      kind: "routines",
      label: r.name,
      time: r.minute == null ? "" : minuteText(r.minute),
    });
  return items.sort(
    (a, b) =>
      (a.time || "24:00").localeCompare(b.time || "24:00") ||
      a.id.localeCompare(b.id),
  );
}
