import { installEntryActions } from "./entry-actions.js";
import { preserveFocus } from "../shared/ui/focus.js";
import { routeFromLocation } from "./routes.js";
import { installCareSync } from "../features/sync/controller.js";
import { language, localizeMarkup, selectLanguage, t } from "../shared/i18n/locale.js";
import { accessCare, storageMessage } from "../shared/storage.js";
import { $ } from "../shared/ui/dom.js";
import { installPickers } from "../shared/ui/pickers.js";
import { dayNumber, today } from "../shared/ui/dates.js";
import { installDeletion } from "../shared/ui/confirm-delete.js";
import { localZone } from "../domain/care-plan.js";
import { compilePhases, createCareIndex, isoDay } from "../domain/care-index.js";
import * as engine from "../domain/medication-rules.js";
import { validRoutineId } from "../domain/routine-plan.js";
import { familySections } from "../domain/family.js";
import { changeReminderRevision, initializeReminders, syncReminders } from "../features/reminders/controller.js";
import { installMedicineEditor } from "../features/medicines/editor.js";
import { installMedicineView } from "../features/medicines/view.js";
import { installAccount } from "../features/account/dialog.js";
import { installFamily } from "../features/family/panel.js";
import { renderMemberHeader } from "../features/family/context.js";
import { installSupport, loadOperations, reportDailyOpen } from "../features/operations.js";
import { installRoutines } from "../features/routines/view.js";
import { renderToday } from "../features/today/view.js";
import { installTodayStory } from "../features/today/story.js";
import { installBackupRestore } from "../features/backups/dialog.js";
import { installNavigation } from "./navigation.js";
import { refreshApp } from "./update.js";
import { showIntro } from "./onboarding.js";
import { installSurfaceArt } from "../design/surfaces.js";

localizeMarkup();
installSurfaceArt();
installTodayStory($("today-story"));
installSupport();
let care;
let busy = false;
let familyView;
const getFamilyView = () => familyView;
const viewToday = () => familyView?.today ?? today();
const viewState = () => familyView?.state ?? care;
const update = $("update-app");
const updateStatus = $("app-update-status");
let updateStatusTimer;
let familyNoticeTimer;
update.addEventListener("click", async () => {
  clearTimeout(updateStatusTimer);
  if (busy) {
    updateStatus.textContent = t("ui.try-again-after-your-changes-are-saved");
    return;
  }
  if (!navigator.onLine) {
    updateStatus.textContent = t("ui.connect-to-the-internet-to-update");
    return;
  }
  update.disabled = true;
  updateStatus.textContent = t("ui.checking-for-updates");
  try {
    if (await refreshApp({ canReload: () => !busy && !document.querySelector("dialog[open]") }) === false) {
      updateStatus.textContent = t("ui.medora-is-up-to-date");
      updateStatusTimer = setTimeout(() => { updateStatus.textContent = ""; }, 3200);
    }
  } catch (error) {
    updateStatus.textContent = error.message === "update_busy"
      ? t("ui.try-again-after-your-changes-are-saved") : t("ui.couldnt-update-medora-try-again");
  } finally {
    update.disabled = false;
  }
});
const getState = () => care;
async function mutate(change, success, scheduleChanged = false, day) {
  if (busy || familyView) return false;
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
    if (needsSync) void syncReminders(false, care);
    accountSync.schedule();
  } catch (error) {
    $("status").textContent = error instanceof Error && error.name === "Error" ? error.message : t(storageMessage(error, "ui.could-not-save-try-again"));
    return false;
  } finally {
    busy = false;
    $("app").removeAttribute("aria-busy");
  }
  try {
    render();
    $("status").textContent = success;
  } catch {
    $("status").textContent = t("ui.saved-refresh-view");
  }
  return true;
}

let indexedState;
let indexedDay;
let careIndex;

function currentIndex() {
  const zone = familyView?.zone ?? localZone();
  const day = viewToday();
  const state = viewState();
  if (indexedState !== state || indexedDay !== day || careIndex.zone !== zone) {
    indexedState = state;
    indexedDay = day;
    careIndex = createCareIndex(state, engine, zone, day, familyView?.timeOf);
  }
  return careIndex;
}

function paint() {
  if (!care || !$("day").value) return;
  const day = selectedDay();
  const index = currentIndex();
  const screen = dashboard.screen();
  const state = viewState();
  dashboard.renderScreen(state, day, index);
  if (screen === "medications") medicines.renderMedications(index.dosesOn(day));
  else if (screen === "routines") routines.renderPanel(state, index, day);
  else if (screen === "today") {
    const entries = index.routinesOn(day);
    renderToday(state, day, viewToday(), index.dosesOn(day), dashboard.dayVisits(index, day), entries, index.waterTotal(day), medicines.renderDose, routines.card, familyView);
  }
}

function render() {
  return preserveFocus($("app"), paint, $("screen-title"));
}

async function reload() {
  if (busy) return;
  const snapshot = care;
  try {
    const latest = await accessCare(undefined, { snapshot });
    if (busy || care !== snapshot || latest === snapshot) return;
    care = latest;
    render();
  } catch (error) {
    $("status").textContent = t(storageMessage(error, "ui.could-not-read-your-local-records"));
  }
}

