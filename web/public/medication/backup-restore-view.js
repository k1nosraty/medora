import { t } from "./locale.js";
import { $ } from "./dom.js";
import { localZone } from "./care-plan.js";
import { changeReminderRevision } from "./reminders.js";
import { accessCare } from "./storage.js";
import { isoDay } from "./care-index.js";

export function installBackupRestore(mutate, validatePhases) {
  const backupForm = $("android-restore");
  const backupInput = $("android-backup-file");
  const emptyBackupFilename = $("android-backup-filename").textContent;
  const exportForm = $("web-backup-export");
  const download = $("web-backup-download");
  let downloadUrl;
  let exportGeneration = 0;

  const backupOpen = () => $("settings-dialog").open && $("settings-dialog").dataset.panel === "backup-settings";
  function exportFeedback(message = "", state = "") {
    $("web-backup-status").textContent = t(message);
    $("web-backup-status").dataset.state = state;
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
      const { writeWebBackup } = await import("./web-backup.js");
      const bytes = await writeWebBackup(await accessCare(), password, validatePhases);
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
      if (current()) exportFeedback(error.message === "backup_too_large" ? "حجم فایل از ۱۶ مگابایت بیشتر است." :
        error.message === "backup_password" ? "برای رمز فایل حداقل ۱۵ نویسه وارد کن." : "ساخت پشتیبان انجام نشد. دوباره تلاش کنید.", "error");
    } finally {
      submit.disabled = false;
    }
  });

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
    const isCurrent = () => backupOpen() && backupInput.files[0] === file;
    submit.disabled = true;
    backupFeedback(t("در حال بررسی فایل…"), "busy");
    try {
      const { maxBackupBytes } = await import("./backup-crypto.js");
      if (!isCurrent()) return;
      if (file.size > maxBackupBytes) {
        backupFeedback(t("یک فایل پشتیبان با حجم حداکثر ۱۶ مگابایت انتخاب کنید."), "error");
        return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { isWebBackup, readWebBackup, webBackupSettings } = await import("./web-backup.js");
      const web = isWebBackup(bytes);
      const backup = web ? await readWebBackup(bytes, password, validatePhases) :
        await (await import("./android-backup.js")).readAndroidBackup(bytes, password, validatePhases, localZone());
      if (!isCurrent()) return;
      if (!$("android-backup-confirm").checked) {
        backupFeedback("", "");
        return;
      }
      const success = await mutate(state => {
        changeReminderRevision(state);
        if (state.reminders) state.reminders.enabled = false;
        if (web) for (const key of webBackupSettings) delete state[key];
        delete state.scheduleHistory;
        Object.assign(state, backup);
      }, t("سوابق بازیابی شدند."), true);
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
