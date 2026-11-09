import { t } from "./locale.js";
import { $ } from "./dom.js";
import { localZone } from "./care-plan.js";
import { changeReminderRevision } from "./reminders.js";

export function installBackupRestore(mutate, validatePhases) {
  const backupForm = $("android-restore");
  const backupInput = $("android-backup-file");
  const emptyBackupFilename = $("android-backup-filename").textContent;

  function backupFeedback(message, state) {
    const status = $("android-restore-status");
    status.dataset.state = state;
    status.textContent = message;
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
      backupFeedback(t("یک فایل پشتیبان با حجم حداکثر ۱۶ مگابایت انتخاب کنید."), "error");
      return;
    }
    const password = field.value;
    field.value = "";
    const isCurrent = () => $("settings-dialog").open && $("settings-dialog").dataset.panel === "backup-settings" &&
      backupInput.files[0] === file;
    submit.disabled = true;
    backupFeedback(t("در حال بررسی فایل…"), "busy");
    try {
      const { maxBackupBytes, readAndroidBackup } = await import("./android-backup.js");
      if (!isCurrent()) return;
      if (file.size > maxBackupBytes) {
        backupFeedback(t("یک فایل پشتیبان با حجم حداکثر ۱۶ مگابایت انتخاب کنید."), "error");
        return;
      }
      const backup = await readAndroidBackup(new Uint8Array(await file.arrayBuffer()), password,
        validatePhases, localZone());
      if (!isCurrent()) return;
      if (!$("android-backup-confirm").checked) {
        backupFeedback("", "");
        return;
      }
      const success = await mutate(state => {
        changeReminderRevision(state);
        if (state.reminders) state.reminders.enabled = false;
        Object.assign(state, backup);
      }, t("سوابق اندروید بازیابی شد."), true);
      if (!isCurrent()) return;
      if (success) {
        backupForm.reset();
        backupFeedback(t("سوابق بازیابی شدند. اعلان‌ها را در تنظیمات دوباره فعال کنید."), "success");
      } else {
        backupFeedback(t("ذخیرهٔ سوابق انجام نشد. دوباره تلاش کنید."), "error");
      }
    } catch {
      if (isCurrent()) backupFeedback(t("فایل یا رمز معتبر نیست، یا این نسخه از فایل پشتیبانی نمی‌شود."), "error");
    } finally {
      submit.disabled = false;
    }
  });
}