$("day").addEventListener("change", render);
$("timeline-order").addEventListener("change", render);

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
const selectedDay = () => $("day").value ? dayNumber($("day").value) : viewToday();
const requestDeletion = installDeletion(mutate);
const dashboard = installNavigation({
  getState: viewState, selectedDay, today: viewToday, getFamilyView, getPersonalState: getState, render, mutate, requestDeletion,
  renderDose: (...args) => medicines.renderDose(...args),
  refreshFields: container => pickers.refresh(container), renderRoutine: (entry, day, options) => routines.card(entry, day, options)
});
const pickers = installPickers({ selectedDay, today: viewToday, dashboard });
const routines = installRoutines({
  getState: viewState, today: viewToday, getFamilyView, mutate, render, requestDeletion, formatDay: dashboard.formatDay,
  refreshFields: pickers.refresh
});
const medicines = installMedicineView({
  getState: viewState, today: viewToday, getFamilyView, mutate, requestDeletion, openEditor: medicine => openEditor(medicine), formatDay: dashboard.formatDay
});
const openEditor = installMedicineEditor({
  getState, isBusy: () => busy, mutate, removeMedicine: medicines.deleteMedicine, pickers, formatDay: dashboard.formatDay
});
const accountSync = installCareSync({
  reload: async changed => {
    await reload();
    if (changed) {
      if (care?.intro === "done" && $("app").hidden) showIntro(care, mutate);
      void syncReminders(false, care);
    }
  },
  remindersChanged: changeReminderRevision
});
const openAccount = installAccount({
  onSignIn: () => { void accountSync.refresh(); accountSync.signedIn(); void family.refreshGroup(); },
  onSignOut: () => {
    void accountSync.signedOut();
    void family.refreshGroup();
  },
  onShortcut: panel => {
    dashboard.show("settings", panel === "notification-settings");
    if (panel === "backup-settings") document.querySelector('[data-settings-panel="backup-settings"]').click();
  }
});
const family = installFamily({ getState, openAccount, actionDay: dashboard.actionDay, getFamilyView,
  openPlan: (kind, target) => {
    const open = { medicine: openEditor, visit: dashboard.openVisit, routine: routines.openEditor,
      water: dashboard.openWater, cycle: dashboard.openCycle }[kind];
    open(undefined, target);
  },
  setFamilyView: (view, feedback = "") => {
    const changed = familyView?.member.id !== view?.member.id || familyView?.group.id !== view?.group.id;
    const narrowed = !changed && view && familyView && familyView.state !== view.state &&
      familySections.some(key => familyView.has(key) && !view.has(key));
    familyView = view;
    renderMemberHeader(view);
    if (changed || narrowed) dashboard.changeContext();
    else if (view && !view.canView(dashboard.screen())) dashboard.show("today");
    else render();
    if (changed || feedback) {
      clearTimeout(familyNoticeTimer);
      const notice = $("family-notice");
      notice.textContent = feedback;
      notice.hidden = !feedback;
      if (view && feedback) familyNoticeTimer = setTimeout(() => { notice.hidden = true; }, 3500);
      $("status").textContent = "";
    }
  }, openProfile: () => {
  dashboard.show("settings");
  document.querySelector('[data-settings-panel="profile-settings"]').click();
} });
dashboard.setEntryAction(installEntryActions({
  currentView: getFamilyView, currentDay: dashboard.actionDay,
  open(kind, control) {
    if (kind === "medicine") openEditor();
    else if (kind === "visit") dashboard.openVisit();
    else if (kind === "routine") routines.openEditor();
    else if (kind === "cycle") dashboard.openCycle();
    else dashboard.openWater(null, null, { focusAmount: control?.id === "water-custom-action" });
  },
  addWater: dashboard.addWater, quickWater: dashboard.quickAddWater, familyWater: family.quickWater
}));
$("account-dialog").addEventListener("close", family.openInvitation);
document.querySelector(".app-bar").addEventListener("click", event => {
  if (event.target.closest('[data-open-account], [data-destination="settings"]')) family.leave();
}, true);
const params = new URLSearchParams(location.search);
const view = params.get("view");
if (view === "account") void openAccount();

installBackupRestore(mutate, phases => engine.validMedicationPhases(compilePhases(engine, phases)), accountSync.prepareRestore);

try {
  care = await accessCare();
  accountSync.schedule(0);
  const day = params.get("day");
  $("day").value = /^\d{4}-\d{2}-\d{2}$/.test(day ?? "") ? day : isoDay(today());
  if (!$("day").value) $("day").value = isoDay(today());
  if (/^\d{4}-\d{2}-\d{2}$/.test(day ?? "") && $("day").value) {
    history.replaceState({ ...history.state, medoraDay: selectedDay() }, "", location.href);
  }
  if (!dashboard.show(routeFromLocation(), false, { mode: "pop", focus: false })) {
    dashboard.show("today", false, { mode: "replace", focus: false });
  }
  $("app").hidden = false;
  $("boot-status").hidden = true;
  showIntro(care, mutate);
  if (!$("app").hidden && view === "notification-settings") dashboard.show("settings", true);
  const routineId = params.get("routine");
  if (!$("app").hidden && view === "routines" && validRoutineId(routineId) && day === $("day").value) {
    const date = selectedDay();
    routines.openReminder(currentIndex().routinesOn(date).find(entry => entry.id === routineId), date);
    params.delete("routine");
    history.replaceState(history.state, "", `?${params}`);
  }
  if (!location.search) void reportDailyOpen();
  void import("../features/promotions/dialog.js").then(({ installPromotion }) => installPromotion(loadOperations)).catch(() => {});
  family.openInvitation();
  void family.refreshGroup();
  void initializeReminders();
} catch (error) {
  $("boot-status").textContent = t(storageMessage(error, "ui.the-schedule-engine-or-local-storage-is-unavailable"));
}
