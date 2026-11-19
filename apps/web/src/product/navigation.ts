import { installDayNavigation } from "./dayNavigation";
import { installRoutes, type Screen } from "./routes";
import {
  defaultCalendar,
  listSeparator,
  t,
} from "../../product-assets/public/medication/shared/i18n/locale.js";
import { setPressed } from "../../product-assets/public/medication/shared/ui/controls.js";
import { installInsights } from "./insights/Insights";
import { applyDisplay } from "../../product-assets/public/medication/styles/display.js";
import { installSettings } from "../../product-assets/public/medication/features/settings/dialog.js";
import { installAppointments } from "./appointments/Appointments";
import { installWater } from "./waterController";
import { calendarFormat } from "../../product-assets/public/medication/shared/ui/calendar-format.js";
import { isoDay as iso } from "../../product-assets/public/medication/domain/care-index.js";
import { cycleIsEnabled } from "../../product-assets/public/medication/domain/profile.js";
import { familyPlacementOf } from "../../product-assets/public/medication/domain/family.js";
import { sleepIsEnabled } from "../../product-assets/public/medication/domain/sleep.js";
import { installSleep } from "./sleepController";
import { installDailyCycle } from "../../product-assets/public/medication/features/cycle/daily.js";
import { installCycle } from "./cycle/PeriodEditor";
import { installCycleDayEditor } from "./cycle/DayEditor";
import { installCycleTools } from "./cycle/CycleTools";
import { refreshArtwork } from "../../product-assets/public/medication/design/three-dimensional.js";

import type { createCareIndex } from "../../product-assets/public/medication/domain/care-index.js";
import type { installDeletion } from "./DeleteConfirmation";
import { renderMedicationSnooze } from "./medication/MedicationSnooze";
import type { RenderDose } from "./medication/Medication";
import type { installRoutines } from "./routines/Routines";
import type { CareState, FamilyView } from "./product";
import { clearFeature } from "./renderer";
import { renderPreferences } from "./settings/Preferences";
import { renderStory } from "./TodayStory";

function $<T extends HTMLElement = HTMLElement>(id: string) {
  return document.getElementById(id)! as T;
}

const titles: Record<Screen, string> = {
  today: t("ui.today"),
  medications: t("ui.medicines"),
  appointments: t("ui.visits"),
  routines: t("ui.routines"),
  insights: t("ui.reports-calendar"),
  water: t("ui.water"),
  cycle: t("ui.cycle"),
  sleep: t("ui.sleep"),
};

type Entry = (kind: "water") => void;
type Index = ReturnType<typeof createCareIndex>;
interface Options {
  getState(): CareState | undefined;
  getIndex(): Index;
  getFamilyView(): FamilyView | null;
  getPersonalState(): CareState | undefined;
  selectedDay(): number;
  today(): number;
  render(): void;
  mutate(
    change: (state: CareState) => void,
    success: string,
    scheduleChanged?: boolean,
    day?: number,
  ): Promise<boolean>;
  requestDeletion: ReturnType<typeof installDeletion>;
  renderDose: RenderDose;
  disposeDoseCards(list: HTMLElement): void;
  closeMedicationContext(): void;
  renderBackup(panel: HTMLElement): () => void;
  renderRoutine: ReturnType<typeof installRoutines>["card"];
  refreshFields(container: HTMLElement): void;
}

