import {
  localZone,
  appointmentOffsets,
  appointmentReminders,
  appointmentDefaults,
} from "../../../product-assets/public/medication/domain/care-plan.js";
import {
  dayMs,
  timezone,
  localWall,
} from "../../../product-assets/public/medication/domain/wall-clock.js";
import { isoDay } from "../../../product-assets/public/medication/domain/care-index.js";
import {
  t,
  localDigits,
} from "../../../product-assets/public/medication/shared/i18n/locale.js";
import { CareInputError } from "../../../product-assets/public/medication/shared/ui/care-error.js";
import { categoryOf } from "./categories";
import { appearanceColors } from "../../../product-assets/public/medication/features/medicines/appearance-options.js";

export interface Visit {
  id: string;
  day: number;
  time: string;
  name: string;
  category?: string;
  categoryName?: string;
  color?: string;
  place?: string;
  note?: string;
  notes?: string;
  sharedNote?: string;
  contact?: string;
  sharedContact?: string;
  zone?: string;
  offsets?: number[];
  remindersOff?: boolean;
  cancelled?: boolean;
  completed?: boolean;
  resolvedAt?: number;
  recordedBy?: string;
}
export interface LocalVisit {
  visit: Visit;
  day: number;
  instant: number;
  time: string;
}
export interface VisitCare {
  visits?: Record<string, Visit>;
  appointmentReminders?: { start: string; interval: number };
  clinicTimeZone?: string;
}
export type VisitTarget = {
  name: string;
  day: number;
  zone: string;
  save(visit: Visit): Promise<unknown>;
};
export const visitColor = (color?: string) =>
  color && Object.hasOwn(appearanceColors, color) ? color : "green";
const retainedOffsets = (visit?: Visit) =>
  (visit?.offsets ?? []).filter(
    (offset) => !appointmentOffsets.includes(offset),
  );

export function initialVisit(
  state: VisitCare,
  visit?: Visit,
  target?: VisitTarget,
  selectedDay?: number,
) {
  const zone =
    (visit ? visit.zone : (target?.zone ?? state.clinicTimeZone)) ??
    localZone() ??
    "UTC";
  const wall = localWall(Date.now(), timezone(zone));
  return {
    name: visit?.name ?? "",
    day: isoDay(
      visit?.day ?? target?.day ?? selectedDay ?? Math.floor(wall / dayMs),
    ),
    time: visit?.time ?? new Date(wall).toISOString().slice(11, 16),
    place: visit?.place ?? "",
    note: visit?.note ?? visit?.notes ?? "",
    contact: visit?.contact ?? "",
    zone,
    category: categoryOf(visit?.category),
    categoryName: visit?.categoryName ?? "",
    color: visitColor(visit?.color),
    offsets: (visit?.offsets ?? [60]).filter((offset) =>
      appointmentOffsets.includes(offset),
    ),
    remindersOff: Boolean(visit?.remindersOff),
  };
}
export type VisitDraft = ReturnType<typeof initialVisit>;

export function readVisit(id: string, draft: VisitDraft): Visit {
  const { category, color, zone, time, offsets, remindersOff } = draft;
  const categoryName = draft.categoryName.trim();
  return {
    id,
    category,
    color,
    zone,
    time,
    offsets,
    day: Date.parse(draft.day + "T00:00:00Z") / dayMs,
    name: draft.name.trim(),
    place: draft.place.trim(),
    note: draft.note.trim(),
    contact: draft.contact.trim(),
    ...(category === "custom" && categoryName ? { categoryName } : {}),
    ...(remindersOff ? { remindersOff } : {}),
  };
}

export function saveVisit(state: VisitCare, plan: Visit, editing: boolean) {
  const visits = (state.visits ??= {});
  const previous = visits[plan.id];
  if (editing && !previous)
    throw new CareInputError(t("ui.this-appointment-has-been-deleted"));
  const next = {
    ...previous,
    ...plan,
    offsets: [...retainedOffsets(previous), ...(plan.offsets ?? [])],
    cancelled: previous?.cancelled ?? false,
  };
  if (!plan.categoryName) delete next.categoryName;
  if (!plan.remindersOff) delete next.remindersOff;
  // The new note replaces the historical alias.
  delete next.notes;
  if (
    !previous?.completed ||
    previous.day !== plan.day ||
    previous.time !== plan.time ||
    (previous.zone ?? localZone() ?? "UTC") !== plan.zone
  ) {
    delete next.completed;
    delete next.resolvedAt;
  }
  visits[plan.id] = next;
}
export function reminderSummary(
  draft: VisitDraft,
  visit: Visit | undefined,
  state: VisitCare,
  formatDay: (day: number) => string,
) {
  if (visit?.cancelled) return t("ui.cancelled-appointment");
  if (draft.remindersOff) return t("ui.reminders-are-off-for-this-appointment");
  if (!draft.day || !draft.time) return "";
  try {
    const plan = readVisit("", draft);
    plan.offsets = [...retainedOffsets(visit), ...draft.offsets];
    const next = appointmentReminders(
      plan,
      state.appointmentReminders ?? appointmentDefaults,
      localZone(),
    ).find((at: number) => at > Date.now());
    if (next === undefined)
      return t("ui.no-upcoming-reminder-falls-before-this-appointment");
    const wall = localWall(next, timezone(localZone()));
    return t(
      "ui.first-upcoming-reminder-value-at-value",
      formatDay(Math.floor(wall / dayMs)),
      localDigits(new Date(wall).toISOString().slice(11, 16)),
    );
  } catch {
    return "";
  }
}
