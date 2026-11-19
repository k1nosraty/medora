import { showFeedback } from "../../shared/ui/controls.js";
import { CareInputError } from "../../shared/ui/care-error.js";
import { isRestoreMode } from "../../domain/restore-intent.js";
import { portable } from "../../domain/care-records.js";
import { t } from "../../shared/i18n/locale.js";
import { $ } from "../../shared/ui/dom.js";
import { localZone } from "../../domain/care-plan.js";
import { changeReminderRevision } from "../reminders/controller.js";
import { accessCare } from "../../shared/storage.js";
import { isoDay } from "../../domain/care-index.js";

export function installBackupRestore(mutate, validatePhases, { prepareRestore, clearRecovery }) {
  const backupForm = $("android-restore");
  const backupInput = $("android-backup-file");
  const emptyBackupFilename = $("android-backup-filename").textContent;
  const exportForm = $("web-backup-export");
  const download = $("web-backup-download");
  let downloadUrl;
  let exportGeneration = 0;

  $("clear-device-records").addEventListener("click", async () => {
    if (!confirm(t("ui.clear-device-confirm"))) return;
    if (await mutate(state => {
      const reminders = state.reminders;
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, { intro: "done", medicines: {}, doses: {}, water: [], routineLogs: {}, preventAutoRestore: true });
      if (reminders?.token) state.reminders = {
        token: reminders.token, revision: Math.max(reminders.revision ?? 0, reminders.synced ?? 0) + 1,
        enabled: false, clearing: true
      };
    }, t("ui.clear-device-done"), true)) {
      clearRecovery();
      try {
        for (const key of ["medora-family-active-group", "medora-family-quick-actions-v1"]) sessionStorage.removeItem(key);
      } catch {}
      exportFeedback("ui.clear-device-done", "success");
    }
  });

  const backupOpen = () => $("settings-dialog").open && $("settings-dialog").dataset.panel === "backup-settings";
  function exportFeedback(message = "", state = "") {
    showFeedback($("web-backup-status"), t(message), state);
  }
  function clearDownload() {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = null;
    download.removeAttribute("href");
    download.hidden = true;
  }
  exportForm.addEventListener("reset", () => {
    exportGeneration++;
    clearDownload();
    exportFeedback();
  });
  exportForm.addEventListener("input", () => {
    exportGeneration++;
    clearDownload();
    exportFeedback();
  });
  exportForm.addEventListener("submit", async event => {
    event.preventDefault();
    const submit = exportForm.querySelector('[type="submit"]');
    if (submit.disabled) return;
    clearDownload();
    const password = $("web-backup-password").value;
    if (password !== $("web-backup-confirm").value) {
      exportFeedback("رمز فایل و تکرارش یکسان نیستند.", "error");
      return;
    }
    const generation = ++exportGeneration;
    const current = () => backupOpen() && exportGeneration === generation;
    submit.disabled = true;
    exportFeedback("در حال ساخت فایل رمزدار…", "busy");
    try {
      const { writeWebBackup } = await import("./web-format.js");
      const saved = await accessCare();
      const recovery = $("web-backup-use-recovery").checked;
      if (recovery && !saved.restoreRecovery) throw new Error("restore_recovery_missing");
      const backupState = recovery ? { ...saved.restoreRecovery, ...saved.restoreRecovery.settings } : saved;
      const bytes = await writeWebBackup(backupState, password, validatePhases);
      if (!current()) return;
      $("web-backup-password").value = $("web-backup-confirm").value = "";
      downloadUrl = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
      download.href = downloadUrl;
      const now = new Date();
      const day = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000;
      download.download = `medora-web-${isoDay(day)}.medora`;
      download.hidden = false;
      exportFeedback("فایل رمزدار آمادهٔ دانلود است.", "success");
      download.focus({ preventScroll: true });
    } catch (error) {
      if (current()) exportFeedback(error.message === "restore_recovery_missing" ? "ui.restore-recovery-missing" :
        error.message === "backup_too_large" ? "حجم فایل از ۱۶ مگابایت بیشتر است." :
        error.message === "backup_password" ? "برای رمز فایل حداقل ۱۵ نویسه وارد کن." : "ساخت پشتیبان انجام نشد. دوباره تلاش کنید.", "error");
    } finally {
      submit.disabled = false;
    }
  });

  function backupFeedback(message, state) {
    const status = $("android-restore-status");
    showFeedback(status, message, state);
    if (message) status.scrollIntoView({ block: "nearest" });
  }

  backupForm.addEventListener("reset", () => {
    $("android-backup-filename").textContent = emptyBackupFilename;
    backupFeedback("", "");
  });
  backupInput.addEventListener("change", () => {
    const file = backupInput.files[0];
    $("android-backup-filename").textContent = file?.name ?? emptyBackupFilename;
    backupFeedback("", "");
  });

  backupForm.addEventListener("submit", async event => {
    event.preventDefault();
    const file = backupInput.files[0];
    const field = $("android-backup-password");
    const submit = $("android-restore-submit");
    if (submit.disabled) return;
    if (!file) {
      backupFeedback(t("ui.choose-a-backup-file-no-larger-than-16-mb"), "error");
      return;
    }
    const password = field.value;
    field.value = "";
    const mode = $("backup-restore-mode").value;
    if (!isRestoreMode(mode)) return;
    const confirmed = () => $("android-backup-confirm").checked;
    const isCurrent = () => backupOpen() && backupInput.files[0] === file && $("backup-restore-mode").value === mode;
    submit.disabled = true;
    backupFeedback(t("ui.checking-the-backup"), "busy");
    try {
      const { maxBackupBytes } = await import("../../shared/crypto/backup.js");
      if (!isCurrent()) return;
      if (file.size > maxBackupBytes) {
        backupFeedback(t("ui.choose-a-backup-file-no-larger-than-16-mb"), "error");
        return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { isWebBackup, readWebBackup, webBackupSettings } = await import("./web-format.js");
      const web = isWebBackup(bytes);
      const backup = web ? await readWebBackup(bytes, password, validatePhases) :
        await (await import("./android-format.js")).readAndroidBackup(bytes, password, validatePhases, localZone());
      if (!isCurrent()) return;
      if (!confirmed()) {
        backupFeedback("", "");
        return;
      }
      let target;
      try {
        target = await prepareRestore(mode);
      } catch {
        if (isCurrent()) backupFeedback(t("ui.restore-cloud-unavailable"), "error");
        return;
      }
      if (!isCurrent() || !confirmed()) return;
      if (mode === "replace" && !confirm(t("ui.restore-replace-confirm", target.revision))) return;
      const restoreId = crypto.randomUUID();
      const success = await mutate(state => {
        state.restoreRecovery = portable(state);
        changeReminderRevision(state);
        if (state.reminders) state.reminders.enabled = false;
        if (web) for (const key of webBackupSettings) delete state[key];
        if (web) { delete state.cycleRecords; delete state.cycleDays; delete state.sleepRecords; }
        delete state.scheduleHistory;
        Object.assign(state, backup);
        delete state.preventAutoRestore;
        const account = state.accountCare;
        if (target.owner && account?.owner && target.owner !== account.owner) throw new CareInputError(t("ui.restore-cloud-unavailable"));
        state.accountCare = { ...account, enabled: mode !== "device",
          ...(target.owner && { owner: target.owner }),
          restore: { ...target, id: restoreId, ...(mode !== "device" && { records: portable(state) }) } };
      }, t("ui.records-restored"), true);
      if (!isCurrent()) return;
      if (success) {
        backupForm.reset();
        backupFeedback(t(mode === "device" ? "ui.restore-device-done" : "ui.restore-cloud-queued"), "success");
      } else {
        backupFeedback(t("ui.could-not-save-your-records-try-again"), "error");
      }
    } catch {
      if (isCurrent()) backupFeedback(t("ui.the-file-or-password-is-invalid-or-the-backup-version-is"), "error");
    } finally {
      submit.disabled = false;
    }
  });
}
