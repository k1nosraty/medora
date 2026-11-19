import type { CareState } from "./productState";
import { t } from "../../product-assets/public/medication/shared/i18n/locale.js";
import { accessCare, storageMessage } from "../../product-assets/public/medication/shared/storage.js";
import { showFeedback } from "../../product-assets/public/medication/shared/ui/controls.js";
import { CareInputError } from "../../product-assets/public/medication/shared/ui/care-error.js";
import { changeReminderRevision, syncReminders } from "../../product-assets/public/medication/features/reminders/service.js";

interface CareMutationOptions {
  root: HTMLElement;
  status: HTMLElement;
  getState(): CareState | undefined;
  setState(state: CareState): void;
  canWrite(): boolean;
  scheduleSync(): void;
  render(): void;
}

export function createCareMutation({
  root, status, getState, setState, canWrite, scheduleSync, render,
}: CareMutationOptions) {
  let saving = false;

  async function mutate(
    change: (state: CareState) => void,
    success: string,
    scheduleChanged = false,
    day?: number,
  ) {
    if (saving || !canWrite()) return false;
    saving = true;
    root.setAttribute("aria-busy", "true");
    let needsSync = false;
    let saved: CareState;
    try {
      saved = await accessCare((state: CareState) => {
        const revision = state.reminders?.revision;
        change(state);
        if (scheduleChanged) changeReminderRevision(state);
        needsSync = state.reminders?.revision !== revision;
      }, { snapshot: getState(), day });
      setState(saved);
    } catch (error) {
      showFeedback(status, error instanceof CareInputError
        ? error.message
        : t(storageMessage(error, "ui.could-not-save-try-again")), "error");
      return false;
    } finally {
      saving = false;
      root.removeAttribute("aria-busy");
    }
    if (needsSync) void syncReminders(false, saved);
    scheduleSync();
    try {
      render();
      showFeedback(status, success, "success");
    } catch {
      showFeedback(status, t("ui.saved-refresh-view"));
    }
    return true;
  }

  return { mutate, isSaving: () => saving };
}
