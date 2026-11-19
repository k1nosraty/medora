import type { CareState, FamilyView } from "./productState";
import { accountTransport } from "./accountTransport";
import { showFeedback } from "../../product-assets/public/medication/shared/ui/controls.js";
import { createCareMutation } from "./careMutation";
import { installEntryActions } from "./entryActions";
import { preserveFocus } from "../../product-assets/public/medication/shared/ui/focus.js";
import { routeFromLocation } from "./routes";
import { createCareSync } from "../../product-assets/public/medication/features/sync/service.js";
import {
  language,
  localizeMarkup,
  selectLanguage,
  t,
} from "../../product-assets/public/medication/shared/i18n/locale.js";
import {
  accessCare,
  storageMessage,
} from "../../product-assets/public/medication/shared/storage.js";
import { installPickers } from "./Pickers";
import {
  dayNumber,
  today,
} from "../../product-assets/public/medication/shared/ui/dates.js";
import { installDeletion } from "./DeleteConfirmation";
import { localZone } from "@medora/domain/browser/care-plan";
import {
  compilePhases,
  createCareIndex,
  isoDay,
} from "@medora/domain/browser/care-index";
import * as engine from "@medora/domain/browser/medication-rules";
import { validRoutineId } from "@medora/domain/browser/routine-plan";
import { familySections } from "@medora/domain/browser/family";
import {
  changeReminderRevision,
  initializeReminders,
  reminderView,
  syncReminders,
} from "../../product-assets/public/medication/features/reminders/service.js";
import { installMedication, type RenderDose } from "./medication/Medication";
import { installFamilyDialog } from "./family/FamilyDialog";
import { showFamilyNotice } from "./family/FamilyNotice";
import { installSupport, loadOperations, reportDailyOpen } from "./Operations";
import { installRoutines } from "./routines/Routines";
import { renderToday } from "./Today";
import { installNavigation } from "./navigation";
import { refreshApp } from "./updates";
import { finishIntro, hasStarted, showIntro } from "./Onboarding";
import { initialCare } from "./initialCare";
import { installSurfaceArt } from "../../product-assets/public/medication/design/surfaces.js";
import { showStorageRecovery } from "./StorageRecovery";
import { disposeCards } from "./renderer";

function $<T extends HTMLElement = HTMLElement>(id: string) {
  return document.getElementById(id)! as T;
}

localizeMarkup({ keep: $("welcome-screen") });
installSurfaceArt();
let care: CareState | undefined;
let familyView: FamilyView | null = null;
const getFamilyView = () => familyView;
const viewToday = () => familyView?.today ?? today();
const viewState = () => familyView?.state ?? care;
const update = $<HTMLButtonElement>("update-app");
const dayField = $<HTMLInputElement>("day");
const updateStatus = $("app-update-status");
let updateStatusTimer: ReturnType<typeof setTimeout> | undefined;
update.addEventListener("click", async () => {
  clearTimeout(updateStatusTimer);
  if (isSaving()) {
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
    if (
      (await refreshApp({
        canReload: () => !isSaving() && !document.querySelector("dialog[open]"),
      })) === false
    ) {
      updateStatus.textContent = t("ui.medora-is-up-to-date");
      updateStatusTimer = setTimeout(() => {
        updateStatus.textContent = "";
      }, 3200);
    }
  } catch (error) {
    updateStatus.textContent =
      error instanceof Error && error.message === "update_busy"
        ? t("ui.try-again-after-your-changes-are-saved")
        : t("ui.couldnt-update-medora-try-again");
  } finally {
    update.disabled = false;
  }
});
const getState = () => care;
const { mutate, isSaving } = createCareMutation({
  root: $("app"),
  status: $("status"),
  getState,
  setState: (next) => { care = next; },
  canWrite: () => !familyView,
  scheduleSync: () => accountSync.schedule(),
  render,
});

let indexedState: CareState | undefined;
let indexedDay: number | undefined;
let careIndex: ReturnType<typeof createCareIndex>;

function currentIndex() {
  const zone = familyView?.zone ?? localZone();
  const day = viewToday();
  const state = viewState();
  if (indexedState !== state || indexedDay !== day || careIndex.zone !== zone) {
    indexedState = state;
    indexedDay = day;
    const projected = familyView;
    careIndex = createCareIndex(
      state,
      engine,
      zone,
      day,
      projected
        ? (date, minute) => projected.timeOf(date, minute) ?? Number.NaN
        : undefined,
    );
  }
  return careIndex;
}

function paint() {
  const state = viewState();
  if (!care || !state || !dayField.value) return;
  const day = selectedDay();
  const index = currentIndex();
  const screen = dashboard.screen();
  dashboard.renderScreen(state, day, index);
  if (screen === "medications") medicines.renderMedications(index.dosesOn(day));
  else if (screen === "routines") routines.renderPanel(state, index, day);
  else if (screen === "today") {
    const entries = index.routinesOn(day);
    const summary = renderToday(
      state,
      day,
      viewToday(),
      index.dosesOn(day),
      dashboard.dayVisits(index, day),
      entries,
      index.waterTotal(day),
      medicines.todayDose,
      routines.todayCard,
      familyView,
    );
    dashboard.renderTodayHeader(day, summary.storySummary);
  }
}