export function installNavigation({
  getState,
  getIndex,
  getFamilyView,
  getPersonalState,
  selectedDay,
  today,
  render,
  mutate,
  requestDeletion,
  renderDose,
  disposeDoseCards,
  closeMedicationContext,
  renderBackup,
  renderRoutine,
  refreshFields,
}: Options) {
  let screen: Screen = "today";
  let calendar: string = defaultCalendar;
  let dates = calendarFormat(calendar);
  const actionDay = () =>
    screen === "insights" ? insights.actionDay() : selectedDay();

  const formatDay = (day: number, includeWeekday?: boolean) =>
    dates.formatDay(day, includeWeekday);
  const monthStart = (day: number) => dates.monthStart(day);

  const days = installDayNavigation({
    root: $("app"),
    getDates: () => dates,
    render,
    selectedDay,
    today,
    onDayChange(destination) {
      if (destination === "appointments") setVisitFilter("day");
    },
  });
  const settings = installSettings({
    renderPreferences,
    renderSnooze: renderMedicationSnooze,
    renderBackup,
    getState: getPersonalState,
    mutate,
    refreshFields,
  });
  const water = installWater({
    getState: () => getState()!,
    selectedDay,
    today,
    actionDay,
    getFamilyView,
    mutate,
    refreshFields,
    formatDay,
    formatShortDate: (day) => dates.shortDate(day),
  });
  const appointments = installAppointments({
    getState,
    getFamilyView,
    today,
    selectedDate: () => {
      if (
        screen === "insights" ||
        ((screen === "today" || screen === "appointments") &&
          selectedDay() !== today()) ||
        (screen === "appointments" && appointments.isDayFiltered())
      )
        return actionDay();
    },
    render,
    mutate,
    requestDeletion,
    refreshFields,
    formatDay,
    formatDayNumber: (day: number) => dates.dayNumber(day),
    formatShortMonth: (day: number) => dates.shortMonth(day),
  });
  const insights = installInsights({
    root: document.querySelector<HTMLElement>('[data-screen="insights"]')!,
    today,
    getFamilyView,
    getDates: () => dates,
    render,
    renderDose,
    renderRoutine,
    visitCard: appointments.visitCard,
    openWaterHistory: () => show("water"),
    openWater: () => entry?.("water"),
    openSleep: (day: number) => sleep.open(undefined, undefined, day),
    openSleepHistory: (day: number) => {
      show("sleep");
      sleep.focusDay(day);
    },
    cycleOpenDay: (day: number) => cycleDaily.open(day),
    openCycleHistory: showCycleHistory,
  });
  const cycle = installCycle({
    getState,
    getFamilyView,
    getDates: () => dates,
    mutate,
    today,
    requestDeletion,
    refreshFields,
    openCalendar(day: number) {
      insights.openCalendar(day);
      show("insights");
    },
  });
  const sleep = installSleep({
    getState,
    getFamilyView,
    getDates: () => dates,
    mutate,
    today,
    actionDay,
    requestDeletion,
    refreshFields,
    render,
  });
  $("today-sleep-history").addEventListener("click", () => {
    const day = selectedDay();
    queueMicrotask(() => {
      if (screen === "sleep") sleep.focusDay(day);
    });
  });
  const canUseCycle = () =>
    !getFamilyView() && Boolean(getState() && cycleIsEnabled(getState()));
  let cycleToolsInstalled = false;
  const cycleDaily = installDailyCycle({
    reactTools: true,
    getState,
    getFamilyView,
    getDates: () => dates,
    getIndex,
    mutate,
    today,
    actionDay,
    requestDeletion,
    refreshFields,
    editCycle: cycle.open,
    openEditor: installCycleDayEditor({
      getState,
      today,
      formatDay,
      refreshFields,
      mutate,
      requestDeletion,
      canOpen: canUseCycle,
    }),
    openSettings: () => {
      settings();
      $("settings-open-cycle").click();
    },
  });
  $("reports-panel").addEventListener("click", (event) => {
    if (
      !(event.target instanceof Element) ||
      !event.target.closest("#report-sleep-card .report-card-open")
    )
      return;
    queueMicrotask(() => {
      if (screen === "sleep") sleep.focusDay(undefined);
    });
  });
  let entry: Entry | undefined;
  const { show } = installRoutes({
    root: $("app"),
    titles,
    openSettings: settings,
    canOpen: (destination) =>
      (getFamilyView()?.canView(destination) ?? true) &&
      (destination !== "cycle" || cycleIsEnabled(getState())) &&
      (destination !== "sleep" || sleepIsEnabled(getState())),
    activate(destination, previous, mode) {
      days.activate(destination, mode, actionDay());
      if (previous === "insights" && destination !== previous) insights.stop();
      screen = destination;
      $("today-story").hidden = screen !== "today";
      if (screen !== "today") $("header-date").textContent = "";
      document.querySelector<HTMLElement>(".app-bar .brand-mark")!.hidden =
        !$("screen-back").hidden;
      render();
    },
  });
  function showCycleHistory() {
    if (show("cycle") && !$("cycle-records").hidden) {
      $("cycle-records").scrollIntoView({ block: "start" });
      $("cycle-history-title").focus({ preventScroll: true });
    }
  }
  $("program-cycle").addEventListener("click", showCycleHistory);

  function renderTodayHeader(day: number, summary: string) {
    const view = getFamilyView();
    const title = view
      ? t(day === today() ? "امروزِ {0}" : "برنامهٔ {0}", view.firstName)
      : day === today()
        ? t("ui.today-with-medora")
        : t("ui.schedule-for-this-day");
    const label = formatDay(day, true);
    renderStory(
      $("today-story"),
      iso(day),
      dates.weekday(day) + listSeparator + dates.shortDate(day),
      label,
      title,
      summary,
    );
    $("header-date").textContent = label;
  }

  function renderScreen(state: CareState, day: number, index: Index) {
    const view = getFamilyView();
    const preferences = getPersonalState() ?? state;
    const familyPlacement = familyPlacementOf(preferences.familyPlacement);
    const familyContext = $("family-context");
    const familyHost =
      view && screen === "insights"
        ? $("insights-header")
        : !view && screen === "today" && familyPlacement === "bottom"
          ? $("today-family-bottom")
          : $("app");
    if (familyContext.parentElement !== familyHost) {
      if (familyHost === $("app")) $("today-story").before(familyContext);
      else familyHost.prepend(familyContext);
    }
    familyContext.hidden =
      !view && (screen !== "today" || familyPlacement === "hidden");
    const preferredCalendar = preferences.calendar ?? defaultCalendar;
    if (calendar !== preferredCalendar) {
      calendar = preferredCalendar;
      dates = calendarFormat(calendar);
    }
    const previousFinish = document.body.dataset.finish;
    applyDisplay(preferences, { finish: "glass" });
    if (previousFinish !== document.body.dataset.finish)
      refreshArtwork(document.body.dataset.finish);
    const cycleEnabled = cycleIsEnabled(state);
    const sleepEnabled = sleepIsEnabled(state) && (!view || view.has("sleep"));
    const cycleShortcut =
      cycleEnabled &&
      (view ? view.canView("cycle") : !state.cycleOptions?.hideToday);
    const sleepCompact = preferences.sleepCardSize === "compact";
    const cycleCompact = preferences.cycleCardSize === "compact";
    const shortcuts = $("today-programs");
    for (const control of shortcuts.querySelectorAll<HTMLElement>(
      "[data-destination]:not(#program-sleep, #program-cycle-compact)",
    )) {
      control.hidden = Boolean(
        view && !view.canView(control.dataset.destination ?? ""),
      );
    }
    $("program-sleep").hidden = !sleepEnabled || !sleepCompact;
    $("program-cycle-compact").hidden = !cycleShortcut || !cycleCompact;
    const shortcutCount = shortcuts.querySelectorAll(
      ".program-card:not([hidden])",
    ).length;
    const columns = shortcutCount > 3 ? 2 : Math.max(1, shortcutCount);
    shortcuts.hidden = shortcutCount === 0;
    shortcuts.toggleAttribute("data-two-column", columns === 2);
    shortcuts.style.setProperty("--program-columns", String(columns));
    document.querySelector<HTMLElement>(
      '.dock [data-destination="insights"]',
    )!.hidden = Boolean(view && !view.canView("insights"));
    for (const [id, kind] of [
      ["add", "medicine"],
      ["visit-add", "visit"],
      ["routine-add", "routine"],
      ["cycle-add", "cycle"],
    ] as const) {
      $(id).hidden = Boolean(
        view && !(kind === "cycle" ? view.canRecord(kind) : view.canAdd(kind)),
      );
    }
    const dayForEntry = actionDay();
    const quickItems = $("quick-dialog").querySelectorAll<
      HTMLButtonElement & {
        dataset: { quickKind: Parameters<FamilyView["canAdd"]>[0] };
      }
    >("[data-quick-kind]");
    for (const item of quickItems) {
      const kind = item.dataset.quickKind;
      const record = kind === "water" || kind === "cycle";
      item.hidden = view
        ? !(record ? view.canRecord(kind, dayForEntry) : view.canAdd(kind))
        : (kind === "cycle" && !cycleEnabled) ||
          (kind === "sleep" && !sleepEnabled);
      item.disabled = !view && kind === "water" && dayForEntry > today();
    }
    $("open-quick").hidden = [...quickItems].every((item) => item.hidden);
    for (const label of document.querySelectorAll<HTMLElement>(
      "[data-family-scope]",
    )) {
      label.hidden = Boolean(
        view && !view.canView(label.dataset.familyScope ?? ""),
      );
    }
    $("plans-title").textContent = t(view ? "ui.medicines" : "ui.my-medicines");
    $("visits-title").textContent = t(view ? "ui.visits" : "ui.my-visits");
    $("routine-banner-title").textContent = t(
      view ? "روتین‌ها" : "روتین‌های من",
    );
    const reminderSetup = $("today-reminders");
    const hasPlans = [state.medicines, state.visits, state.routines].some(
      (plans) => Object.keys(plans ?? {}).length > 0,
    );
    reminderSetup.toggleAttribute(
      "data-eligible",
      !view &&
        (hasPlans ||
          state.waterReminders?.enabled === true ||
          (sleepEnabled &&
            Boolean(
              state.sleepSettings?.bedtime || state.sleepSettings?.wake,
            )) ||
          (cycleEnabled &&
            Number.isInteger(state.cycleOptions?.minute) &&
            !state.cycleLocalOnly)),
    );
    reminderSetup.hidden =
      !reminderSetup.hasAttribute("data-eligible") ||
      Boolean(state.reminders?.enabled);
    if (!sleepEnabled && screen === "sleep") {
      show("today");
      return;
    }
    if (!cycleEnabled) {
      $<HTMLDialogElement>("cycle-dialog").close();
      cycleDaily.close();
      cycle.reset();
      if (screen === "cycle") {
        show("today");
        return;
      }
    }
    days.paint(day);
    const goal = state.waterGoal ?? 2000;
    if (screen === "today" || screen === "water") {
      const total = index.waterTotal(day);
      const progress = Math.min(1, total / goal);
      if (screen === "today") {
        sleep.paintToday(state, day, sleepEnabled, sleepCompact);
        cycleDaily.paintToday(state, day, cycleShortcut, cycleCompact);
        $("cycle-companion-card").hidden =
          !view ||
          (!state.cycleCompanionEstimate && !state.cycleCompanionMessage);
        $("cycle-companion-estimate").textContent = state.cycleCompanionEstimate
          ? t(
              "ui.estimated-value-to-value",
              dates.formatDay(state.cycleCompanionEstimate.first),
              dates.formatDay(state.cycleCompanionEstimate.last),
            )
          : "";
        $("cycle-companion-message").textContent =
          state.cycleCompanionMessage ?? "";
        water.renderTodayWater(state, day, total, goal, progress);
      } else water.renderWater(day, index, total, goal, progress);
    } else if (screen === "cycle") {
      if (canUseCycle() && !cycleToolsInstalled) {
        installCycleTools($("cycle-tools-react"), $("cycle-print-view"), {
          getState,
          canUse: canUseCycle,
          today,
          refreshFields,
          mutate,
        });
        cycleToolsInstalled = true;
      }
      cycle.render(state);
      cycleDaily.paint(state);
    } else if (screen === "sleep") sleep.draw(state);
    else if (screen === "appointments") appointments.renderVisits(index, day);
    else if (screen === "insights") insights.paint(state, index);
  }

  const visitFilters = document.querySelectorAll<HTMLElement>(
    "[data-visit-filter]",
  );
  function setVisitFilter(value: string | undefined) {
    setPressed(
      visitFilters,
      (option: HTMLElement) => option.dataset.visitFilter === value,
    );
    appointments.setFilter(value);
  }
  for (const option of visitFilters)
    option.addEventListener("click", () => {
      setVisitFilter(option.dataset.visitFilter);
      render();
    });
  function changeContext() {
    days.reset();
    insights.reset();
    cycle.reset();
    cycleDaily.close();
    sleep.reset();
    setVisitFilter("all");
    for (const panel of $("app").querySelectorAll("[data-screen]")) {
      for (const list of panel.querySelectorAll<HTMLElement>(
        "[data-context-list]",
      )) {
        disposeDoseCards(list);
        clearFeature(list);
      }
      for (const search of panel.querySelectorAll<HTMLInputElement>(
        'input[type="search"]',
      ))
        search.value = "";
    }
    closeMedicationContext();
    appointments.close();
    show("today", false, { mode: "replace" });
  }
  return {
    changeContext,
    setEntryAction: (action: Entry) => {
      entry = action;
    },
    openVisit: appointments.openVisit,
    openWater: water.openWater,
    addWater: water.addWater,
    quickAddWater: water.quickAddWater,
    openCycle: cycle.open,
    openCycleDay: cycleDaily.open,
    openSleep: sleep.open,
    dayVisits: appointments.dayVisits,
    renderScreen,
    renderTodayHeader,
    monthStart,
    chooseDay: days.chooseDay,
    show,
    actionDay,
    screen: () => screen,
    formatDay,
    formatMonth: (day: number) => dates.month(day),
    formatYear: (day: number) => dates.year(day),
    yearStart: (day: number) => dates.yearStart(day),
    formatShortMonth: (day: number) => dates.shortMonth(day),
    formatDayNumber: (day: number) => dates.dayNumber(day),
    dateLimit: () => (screen === "water" ? today() : Infinity),
  };
}
