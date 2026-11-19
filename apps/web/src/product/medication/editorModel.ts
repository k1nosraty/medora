import {
  compilePhases,
  isoDay,
  timeText,
} from "@medora/domain/browser/care-index";
import { clockMinute } from "@medora/domain/browser/care-plan";
import * as engine from "@medora/domain/browser/medication-rules";
import {
  amountText,
  quantity,
} from "../../../product-assets/public/medication/features/medicines/quantity.js";
import { t } from "../../../product-assets/public/medication/shared/i18n/locale.js";
import {
  dayNumber,
  today,
} from "../../../product-assets/public/medication/shared/ui/dates.js";
import { medicineColor } from "./MedicineArt";
import type { MedicinePlan, MedicineTarget, Phase } from "./model";

export const weekdayBits = [5, 6, 0, 1, 2, 3, 4];
export const weekdays = [
  t("ui.saturday"),
  t("ui.sunday"),
  t("ui.monday"),
  t("ui.tuesday"),
  t("ui.wednesday"),
  t("ui.thursday"),
  t("ui.friday"),
];

export interface SlotDraft {
  key: string;
  time: string;
  amount: string;
  original?: Phase["slots"][number];
}
export interface StageDraft {
  key: string;
  repeat: "daily" | "weekly" | "dates";
  start: string;
  end: string;
  interval: string;
  mask: number;
  weeklySelected: boolean;
  slots: SlotDraft[];
  original?: Phase;
}
export interface MedicineDraft {
  name: string;
  icon: string;
  color: string;
  phased: boolean;
  restoreExactMode: boolean;
  dates: number[];
  phases: StageDraft[];
  unit: string;
  stock: string;
  threshold: string;
  instructions: string;
}

export function slotDraft(time: string, amount = ""): SlotDraft {
  return { key: crypto.randomUUID(), time, amount };
}
export function stageDraft(
  phase: Phase = {
    start: today(),
    end: null,
    interval: 1,
    mask: 127,
    slots: [{ minute: 480, amount: null }],
  },
  preserveFields = false,
): StageDraft {
  const weekly = phase.mask !== 127 || phase.interval !== 1;
  return {
    key: crypto.randomUUID(),
    repeat: weekly ? "weekly" : "daily",
    start: isoDay(phase.start),
    end: phase.end === null || phase.autoEnd ? "" : isoDay(phase.end - 1),
    interval: String(phase.interval),
    mask: phase.mask,
    weeklySelected: weekly,
    ...(preserveFields && { original: phase }),
    slots: phase.slots.map((slot) => ({
      ...slotDraft(
        timeText(slot.minute),
        slot.amount === null ? "" : amountText(slot.amount),
      ),
      ...(preserveFields && { original: slot }),
    })),
  };
}

export function medicineDraft(
  medicine?: MedicinePlan,
  target?: MedicineTarget,
): MedicineDraft {
  const phases = medicine?.phases.length
    ? medicine.phases.map((phase) => stageDraft(phase, true))
    : [stageDraft()];
  const first = phases[0]!;
  if (target) first.start = isoDay(target.day);
  const dates = (medicine?.dates ?? []).filter(
    (day) => day >= dayNumber(first.start),
  );
  if (dates.length) first.repeat = "dates";
  return {
    name: medicine?.name ?? "",
    icon: medicine?.icon ?? "bottle",
    color: medicineColor(medicine?.color),
    phased: !dates.length && Boolean(medicine?.phased || phases.length > 1),
    restoreExactMode: false,
    dates,
    phases,
    unit: medicine?.unit ?? t("ui.tablet"),
    stock: medicine?.stock == null ? "" : amountText(medicine.stock),
    threshold: amountText(medicine?.threshold ?? 2000),
    instructions: medicine?.instructions ?? "",
  };
}

export class InvalidMedicineField extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

export const stageField = (stage: StageDraft, name: string) =>
  `${name}-${stage.key}`;
export const slotField = (slot: SlotDraft, name: string) =>
  `${name}-${slot.key}`;

function readQuantity(text: string, field: string): number | null {
  try {
    return quantity({ value: text }, true);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    throw new InvalidMedicineField(field, error.message);
  }
}