function render() {
  return preserveFocus($("app"), paint, $("screen-title"));
}

async function reload() {
  if (isSaving()) return;
  const snapshot = care;
  try {
    const latest = await accessCare(undefined, { snapshot });
    if (isSaving() || care !== snapshot || latest === snapshot) return;
    care = latest;
    render();
  } catch (error) {
    showFeedback(
      $("status"),
      t(storageMessage(error, "ui.could-not-read-your-local-records")),
      "error",
    );
  }
}

dayField.addEventListener("change", render);

const nextLanguage = language === "fa" ? "en" : "fa";
for (const control of document.querySelectorAll<HTMLElement>(
  "[data-language-switch]",
)) {
  if (control.closest("#welcome-screen")) continue;
  control.lang = nextLanguage;
  const caption = control.querySelector("span");
  const name = language === "fa" ? "Switch to English" : "تغییر زبان به فارسی";
  if (caption) {
    caption.textContent = nextLanguage.toUpperCase();
    control.setAttribute("aria-label", caption.textContent + ", " + name);
  } else {
    control.textContent = language === "fa" ? "English" : "فارسی";
    control.setAttribute("aria-label", name);
  }
  control.addEventListener("click", () => selectLanguage(nextLanguage));
}
for (const control of document.querySelectorAll<HTMLElement>("[data-close]")) {
  control.addEventListener("click", () => {
    if (control.dataset.close)
      $<HTMLDialogElement>(control.dataset.close).close();
  });
}
window.addEventListener("focus", () => {
  if (!care) return;
  void reload();
  void syncReminders(true, care);
});
const selectedDay = () =>
  dayField.value ? dayNumber(dayField.value) : viewToday();
const requestDeletion = installDeletion(mutate);
const dashboard = installNavigation({
  getState: viewState,
  selectedDay,
  openDate: () => pickers.openMainDate(),
  today: viewToday,
  getFamilyView,
  getPersonalState: getState,
  render,
  mutate,
  requestDeletion,
  renderDose: (...args: Parameters<RenderDose>) =>
    medicines.renderDose(...args),
  disposeDoseCards: disposeCards,
  backup: {
    mutate,
    validatePhases: (phases) =>
      engine.validMedicationPhases(compilePhases(engine, phases)),
    prepareRestore: (mode) => accountSync.prepareRestore(mode),
    clearRecovery: () => accountSync.clearRecovery(),
  },
  closeMedicationContext: () => medicines.closeContext(),
  refreshFields: (container: HTMLElement) => pickers.refresh(container),
  renderRoutine: (
    ...args: Parameters<ReturnType<typeof installRoutines>["card"]>
  ) => routines.card(...args),
});
installSupport();
const pickers = installPickers({ selectedDay, today: viewToday, dashboard });
const routines = installRoutines({
  getState: viewState,
  today: viewToday,
  getFamilyView,
  mutate,
  render,
  requestDeletion,
  formatDay: dashboard.formatDay,
  refreshFields: pickers.refresh,
});
const medicines = installMedication({
  getState: viewState,
  today: viewToday,
  getFamilyView,
  mutate,
  requestDeletion,
  pickers,
  formatDay: dashboard.formatDay,
});
const { openEditor } = medicines;
const accountSync = createCareSync({
  transport: accountTransport,
  reload: async (changed: boolean) => {
    await reload();
    if (changed) {
      if (care?.intro === "done" && $("app").hidden) showIntro(care, mutate);
      void syncReminders(false, care);
    }
  },
  remindersChanged: changeReminderRevision,
});
let accountDialog: Promise<() => Promise<void>> | undefined;
function openAccount() {
  accountDialog ??= import("./AccountDialog")
    .then(({ installAccount }) =>
      installAccount({
        sync: accountSync,
        formatDay: dashboard.formatDay,
        onSignIn: () => {
          void accountSync.refresh();
          accountSync.signedIn();
          void family.refreshGroup();
        },
        onSignOut: () => {
          void accountSync.signedOut();
          void family.refreshGroup();
        },
        onShortcut: (panel?: string) => {
          dashboard.show("settings", panel === "notification-settings");
          if (panel === "backup-settings")
            document
              .querySelector<HTMLElement>(
                '[data-settings-panel="backup-settings"]',
              )!
              .click();
        },
      }),
    )
    .catch((error: unknown) => {
      accountDialog = undefined;
      throw error;
    });
  return accountDialog
    .then((open) => open())
    .catch(() => {
      showFeedback($("status"), t("ورود فعلاً در دسترس نیست."), "error");
    });
}
for (const control of document.querySelectorAll("[data-open-account]")) {
  control.addEventListener("click", () => void openAccount());
}
const family = installFamilyDialog({
  getState,
  openAccount,
  getFamilyView,
  openPlan: (kind, target) => {
    const open = {
      medicine: openEditor,
      visit: dashboard.openVisit,
      routine: routines.openEditor,
      water: dashboard.openWater,
      cycle: dashboard.openCycle,
    }[kind];
    open(undefined, target);
  },
  setFamilyView: (view: FamilyView | null, feedback = "") => {
    const previous = familyView;
    const changed =
      previous?.member.id !== view?.member.id ||
      previous?.group.id !== view?.group.id;
    const narrowed =
      !changed &&
      view &&
      previous &&
      previous.state !== view.state &&
      familySections.some((key) => previous.has(key) && !view.has(key));
    familyView = view;
    $("app").toggleAttribute("data-family-member", Boolean(view));
    if (changed || narrowed) dashboard.changeContext();
    else if (view && !view.canView(dashboard.screen())) dashboard.show("today");
    else render();
    if (changed || feedback) {
      showFamilyNotice(feedback, view ? 3500 : undefined);
      $("status").textContent = "";
    }
  },
  openProfile: () => {
    dashboard.openSettings(false, "profile-settings");
  },
});
dashboard.setEntryAction(
  installEntryActions({
    currentView: getFamilyView,
    currentDay: dashboard.actionDay,
    open(kind, control) {
      if (kind === "medicine") openEditor();
      else if (kind === "visit") dashboard.openVisit();
      else if (kind === "routine") routines.openEditor();
      else if (kind === "cycle") dashboard.openCycle();
      else if (kind === "sleep") dashboard.openSleep();
      else
        dashboard.openWater(null, null, {
          focusAmount: control?.id === "water-custom-action",
        });
    },
    addWater: dashboard.addWater,
    familyWater: family.quickWater,
  }),
);
$("account-dialog").addEventListener("close", family.openInvitation);
document.querySelector(".app-bar")!.addEventListener(
  "click",
  (event) => {
    if (
      event.target instanceof Element &&
      event.target.closest('[data-open-account], [data-destination="settings"]')
    )
      family.leave();
  },
  true,
);
const params = new URLSearchParams(location.search);
const view = params.get("view");
if (view === "account") void openAccount();

