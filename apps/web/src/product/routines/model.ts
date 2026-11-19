import {
  t,
  localDigits,
} from "../../../product-assets/public/medication/shared/i18n/locale.js";
import { appearanceColors } from "../../../product-assets/public/medication/features/medicines/appearance-options.js";
import { routineLabels } from "../../../product-assets/public/medication/features/routines/catalog.js";
import { clockMinute } from "@medora/domain/browser/care-plan";
import {
  isoDay,
  scheduledRoutinesOn,
  timeText,
  trackSchedule,
} from "@medora/domain/browser/care-index";
import { cycleRoutineOccurs } from "@medora/domain/browser/cycle";
import { dayMs } from "@medora/domain/browser/wall-clock";
import { integer } from "../../../product-assets/public/medication/shared/ui/input-values.js";
import { CareInputError } from "../../../product-assets/public/medication/shared/ui/care-error.js";
import {
  defaultRoutineColor,
  maxRoutineAmount,
  maxRoutines,
  maxRoutineSteps,
  routineComplete,
  routineLog,
  routineOccurs,
  routineWeekday,
} from "@medora/domain/browser/routine-plan";

export type RoutineMode = "done" | "quantity" | "steps";
export interface RoutineResult {
  name: string;
  category: string;
  color?: string;
  minute: number | null;
  mode: RoutineMode;
  target?: number;
  unit?: string;
  amount?: number;
  steps?: string[];
  checked?: number[];
  done?: boolean;
  notes?: string;
  sharedNotes?: string;
  recordedBy?: string;
  resolvedAt?: number;
}
export interface RoutinePlan extends RoutineResult {
  id: string;
  start: number;
  mask: number;
  interval: number;
  reminder: boolean;
  paused: boolean;
  revision: number;
}
export interface RoutineEntry extends RoutineResult {
  id: string;
  start?: number;
  mask?: number;
  interval?: number;
  paused?: boolean;
}
export interface RoutineCare {
  routines?: Record<string, RoutinePlan>;
  routineLogs?: Record<number, Record<string, RoutineResult>>;
}
export interface RoutineTarget {
  name: string;
  day: number;
  save(plan: RoutinePlan): Promise<unknown>;
}
export interface Activity {
  entry: RoutineEntry;
  day: number;
  plan: RoutinePlan | undefined;
  recorded: RoutineResult | undefined;
  readOnly?: boolean;
}
export type Progress = boolean | number | number[];
export const weekdayLabels = [
  t("ui.monday"),
  t("ui.tuesday"),
  t("ui.wednesday"),
  t("ui.thursday"),
  t("ui.friday"),
  t("ui.saturday"),
  t("ui.sunday"),
];
export const labelFor = (category: string) =>
  t(category in routineLabels ? routineLabels[category] : routineLabels.custom);
export const categoryOf = (category?: string) =>
  category && Object.hasOwn(routineLabels, category) ? category : "custom";
export const colorOf = (color?: string) =>
  color && Object.hasOwn(appearanceColors, color) ? color : defaultRoutineColor;
export const displayAmount = (entry: RoutineResult, amount: number) =>
  [localDigits(amount), entry.unit].filter(Boolean).join(" ");
const changed = () =>
  new CareInputError(t("ui.this-routine-changed-open-it-again"));

export function initialDraft(
  day: number,
  plan?: RoutinePlan,
  target?: RoutineTarget,
) {
  return {
    name: plan?.name ?? "",
    category: categoryOf(plan?.category),
    color: colorOf(plan?.color),
    weekly: Boolean(plan && (plan.mask !== 127 || plan.interval !== 1)),
    interval: plan?.interval ?? 1,
    mask: !plan || plan.mask === 127 ? 1 << routineWeekday(day) : plan.mask,
    start: isoDay(plan?.start ?? target?.day ?? day),
    time: plan?.minute == null ? "" : timeText(plan.minute),
    reminder: Boolean(plan?.reminder),
    mode: plan?.mode ?? ("done" as RoutineMode),
    amount: String(plan?.target ?? ""),
    unit: plan?.unit ?? "",
    steps: plan?.steps?.join("\n") ?? "",
    notes: plan?.notes ?? "",
  };
}
export type RoutineDraft = ReturnType<typeof initialDraft>;
export class RoutineInputError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(t(message));
  }
}

