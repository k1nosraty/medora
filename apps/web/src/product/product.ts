import { accountTransport } from "./accountTransport";
import { showFeedback } from "../../../../web/public/medication/shared/ui/controls.js";
import { CareInputError } from "../../../../web/public/medication/shared/ui/care-error.js";
import { installEntryActions } from "./entryActions";
import { preserveFocus } from "../../../../web/public/medication/shared/ui/focus.js";
import { routeFromLocation } from "./routes";
import { installCareSync } from "../../../../web/public/medication/features/sync/controller.js";
import {
  language,
  localizeMarkup,
  selectLanguage,
  t,
} from "../../../../web/public/medication/shared/i18n/locale.js";
import {
  accessCare,
  storageMessage,
} from "../../../../web/public/medication/shared/storage.js";
import { installPickers } from "./Pickers";
import {
  dayNumber,
  today,
} from "../../../../web/public/medication/shared/ui/dates.js";
import { installDeletion } from "./DeleteConfirmation";
import { localZone } from "../../../../web/public/medication/domain/care-plan.js";
import {
  compilePhases,
  createCareIndex,
  isoDay,
} from "../../../../web/public/medication/domain/care-index.js";
import * as engine from "../../../../web/public/medication/domain/medication-rules.js";
import { validRoutineId } from "../../../../web/public/medication/domain/routine-plan.js";
import { familySections } from "../../../../web/public/medication/domain/family.js";
import {
  changeReminderRevision,
  initializeReminders,
  syncReminders,
} from "../../../../web/public/medication/features/reminders/controller.js";
import { installMedicineEditor } from "../../../../web/public/medication/features/medicines/editor.js";
import { installMedicineView } from "../../../../web/public/medication/features/medicines/view.js";
import { installFamily } from "../../../../web/public/medication/features/family/panel.js";
import { renderMemberHeader } from "../../../../web/public/medication/features/family/context.js";
import { installSupport, loadOperations, reportDailyOpen } from "./Operations";
import { installRoutines } from "../../../../web/public/medication/features/routines/view.js";
import { renderToday } from "./Today";
import { installTodayStory } from "../../../../web/public/medication/features/today/story.js";
import { installBackupRestore } from "../../../../web/public/medication/features/backups/dialog.js";
import { installNavigation } from "./navigation";
import { refreshApp } from "./updates";
import { showIntro } from "./Onboarding";
import { installSurfaceArt } from "../../../../web/public/medication/design/surfaces.js";
import { showStorageRecovery } from "./StorageRecovery";
import type { WaterEntry } from "./WaterEntries";
import type { WaterTarget } from "./WaterLogForm";

function $<T extends HTMLElement = HTMLElement>(id: string) {
  return document.getElementById(id)! as T;
}

export type CareState = Omit<Parameters<typeof showIntro>[0], "water"> &
  Parameters<typeof renderToday>[0] & {
    water?: WaterEntry[];
    reminders?: { revision?: number; enabled?: boolean };
    familyPlacement?: string;
    sleepCardSize?: string;
    cycleCardSize?: string;
    cycleOptions?: { hideToday?: boolean; minute?: number };
    sleepSettings?: { bedtime?: string; wake?: string };
    cycleLocalOnly?: boolean;
    cycleCompanionEstimate?: { first: number; last: number };
    cycleCompanionMessage?: string;
  };
type EntryFamilyView = NonNullable<
  ReturnType<Parameters<typeof installEntryActions>[0]["currentView"]>
>;
export interface FamilyView extends EntryFamilyView {
  member: { id: string };
  group: { id: string };
  today: number;
  zone: string;
  firstName: string;
  state: CareState;
  timeOf(day: number, minute: number): number;
  has(section: string): boolean;
  canRecord(kind: "water" | "cycle", day?: number): boolean;
  authorName(entry: { recordedBy?: string }): string;
  canView(section: string): boolean;
  synced: boolean;
}

