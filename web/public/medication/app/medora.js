import { installCareSync } from "../features/sync/controller.js";
import { language, localizeMarkup, selectLanguage, t } from "../shared/i18n/locale.js";
import { accessCare } from "../shared/storage.js";
import { $ } from "../shared/ui/dom.js";
import { installPickers } from "../shared/ui/pickers.js";
import { dayNumber, today } from "../shared/ui/dates.js";
import { installDeletion } from "../shared/ui/confirm-delete.js";
import { localZone } from "../domain/care-plan.js";
import { compilePhases, createCareIndex, isoDay } from "../domain/care-index.js";
import * as engine from "../domain/medication-rules.js";
import { validRoutineId } from "../domain/routine-plan.js";
import { changeReminderRevision, initializeReminders, syncReminders } from "../features/reminders/controller.js";
import { installMedicineEditor } from "../features/medicines/editor.js";
import { installMedicineView } from "../features/medicines/view.js";
import { installAccount } from "../features/account/dialog.js";
import { installSupport, loadOperations, reportDailyOpen } from "../features/operations.js";
import { installPromotion } from "../features/promotions/dialog.js";
import { installRoutines } from "../features/routines/view.js";
import { renderToday } from "../features/today/view.js";
import { installBackupRestore } from "../features/backups/dialog.js";
import { installNavigation } from "./navigation.js";
import { refreshApp } from "./update.js";
import { showIntro } from "./onboarding.js";
import { installSurfaceArt } from "../design/surfaces.js";

localizeMarkup();
installSurfaceArt();
installSupport();
let care;
let busy = false;
const update = $("update-app");
const updateStatus = $("app-update-status");
let updateStatusTimer;
update.addEventListener("click", async () => {
  clearTimeout(updateStatusTimer);
  if (busy) {
    updateStatus.textContent = t("پس از ذخیرهٔ تغییرات دوباره تلاش کنید.");
    return;
  }
  if (!navigator.onLine) {
    updateStatus.textContent = t("برای به‌روزرسانی به اینترنت وصل شوید.");
    return;
  }
  update.disabled = true;
  updateStatus.textContent = t("در حال بررسی به‌روزرسانی…");
  try {
    if (await refreshApp({ canReload: () => !busy && !document.querySelector("dialog[open]") }) === false) {
      updateStatus.textContent = t("آخرین نسخه نصب است.");
      updateStatusTimer = setTimeout(() => { updateStatus.textContent = ""; }, 3200);
    }
  } catch (error) {
    updateStatus.textContent = error.message === "update_busy"
      ? t("پس از ذخیرهٔ تغییرات دوباره تلاش کنید.") : t("به‌روزرسانی انجام نشد. دوباره تلاش کنید.");
  } finally {
    update.disabled = false;
  }
});
const getState = () => care;
async function mutate(change, success, scheduleChanged = false, day) {
  if (busy) return false;
  busy = true;
  $("app").setAttribute("aria-busy", "true");
  try {
    let needsSync = false;
    care = await accessCare(state => {
      const revision = state.reminders?.revision;
      change(state);
      if (scheduleChanged) changeReminderRevision(state);
      needsSync = state.reminders?.revision !== revision;
    }, { snapshot: care, day });
    render();
    $("status").textContent = success;
    if (needsSync) void syncReminders(false, care);
    accountSync.schedule();
    return true;
  } catch (error) {
    $("status").textContent = error instanceof Error && error.name === "Error" ? error.message : t("ذخیره انجام نشد. دوباره تلاش کنید.");
    return false;
  } finally {
    busy = false;
    $("app").removeAttribute("aria-busy");
  }
}

let indexedState;
let indexedDay;
let careIndex;

function currentIndex() {
  const zone = localZone();
  const day = today();
  if (indexedState !== care || indexedDay !== day || careIndex.zone !== zone) {
    indexedState = care;
    indexedDay = day;
    careIndex = createCareIndex(care, engine, zone, day);
  }
  return careIndex;
}

function render() {
  if (!care || !$("day").value) return;
  const day = selectedDay();
  const index = currentIndex();
  const screen = dashboard.screen();
  dashboard.renderScreen(care, day, index);
  if (screen === "medications") medicines.renderMedications(index.dosesOn(day));
  else if (screen === "routines") routines.renderPanel(care, index, day);
  else if (screen === "today") {
    const entries = index.routinesOn(day);
    renderToday(care, day, today(), index.dosesOn(day), dashboard.dayVisits(index, day), entries, index.waterTotal(day), medicines.renderDose, routines.card);
  }
}