export function planFromDraft(
  draft: RoutineDraft,
  id: string,
  previous?: RoutinePlan,
): RoutinePlan {
  const name = draft.name.trim();
  const start = Date.parse(draft.start + "T00:00:00Z") / dayMs;
  if (!name)
    throw new RoutineInputError("ui.enter-a-routine-name", "routine-name");
  if (!Number.isInteger(start) || isoDay(start) !== draft.start)
    throw new RoutineInputError("ui.enter-a-complete-date", "routine-start");
  const mask = draft.weekly ? draft.mask : 127;
  if (!mask) throw new RoutineInputError("ui.select-at-least-one-day");
  const minute = draft.time ? clockMinute(draft.time) : null;
  if (draft.reminder && minute === null)
    throw new RoutineInputError(
      "ui.enter-a-routine-time-to-get-a-reminder",
      "routine-time",
    );
  const target = integer(draft.amount);
  const steps = draft.steps
    .split("\n")
    .map((step) => step.trim())
    .filter(Boolean);
  if (
    draft.mode === "quantity" &&
    (!Number.isInteger(target) || target < 1 || target > maxRoutineAmount)
  )
    throw new RoutineInputError(
      "ui.enter-a-target-from-1-to-99-999",
      "routine-target",
    );
  if (
    draft.mode === "steps" &&
    (!steps.length ||
      steps.length > maxRoutineSteps ||
      steps.some((step) => step.length > 70))
  )
    throw new RoutineInputError(
      "ui.enter-1-to-12-steps-of-up-to-70-characters-each",
      "routine-steps",
    );
  return {
    id,
    name,
    start,
    mask,
    minute,
    category: draft.category,
    color: draft.color,
    interval: draft.weekly ? draft.interval : 1,
    mode: draft.mode,
    reminder: draft.reminder,
    notes: draft.notes.trim(),
    paused: previous?.paused ?? false,
    revision: (previous?.revision ?? 0) + 1,
    ...(draft.mode === "quantity" && { target, unit: draft.unit.trim() }),
    ...(draft.mode === "steps" && { steps }),
  };
}

function requireCurrent(state: RoutineCare, plan?: RoutinePlan) {
  const current = plan && state.routines?.[plan.id];
  if (!plan || !current || current.revision !== plan.revision) throw changed();
  return current;
}
export function saveRoutine(
  state: RoutineCare,
  plan: RoutinePlan,
  previous?: RoutinePlan,
) {
  const routines = (state.routines ??= {});
  const saved = previous ? requireCurrent(state, previous) : undefined;
  if (!saved && Object.keys(routines).length >= maxRoutines)
    throw new CareInputError(
      t("ui.you-can-have-up-to-value-routines", localDigits(maxRoutines)),
    );
  const next = { ...saved, ...plan };
  if (plan.mode !== "quantity") {
    delete next.target;
    delete next.unit;
  }
  if (plan.mode !== "steps") delete next.steps;
  trackSchedule(state, "routines", saved, next, Date.now());
  routines[plan.id] = next;
}
export function pauseRoutine(state: RoutineCare, plan: RoutinePlan) {
  const current = requireCurrent(state, plan);
  const next = {
    ...current,
    paused: !current.paused,
    revision: current.revision + 1,
  };
  trackSchedule(state, "routines", current, next, Date.now());
  state.routines![plan.id] = next;
}
export function deleteRoutine(state: RoutineCare, plan: RoutinePlan) {
  const current = requireCurrent(state, plan);
  trackSchedule(state, "routines", current, null, Date.now());
  delete state.routines?.[plan.id];
}
export function saveProgress(
  state: RoutineCare,
  activity: Activity,
  progress: Progress,
  today: number,
) {
  const { day, entry, plan, recorded } = activity;
  if (day > today)
    throw new CareInputError(t("ui.this-occurrence-can-no-longer-be-logged"));
  const current = requireCurrent(state, plan);
  const logs = (state.routineLogs ??= {});
  const rows = (logs[day] ??= {});
  const previous = rows[entry.id];
  if (JSON.stringify(previous) !== JSON.stringify(recorded)) throw changed();
  const scheduled: RoutineResult | undefined =
    day < today
      ? scheduledRoutinesOn(state, day).get(entry.id)
      : cycleRoutineOccurs(state, current, routineOccurs(current, day), day)
        ? current
        : undefined;
  const latest = previous ?? scheduled;
  if (!latest) throw changed();
  const updated: RoutineResult | null = routineLog(latest, progress);
  if (!updated) {
    delete rows[entry.id];
    return;
  }
  const next = { ...previous, ...updated };
  if (routineComplete(next))
    next.resolvedAt = previous?.resolvedAt ?? Date.now();
  else delete next.resolvedAt;
  rows[entry.id] = next;
}
