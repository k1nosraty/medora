import type { FamilyDoseRecord, MedicationCare } from "./medication/model";
import type { SleepRecord, WakeDraft } from "./SleepForm";
import type { WaterEntry } from "./WaterEntries";
import type { RoutineCare, RoutineEntry } from "./routines/model";
import type { CyclePeriod } from "./cycle/PeriodEditor";
import type { CycleDayLabel } from "./cycleLabels";
import type { VisitCare } from "./appointments/model";
import type { PersonalProfile } from "./settings/Preferences";
import type { EntryKind } from "./entryActions";

export type CareState = MedicationCare &
  VisitCare &
  RoutineCare & {
    intro?: string;
    calendar?: string;
    waterGoal?: number;
    water?: WaterEntry[];
    waterReminders?: {
      enabled: boolean;
      start: string;
      end: string;
      interval: number;
      repeat: number;
      pauseUntil: number;
    };
    reminders?: { revision?: number; enabled?: boolean };
    familyPlacement?: string;
    sleepCardSize?: string;
    cycleCardSize?: string;
    cycleOptions?: {
      hideToday?: boolean;
      minute?: number | null;
      routines?: string[];
      since?: number;
    };
    cycleChecklist?: string[];
    cycleSupport?: string;
    cycleFollowup?: { estimate: number; until: number | null };
    cyclePreparation?: { estimate: number; items: string[] };
    sleepSettings?: {
      bedtime?: string;
      wake?: string;
      goal?: number;
      mask?: number;
      paused?: boolean;
    };
    sleepEnabled?: boolean;
    personalProfile?: PersonalProfile;
    accountCare?: { enabled?: boolean };
    gender?: string;
    cycleEnabled?: boolean;
    theme?: string;
    accent?: string;
    sleepRecords?: Record<string, SleepRecord>;
    sleepDraftWake?: WakeDraft;
    cycleLocalOnly?: boolean;
    cycleRecords?: Record<number, CyclePeriod>;
    cycleDays?: Record<number, CycleDayLabel>;
    cycleCompanionEstimate?: { first: number; last: number };
    cycleCompanionMessage?: string;
  };
export interface FamilyView {
  canAdd(kind: EntryKind): boolean;
  add(kind: EntryKind, day: number): void;
  member: { id: string };
  group: { id: string; name: string };
  name: string;
  profile: (() => void) | null;
  today: number;
  zone: string;
  firstName: string;
  state: CareState;
  timeOf(day: number, minute: number): number | undefined;
  has(section: string): boolean;
  canRecord(
    kind: "water" | "cycle" | "medicine" | "visit" | "routine",
    day?: number,
  ): boolean;
  record(
    action:
      | FamilyDoseRecord
      | { kind: "water" | "cycle"; day: number }
      | { kind: "visit"; day: number; id: string; title: string }
      | {
          kind: "routine";
          day: number;
          id: string;
          title: string;
          routine: RoutineEntry;
        },
  ): void;
  authorName(entry: { recordedBy?: string }): string;
  canView(section: string): boolean;
  synced: boolean;
}