try {
  const initial = await initialCare;
  if ("error" in initial) throw initial.error;
  const restored: CareState = hasStarted(initial.state)
    ? initial.state
    : await accessCare();
  care = restored;
  accountSync.schedule(0);
  const day = params.get("day");
  dayField.value =
    day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : isoDay(today());
  if (!dayField.value) dayField.value = isoDay(today());
  if (/^\d{4}-\d{2}-\d{2}$/.test(day ?? "") && dayField.value) {
    history.replaceState(
      { ...history.state, medoraDay: selectedDay() },
      "",
      location.href,
    );
  }
  if (
    !dashboard.show(routeFromLocation(), false, { mode: "pop", focus: false })
  ) {
    dashboard.show("today", false, { mode: "replace", focus: false });
  }
  $("app").hidden = false;
  $("boot-status").hidden = true;
  showIntro(restored, mutate);
  if (
    !$("app").hidden &&
    (view === "settings" || view === "notification-settings")
  ) {
    dashboard.show("settings", view === "notification-settings");
  }
  if (!$("app").hidden && params.has("log")) {
    if (view === "cycle") dashboard.openCycleDay();
    if (view === "sleep") dashboard.openSleep();
    params.delete("log");
    history.replaceState(history.state, "", `?${params}`);
  }
  const routineId = params.get("routine");
  if (
    !$("app").hidden &&
    view === "routines" &&
    validRoutineId(routineId) &&
    day === dayField.value
  ) {
    const date = selectedDay();
    routines.openReminder(
      currentIndex()
        .routinesOn(date)
        .find((entry: { id: string }) => entry.id === routineId),
      date,
    );
    params.delete("routine");
    history.replaceState(history.state, "", `?${params}`);
  }
  if (!location.search) void reportDailyOpen();
  void import("./Promotions")
    .then(({ installPromotion }) => installPromotion(loadOperations))
    .catch(() => {});
  family.openInvitation();
  void family.refreshGroup();
  window.addEventListener(
    "online",
    () =>
      void (reminderView().canEnable
        ? syncReminders(true)
        : initializeReminders()),
  );
  void initializeReminders();
} catch (error) {
  $("welcome-screen").hidden = true;
  $("care-main").hidden = false;
  $("boot-status").hidden = false;
  $("boot-retry").hidden = false;
  $("boot-status").textContent = t(
    storageMessage(
      error,
      "ui.the-schedule-engine-or-local-storage-is-unavailable",
    ),
  );
  showStorageRecovery($("boot-recovery"));
}

export function finishOnboarding() {
  if (!care) return false;
  return hasStarted(care) || finishIntro(mutate);
}