export function validateDraft(
  draft: MedicineDraft,
  trackedStock: boolean,
  id: string,
): MedicinePlan & { dates: number[]; stock: number | null; threshold: number } {
  const { phased } = draft;
  const active = phased ? draft.phases : draft.phases.slice(0, 1);
  const first = active[0]!;
  const exact = !phased && first.repeat === "dates";
  const dates = exact ? draft.dates : [];
  if (exact && !dates.length)
    throw new InvalidMedicineField(
      stageField(first, "dates"),
      t("ui.choose-at-least-one-date"),
    );
  const starts = active.map((stage) => {
    if (exact) return dates[0]!;
    if (!stage.start)
      throw new InvalidMedicineField(
        stageField(stage, "start"),
        t("ui.choose-a-start-date"),
      );
    return dayNumber(stage.start);
  });
  const phases = active.map<Phase>((stage, index) => {
    const weekly = stage.repeat === "weekly";
    const interval = weekly ? Number(stage.interval) : 1;
    if (weekly && !stage.mask)
      throw new InvalidMedicineField(
        stageField(stage, "weekday"),
        t("ui.choose-at-least-one-day-of-the-week"),
      );
    if (!Number.isInteger(interval) || interval < 1 || interval > 52)
      throw new InvalidMedicineField(
        stageField(stage, "interval"),
        t("ui.the-interval-must-be-between-1-and-52-weeks"),
      );
    const nextStage = active[index + 1];
    const next = starts[index + 1] ?? null;
    const start = starts[index]!;
    const endValue = exact ? "" : stage.end;
    const end = endValue ? dayNumber(endValue) + 1 : next;
    if (nextStage && next !== null && next <= start)
      throw new InvalidMedicineField(
        stageField(nextStage, "start"),
        t("ui.this-stage-must-start-after-the-previous-stage"),
      );
    if (end !== null && end <= start)
      throw new InvalidMedicineField(
        stageField(stage, "end"),
        t("ui.the-end-date-must-be-on-or-after-the-start-date"),
      );
    if (next !== null && end !== null && end > next)
      throw new InvalidMedicineField(
        stageField(stage, "end"),
        t("ui.this-stage-overlaps-the-start-of-the-next-stage"),
      );
    const seen = new Set<number>();
    const slots = stage.slots
      .map((slot) => {
        const minute = clockMinute(slot.time);
        if (!slot.time || !Number.isInteger(minute))
          throw new InvalidMedicineField(
            slotField(slot, "time"),
            t("ui.choose-a-time-for-this-dose"),
          );
        if (seen.has(minute))
          throw new InvalidMedicineField(
            slotField(slot, "time"),
            t("ui.another-dose-already-uses-this-time"),
          );
        seen.add(minute);
        const field = slotField(slot, "amount");
        const amount = readQuantity(slot.amount, field);
        if (amount === 0)
          throw new InvalidMedicineField(
            field,
            t("ui.enter-a-dose-greater-than-zero"),
          );
        return { ...slot.original, minute, amount };
      })
      .sort((a, b) => a.minute - b.minute);
    const phase: Phase = {
      ...stage.original,
      start,
      end,
      interval,
      mask: weekly ? stage.mask : 127,
      slots,
    };
    if (next !== null && !endValue) phase.autoEnd = true;
    else delete phase.autoEnd;
    return phase;
  });
  if (!engine.validMedicationPhases(compilePhases(engine, phases)))
    throw new Error(
      t("ui.check-the-date-order-overlapping-stages-selected-days-and"),
    );
  const name = draft.name.trim();
  const unit = draft.unit.trim();
  if (
    !name ||
    (!unit &&
      phases.some((phase) => phase.slots.some((slot) => slot.amount !== null)))
  )
    throw new InvalidMedicineField(
      "unit",
      t("ui.enter-the-unit-for-the-dose-amount"),
    );
  const stock = trackedStock ? null : readQuantity(draft.stock, "stock");
  const threshold =
    stock !== null || trackedStock
      ? (readQuantity(draft.threshold, "threshold") ?? 2000)
      : 2000;
  if (stock !== null || trackedStock) {
    const missing = active
      .flatMap((stage) => stage.slots)
      .find((slot) => !slot.amount.trim());
    if (missing)
      throw new InvalidMedicineField(
        slotField(missing, "amount"),
        t("ui.set-an-amount-for-each-dose-to-track-stock"),
      );
  }
  return {
    id,
    name,
    unit,
    phases,
    dates,
    stock,
    threshold,
    phased,
    revision: 1,
    instructions: draft.instructions.trim(),
    icon: draft.icon,
    color: draft.color,
  };
}