async function reload() {
  if (busy) return;
  const snapshot = care;
  try {
    const latest = await accessCare(undefined, { snapshot });
    if (busy || care !== snapshot) return;
    care = latest;
    render();
  } catch {
    $("status").textContent = t("خواندن سوابق محلی انجام نشد.");
  }
}

$("day").addEventListener("change", render);
$("today-dates").append($("day-controls"));
$("open-quick").addEventListener("click", () => {
  $("quick-dialog").querySelector("[data-open-water]").disabled = dashboard.actionDay() > today();
  $("quick-dialog").showModal();
});
for (const item of document.querySelectorAll("[data-from-quick]")) {
  item.addEventListener("click", () => $("quick-dialog").close(), { capture: true });
}
const nextLanguage = language === "fa" ? "en" : "fa";
for (const control of document.querySelectorAll("[data-language-switch]")) {
  control.lang = nextLanguage;
  control.setAttribute("aria-label", language === "fa" ? "Switch to English" : "تغییر زبان به فارسی");
  const caption = control.querySelector("span");
  if (caption) caption.textContent = nextLanguage.toUpperCase();
  else control.textContent = language === "fa" ? "English" : "فارسی";
  control.addEventListener("click", () => selectLanguage(nextLanguage));
}
for (const control of document.querySelectorAll("[data-close]")) control.addEventListener("click", () => $(control.dataset.close).close());
window.addEventListener("focus", () => {
  if (!care) return;
  void reload();
  void syncReminders(true, care);
});
const selectedDay = () => $("day").value ? dayNumber($("day").value) : today();
const requestDeletion = installDeletion(mutate);
const dashboard = installNavigation({
  getState, selectedDay, today, render, mutate, requestDeletion,
  renderDose: (...args) => medicines.renderDose(...args),
  refreshFields: container => pickers.refresh(container), renderRoutine: (entry, day, options) => routines.card(entry, day, options)
});
const pickers = installPickers({ selectedDay, today, dashboard });
const routines = installRoutines({
  getState: () => care, today, mutate, render, requestDeletion, formatDay: dashboard.formatDay,
  refreshFields: pickers.refresh
});
const medicines = installMedicineView({
  getState, mutate, requestDeletion, openEditor: medicine => openEditor(medicine), formatDay: dashboard.formatDay
});
const openEditor = installMedicineEditor({
  getState, isBusy: () => busy, mutate, removeMedicine: medicines.deleteMedicine, pickers, formatDay: dashboard.formatDay
});
const accountSync = installCareSync({
  reload: async changed => {
    await reload();
    if (changed) {
      if (care?.intro === "done" && $("app").hidden) showIntro(care, mutate, dashboard.show);
      void syncReminders(false, care);
    }
  },
  remindersChanged: changeReminderRevision
});
const openAccount = installAccount({
  onSignIn: () => { void accountSync.refresh(); accountSync.signedIn(); },
  onShortcut: panel => {
    dashboard.show("settings", panel === "notification-settings");
    if (panel === "backup-settings") document.querySelector('[data-settings-panel="backup-settings"]').click();
  }
});
const params = new URLSearchParams(location.search);
const view = params.get("view");
if (view === "account") void openAccount();

installBackupRestore(mutate, phases => engine.validMedicationPhases(compilePhases(engine, phases)));

try {
  care = await accessCare();
  accountSync.schedule(0);
  const day = params.get("day");
  $("day").value = /^\d{4}-\d{2}-\d{2}$/.test(day ?? "") ? day : isoDay(today());
  if (!$("day").value) $("day").value = isoDay(today());
  render();
  $("app").hidden = false;
  $("boot-status").hidden = true;
  showIntro(care, mutate, dashboard.show);
  if (!$("app").hidden && ["water", "appointments", "routines"].includes(view)) dashboard.show(view);
  if (!$("app").hidden && view === "notification-settings") dashboard.show("settings", true);
  const routineId = params.get("routine");
  if (!$("app").hidden && view === "routines" && validRoutineId(routineId) && day === $("day").value) {
    const date = selectedDay();
    routines.openReminder(currentIndex().routinesOn(date).find(entry => entry.id === routineId), date);
    params.delete("routine");
    history.replaceState(history.state, "", `?${params}`);
  }
  if (!location.search) void reportDailyOpen();
  installPromotion(loadOperations);
  void initializeReminders();
} catch {
  $("boot-status").textContent = t("موتور برنامهٔ دارو یا فضای ذخیرهٔ محلی در دسترس نیست.");
}