localizeMarkup();
installSurfaceArt();
installTodayStory($("today-story"));
installSupport();
let care: CareState | undefined;
let busy = false;
let familyView: FamilyView | null = null;
const getFamilyView = () => familyView;
const viewToday = () => familyView?.today ?? today();
const viewState = () => familyView?.state ?? care;
const update = $<HTMLButtonElement>("update-app");
const dayField = $<HTMLInputElement>("day");
const updateStatus = $("app-update-status");
let updateStatusTimer: ReturnType<typeof setTimeout> | undefined;
let familyNoticeTimer: ReturnType<typeof setTimeout> | undefined;
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
    if (
      (await refreshApp({
        canReload: () => !busy && !document.querySelector("dialog[open]"),
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
async function mutate(
  change: (state: CareState) => void,
  success: string,
  scheduleChanged = false,
  day?: number,
) {
  if (busy || familyView) return false;
  busy = true;
  $("app").setAttribute("aria-busy", "true");
  let needsSync = false;
  try {
    care = await accessCare(
      (state: CareState) => {
        const revision = state.reminders?.revision;
        change(state);
        if (scheduleChanged) changeReminderRevision(state);
        needsSync = state.reminders?.revision !== revision;
      },
      { snapshot: care, day },
    );
  } catch (error) {
    showFeedback(
      $("status"),
      error instanceof CareInputError
        ? error.message
        : t(storageMessage(error, "ui.could-not-save-try-again")),
      "error",
    );
    return false;
  } finally {
    busy = false;
    $("app").removeAttribute("aria-busy");
  }
  if (needsSync) void syncReminders(false, care);
  accountSync.schedule();
  try {
    render();
    showFeedback($("status"), success, "success");
  } catch {
    showFeedback($("status"), t("ui.saved-refresh-view"));
  }
  return true;
}

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
    careIndex = createCareIndex(state, engine, zone, day, familyView?.timeOf);
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
    renderToday(
      state,
      day,
      viewToday(),
      index.dosesOn(day),
      dashboard.dayVisits(index, day),
      entries,
      index.waterTotal(day),
      medicines.renderDose,
      routines.card,
      familyView,
    );
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
    showFeedback(
      $("status"),
      t(storageMessage(error, "ui.could-not-read-your-local-records")),
      "error",
    );
  }
}

dayField.addEventListener("change", render);
$("timeline-order").addEventListener("change", render);

const nextLanguage = language === "fa" ? "en" : "fa";
for (const control of document.querySelectorAll<HTMLElement>(
  "[data-language-switch]",
)) {
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
  getIndex: currentIndex,
  selectedDay,
  today: viewToday,
  getFamilyView,
  getPersonalState: getState,
  render,
  mutate,
  requestDeletion,
  renderDose: (
    ...args: Parameters<ReturnType<typeof installMedicineView>["renderDose"]>
  ) => medicines.renderDose(...args),
  refreshFields: (container: HTMLElement) => pickers.refresh(container),
  renderRoutine: (
    ...args: Parameters<ReturnType<typeof installRoutines>["card"]>
  ) => routines.card(...args),
});
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
const medicines = installMedicineView({
  getState: viewState,
  today: viewToday,
  getFamilyView,
  mutate,
  requestDeletion,
  openEditor: (
    medicine: Parameters<ReturnType<typeof installMedicineEditor>>[0],
  ) => openEditor(medicine, undefined),
  formatDay: dashboard.formatDay,
});
const openEditor = installMedicineEditor({
  getState,
  isBusy: () => busy,
  mutate,
  removeMedicine: medicines.deleteMedicine,
  pickers,
  formatDay: dashboard.formatDay,
});
const accountSync = installCareSync({
  transport: accountTransport,
  formatDay: dashboard.formatDay,
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
const family = installFamily({
  getState,
  openAccount,
  actionDay: dashboard.actionDay,
  getFamilyView,
  openPlan: (
    kind: "medicine" | "visit" | "routine" | "water" | "cycle",
    target: WaterTarget & { zone: string },
  ) => {
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
    renderMemberHeader(view);
    if (changed || narrowed) dashboard.changeContext();
    else if (view && !view.canView(dashboard.screen())) dashboard.show("today");
    else render();
    if (changed || feedback) {
      clearTimeout(familyNoticeTimer);
      const notice = $("family-notice");
      notice.textContent = feedback;
      notice.hidden = !feedback;
      if (view && feedback)
        familyNoticeTimer = setTimeout(() => {
          notice.hidden = true;
        }, 3500);
      $("status").textContent = "";
    }
  },
  openProfile: () => {
    dashboard.show("settings");
    document
      .querySelector<HTMLElement>('[data-settings-panel="profile-settings"]')!
      .click();
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
    quickWater: dashboard.quickAddWater,
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

installBackupRestore(
  mutate,
  (phases: unknown) =>
    engine.validMedicationPhases(compilePhases(engine, phases)),
  {
    prepareRestore: accountSync.prepareRestore,
    clearRecovery: accountSync.clearRecovery,
  },
);

try {
  const restored: CareState = await accessCare();
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
  void initializeReminders();
} catch (error) {
  $("boot-status").textContent = t(
    storageMessage(
      error,
      "ui.the-schedule-engine-or-local-storage-is-unavailable",
    ),
  );
  showStorageRecovery($("boot-recovery"));
}
