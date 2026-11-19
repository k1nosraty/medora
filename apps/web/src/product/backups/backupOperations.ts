import { accessCare } from "../../../product-assets/public/medication/shared/storage.js";
import { portable } from "../../../product-assets/public/medication/domain/care-records.js";
import { changeReminderRevision } from "../../../product-assets/public/medication/features/reminders/service.js";
import { CareInputError } from "../../../product-assets/public/medication/shared/ui/care-error.js";
import { t } from "../../../product-assets/public/medication/shared/i18n/locale.js";
import { localZone } from "../../../product-assets/public/medication/domain/care-plan.js";
import type {
  RestoreMode,
  RestoreTarget,
} from "../../../product-assets/public/medication/domain/restore-intent.js";
import type { CareState } from "../product";

export type ValidatePhases = (phases: unknown) => boolean;
type RecoveryCopy = ReturnType<typeof portable>;
type BackupCare = CareState & {
  restoreRecovery?: RecoveryCopy;
  accountCare?: {
    owner?: string;
    enabled?: boolean;
    restore?: RestoreTarget & { id: string; records?: RecoveryCopy };
  };
};
type Apply = (state: CareState) => void;
export interface BackupOperations {
  validatePhases: ValidatePhases;
  mutate(
    change: Apply,
    message: string,
    updateReminders?: boolean,
  ): Promise<boolean>;
  prepareRestore(mode: RestoreMode): Promise<RestoreTarget>;
  clearRecovery(): void;
}

export async function exportBackup(
  password: string,
  includeRecovery: boolean,
  validate: ValidatePhases,
) {
  const { writeWebBackup } =
    await import("../../../product-assets/public/medication/features/backups/web-format.js");
  const state: BackupCare = await accessCare();
  const recovery = state.restoreRecovery;
  if (includeRecovery && !recovery) throw new Error("restore_recovery_missing");
  const saved =
    includeRecovery && recovery ? { ...recovery, ...recovery.settings } : state;
  return writeWebBackup(saved, password, validate);
}

export async function readBackup(
  file: File,
  password: string,
  validate: ValidatePhases,
) {
  const { maxBackupBytes } =
    await import("../../../product-assets/public/medication/shared/crypto/backup.js");
  if (file.size > maxBackupBytes) throw new Error("backup_too_large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const format =
    await import("../../../product-assets/public/medication/features/backups/web-format.js");
  const web = format.isWebBackup(bytes);
  const data = web
    ? await format.readWebBackup(bytes, password, validate)
    : await (
        await import("../../../product-assets/public/medication/features/backups/android-format.js")
      ).readAndroidBackup(bytes, password, validate, localZone());
  return { data, web, settings: format.webBackupSettings };
}
export function restoreBackup(
  state: BackupCare,
  backup: Awaited<ReturnType<typeof readBackup>>,
  target: RestoreTarget,
  id: string,
) {
  const account = state.accountCare;
  if (
    target.mode !== "device" &&
    account?.owner &&
    account.owner !== target.owner
  )
    throw new CareInputError(t("ui.restore-cloud-unavailable"));
  state.restoreRecovery = portable(state);
  changeReminderRevision(state);
  if (state.reminders) state.reminders.enabled = false;
  if (backup.web) {
    for (const key of backup.settings) Reflect.deleteProperty(state, key);
    Reflect.deleteProperty(state, "cycleRecords");
    Reflect.deleteProperty(state, "cycleDays");
    delete state.sleepRecords;
  }
  Reflect.deleteProperty(state, "scheduleHistory");
  Object.assign(state, backup.data);
  Reflect.deleteProperty(state, "preventAutoRestore");
  state.accountCare = {
    ...account,
    enabled: target.mode !== "device",
    ...(target.mode !== "device" && { owner: target.owner }),
    restore: {
      ...target,
      id,
      ...(target.mode !== "device" && { records: portable(state) }),
    },
  };
}
export async function clearDevice({ mutate, clearRecovery }: BackupOperations) {
  if (!confirm(t("ui.clear-device-confirm"))) return false;
  const saved = await mutate(
    (state) => {
      const reminders:
        { token?: string; revision?: number; synced?: number } | undefined =
        state.reminders;
      for (const key of Object.keys(state)) Reflect.deleteProperty(state, key);
      Object.assign(state, {
        intro: "done",
        medicines: {},
        doses: {},
        water: [],
        routineLogs: {},
        preventAutoRestore: true,
      });
      if (reminders?.token)
        state.reminders = Object.assign(
          {
            revision:
              Math.max(reminders.revision ?? 0, reminders.synced ?? 0) + 1,
            enabled: false,
          },
          { token: reminders.token, clearing: true },
        );
    },
    t("ui.clear-device-done"),
    true,
  );
  if (saved) {
    clearRecovery();
    try {
      sessionStorage.removeItem("medora-family-active-group");
      sessionStorage.removeItem("medora-family-quick-actions-v1");
    } catch {
      /* Device clearing also works without session storage. */
    }
  }
  return saved;
}
