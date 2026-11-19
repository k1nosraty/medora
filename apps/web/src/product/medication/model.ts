import {
  compilePhases,
  createCareIndex,
  doseId,
  doseTime,
  trackSchedule,
} from "@medora/domain/browser/care-index";
import {
  localZone,
  minuteMs,
} from "@medora/domain/browser/care-plan";
import * as engine from "@medora/domain/browser/medication-rules";
import { t } from "../../../product-assets/public/medication/shared/i18n/locale.js";
import { CareInputError } from "../../../product-assets/public/medication/shared/ui/care-error.js";

export interface Phase {
  start: number;
  end: number | null;
  interval: number;
  mask: number;
  slots: { minute: number; amount: number | null }[];
  autoEnd?: boolean;
}

export interface MedicinePlan {
  id: string;
  name: string;
  unit: string;
  phases: Phase[];
  dates?: number[];
  stock?: number | null;
  threshold?: number;
  instructions?: string;
  sharedInstructions?: string;
  icon?: string;
  color?: string;
  phased?: boolean;
  paused?: boolean;
  effectiveFrom?: number;
  stockTrackedFrom?: number;
  revision?: number;
}

export type DoseStatus = "taken" | "skipped" | "snoozed" | null;
export interface Dose {
  medicineId: string;
  day: number;
  minute: number;
  planned: number | null;
  status?: DoseStatus;
  actual?: number | null;
  debit?: number;
  resolvedAt?: number | null;
  snoozeUntil?: number;
  name?: string;
  instructions?: string;
  unit?: string;
  icon?: string;
  color?: string;
  historyPlan?: MedicinePlan;
  recordedBy?: string;
}

export interface MedicationCare {
  medicines: Record<string, MedicinePlan>;
  doses: Record<string, Dose>;
  medicationSnoozeMinutes?: number;
}

export interface MedicineTarget {
  name: string;
  day: number;
  save(plan: MedicinePlan): Promise<void>;
}

export interface FamilyDoseRecord {
  kind: "medicine";
  day: number;
  id: string;
  minute: number;
  amount: number | null;
  title: string;
  unit: string;
}

export const doseStates = {
  taken: t("ui.taken"),
  skipped: t("ui.skipped"),
  snoozed: t("ui.snoozed"),
};

export function hasSlot(
  medicine: MedicinePlan,
  dose: Pick<Dose, "day" | "minute">,
) {
  if (medicine.dates?.length && !medicine.dates.includes(dose.day))
    return false;
  return engine
    .medicationSlots(compilePhases(engine, medicine.phases), dose.day)
    .some((slot: { minuteOfDay: number }) => slot.minuteOfDay === dose.minute);
}

export function deleteSchedule(state: MedicationCare, id: string, now: number) {
  const saved = state.medicines[id];
  if (!saved) return;
  trackSchedule(state, "medicines", saved, null, now);
  for (const [key, dose] of Object.entries(state.doses)) {
    if (dose.medicineId !== id) continue;
    if (
      (!dose.status || dose.status === "snoozed") &&
      doseTime(dose.day, dose.minute) > now
    ) {
      delete state.doses[key];
      continue;
    }
    dose.name ??= saved.name;
    if (saved.instructions !== undefined)
      dose.instructions ??= saved.instructions;
    dose.unit ??= saved.unit;
    if (saved.icon !== undefined) dose.icon = saved.icon;
    if (saved.color !== undefined) dose.color = saved.color;
    if (dose.status === "snoozed") {
      dose.status = null;
      dose.snoozeUntil = 0;
    }
  }
  delete state.medicines[id];
}

export function setPaused(
  state: MedicationCare,
  id: string,
  paused: boolean,
  now: number,
) {
  const saved = state.medicines[id];
  if (!saved)
    throw new CareInputError(
      t("ui.this-schedule-changed-in-another-window-reopen-it-to-edit"),
    );
  if (saved.paused === paused) return;
  const next = { ...saved, paused, revision: (saved.revision ?? 0) + 1 };
  trackSchedule(state, "medicines", saved, next, now);
  state.medicines[id] = next;
}

export function refillStock(state: MedicationCare, id: string, added: number) {
  const saved = state.medicines[id];
  if (!saved || saved.stock == null) {
    throw new CareInputError(
      t("ui.this-schedule-changed-in-another-window-reopen-it-to-edit"),
    );
  }
  saved.stock = engine.updateStock(saved.stock, 0, 0, added);
}

export function recordDose(
  state: MedicationCare,
  dose: Pick<Dose, "medicineId" | "day" | "minute">,
  status: DoseStatus,
  entered: number | null,
  today: number,
  now: number,
) {
  if (status === "taken" && entered === 0)
    throw new CareInputError(t("ui.enter-an-amount-greater-than-zero"));
  const saved = state.medicines[dose.medicineId];
  if (!saved) throw new CareInputError(t("ui.this-schedule-is-paused"));
  const id = doseId(saved, dose.day, dose.minute);
  const existing = state.doses[id];
  const current: Dose | undefined = createCareIndex(
    state,
    engine,
    localZone(),
    today,
  )
    .dosesOn(dose.day)
    .find(
      (slot: Dose) =>
        slot.medicineId === saved.id && slot.minute === dose.minute,
    );
  if (!current)
    throw new CareInputError(t("ui.this-dose-changed-refresh-the-page"));
  const archived = current.historyPlan;
  if (saved.paused && !archived)
    throw new CareInputError(t("ui.this-schedule-is-paused"));
  if (
    status === "snoozed" &&
    (dose.day !== today || archived || !hasSlot(saved, dose))
  ) {
    throw new CareInputError(t("ui.this-dose-can-no-longer-be-snoozed"));
  }
  const planned = current.planned;
  const actual =
    status === "taken" ? (entered ?? existing?.actual ?? planned) : null;
  const scheduled = doseTime(dose.day, dose.minute);
  const tracked =
    saved.stock != null &&
    (existing?.unit ?? archived?.unit ?? saved.unit) === saved.unit &&
    scheduled >= (saved.stockTrackedFrom ?? 0);
  if (tracked && status === "taken" && actual === null) {
    throw new CareInputError(
      t("ui.enter-the-amount-taken-to-deduct-it-from-your-stock"),
    );
  }
  const debit = tracked ? (actual ?? 0) : 0;
  if (saved.stock != null)
    saved.stock = engine.updateStock(
      saved.stock,
      existing?.debit ?? 0,
      debit,
      0,
    );
  const snoozeUntil =
    status === "snoozed"
      ? Math.max(now, scheduled, existing?.snoozeUntil ?? 0) +
        (state.medicationSnoozeMinutes ?? 10) * minuteMs
      : 0;
  const resolvedAt =
    status === "taken" || status === "skipped"
      ? (existing?.resolvedAt ?? now)
      : null;
  const next = {
    ...existing,
    medicineId: saved.id,
    day: dose.day,
    minute: dose.minute,
    planned,
    status,
    actual,
    debit,
    snoozeUntil,
    resolvedAt,
  };
  if (archived) next.unit ??= archived.unit;
  state.doses[id] = next;
}
