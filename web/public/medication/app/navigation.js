import { installDayNavigation } from "./day-navigation.js";
import { installRoutes } from "./routes.js";
import { defaultCalendar, listSeparator, t } from "../shared/i18n/locale.js";
import { $ } from "../shared/ui/dom.js";
import { setPressed } from "../shared/ui/controls.js";
import { installInsights } from "../features/reports/controller.js";
import { applyDisplay } from "../styles/display.js";
import { installSettings } from "../features/settings/dialog.js";
import { installAppointments } from "../features/appointments/editor.js";
import { installWater } from "../features/water/controller.js";
import { calendarFormat } from "../shared/ui/calendar-format.js";
import { isoDay as iso } from "../domain/care-index.js";
import { cycleIsEnabled } from "../domain/profile.js";
import { familyPlacementOf } from "../domain/family.js";
import { installCycle } from "../features/cycle/controller.js";
import { refreshArtwork } from "../design/three-dimensional.js";

const titles = { today: t("ui.today"), medications: t("ui.medicines"), appointments: t("ui.visits"), routines: t("ui.routines"), insights: t("ui.reports-calendar"), water: t("ui.water"), cycle: t("ui.cycle") };

export function installNavigation({ getState, getFamilyView, getPersonalState, selectedDay, today, render, mutate, requestDeletion, renderDose, renderRoutine, refreshFields }) {
  let screen = "today";
  let calendar = defaultCalendar;
  let dates = calendarFormat(calendar);
  const actionDay = () => screen === "insights" ? insights.actionDay() : selectedDay();

  const formatDay = (day, includeWeekday) => dates.formatDay(day, includeWeekday);
  const monthStart = day => dates.monthStart(day);

  const days = installDayNavigation({
    root: $("app"), getDates: () => dates, render, selectedDay, today,
    onDayChange(destination) {
      if (destination === "appointments") setVisitFilter("day");
    }
  });
  const settings = installSettings({ getState: getPersonalState, mutate, refreshFields });
  const water = installWater({
    getState, selectedDay, today, actionDay, getFamilyView, mutate, refreshFields, formatDay,
    formatShortDate: day => dates.shortDate(day)
  });
  const appointments = installAppointments({
    getState, getFamilyView, today, selectedDate: () => {
      if (screen === "insights" ||
        (screen === "today" || screen === "appointments") && selectedDay() !== today() ||
        screen === "appointments" && appointments.isDayFiltered()) return actionDay();
    },
    render, mutate, requestDeletion, refreshFields, formatDay,
    formatDayNumber: day => dates.dayNumber(day),
    formatShortMonth: day => dates.shortMonth(day)
  });
  const insights = installInsights({
    root: document.querySelector('[data-screen="insights"]'), today, getFamilyView, getDates: () => dates,
    render, renderDose, renderRoutine, visitCard: appointments.visitCard,
    openWaterHistory: () => show("water"), openWater: () => entry("water")
  });
  const cycle = installCycle({
    getState, getFamilyView, getDates: () => dates, mutate, today, requestDeletion, refreshFields,
    openCalendar(day) {
      insights.openCalendar(day);
      show("insights");
    }
  });
  let entry;
  const { show } = installRoutes({
    root: $("app"), titles, openSettings: settings,
    canOpen: destination => (getFamilyView()?.canView(destination) ?? true) &&
      (destination !== "cycle" || cycleIsEnabled(getState())),
    activate(destination, previous, mode) {
      days.activate(destination, mode, actionDay());
      if (previous === "insights" && destination !== previous) insights.stop();
      screen = destination;
      $("today-story").hidden = screen !== "today";
      if (screen !== "today") $("header-date").textContent = "";
      document.querySelector(".app-bar .brand-mark").hidden = !$("screen-back").hidden;
      render();
    }
  });
  function renderTodayHeader(day) {
    $("story-date").dateTime = iso(day);
    $("story-date").textContent = dates.weekday(day) + listSeparator + dates.shortDate(day);
    $("story-date").setAttribute("aria-label", formatDay(day, true));
    const view = getFamilyView();
    $("story-title").textContent = view ? t(day === today() ? "امروزِ {0}" : "برنامهٔ {0}", view.firstName) :
      day === today() ? t("ui.today-with-medora") : t("ui.schedule-for-this-day");
    $("header-date").textContent = formatDay(day, true);
  }

  function renderScreen(state, day, index) {
    const view = getFamilyView();
    const preferences = getPersonalState();
    const familyPlacement = familyPlacementOf(preferences.familyPlacement);
    const familyContext = $("family-context");
    const familyHost = view && screen === "insights" ? $("insights-header") :
      !view && screen === "today" && familyPlacement === "bottom" ? $("today-family-bottom") : $("app");
    if (familyContext.parentElement !== familyHost) {
      if (familyHost === $("app")) $("today-story").before(familyContext);
      else familyHost.prepend(familyContext);
    }
    familyContext.hidden = !view && (screen !== "today" || familyPlacement === "hidden");
    const preferredCalendar = preferences.calendar ?? defaultCalendar;
    if (calendar !== preferredCalendar) {
      calendar = preferredCalendar;
      dates = calendarFormat(calendar);
    }
    const previousFinish = document.body.dataset.finish;
    applyDisplay(preferences);
    if (previousFinish !== document.body.dataset.finish) refreshArtwork(document.body.dataset.finish);
    const cycleEnabled = cycleIsEnabled(state);
    for (const control of $("today-programs").querySelectorAll("[data-destination]:not(#program-cycle)")) {
      control.hidden = Boolean(view && !view.canView(control.dataset.destination));
    }
    $("today-programs").hidden = Boolean(view && !["medications", "appointments", "routines", "cycle"]
      .some(key => view.canView(key) && (key !== "cycle" || cycleEnabled)));
    document.querySelector('.dock [data-destination="insights"]').hidden = Boolean(view && !view.canView("insights"));
    for (const [id, kind] of [["add", "medicine"], ["visit-add", "visit"], ["routine-add", "routine"], ["cycle-add", "cycle"]]) {
      $(id).hidden = Boolean(view && !(kind === "cycle" ? view.canRecord(kind) : view.canAdd(kind)));
    }
    $("program-cycle").hidden = !cycleEnabled;
    const dayForEntry = actionDay();
    const quickItems = $("quick-dialog").querySelectorAll("[data-quick-kind]");
    for (const item of quickItems) {
      const kind = item.dataset.quickKind;
      const record = kind === "water" || kind === "cycle";
      item.hidden = view ? !(record ? view.canRecord(kind, dayForEntry) : view.canAdd(kind)) : kind === "cycle" && !cycleEnabled;
      item.disabled = !view && kind === "water" && dayForEntry > today();
    }
    $("open-quick").hidden = [...quickItems].every(item => item.hidden);
    if (view) {
      const visible = $("today-programs").querySelectorAll(".program-card:not([hidden])").length;
      $("today-programs").style.setProperty("--family-program-columns", visible === 3 ? "3" : visible === 1 ? "1" : "2");
    }
    for (const label of document.querySelectorAll("[data-family-scope]")) {
      label.hidden = Boolean(view && !view.canView(label.dataset.familyScope));
    }
    $("plans-title").textContent = t(view ? "ui.medicines" : "ui.my-medicines");
    $("visits-title").textContent = t(view ? "ui.visits" : "ui.my-visits");
    $("routine-banner-title").textContent = t(view ? "روتین‌ها" : "روتین‌های من");
    const reminderSetup = $("today-reminders");
    const hasPlans = [state.medicines, state.visits, state.routines].some(plans => Object.keys(plans ?? {}).length > 0);
    reminderSetup.toggleAttribute("data-eligible", !view && (hasPlans || state.waterReminders?.enabled === true));
    reminderSetup.hidden = !reminderSetup.hasAttribute("data-eligible") || Boolean(state.reminders?.enabled);
    document.body.toggleAttribute("data-cycle-enabled", cycleEnabled);
    if (!cycleEnabled) {
      $("cycle-dialog").close();
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
        renderTodayHeader(day);
        water.renderTodayWater(state, day, total, goal, progress);
      } else water.renderWater(day, index, total, goal, progress);
    } else if (screen === "cycle") cycle.render(state);
    else if (screen === "appointments") appointments.renderVisits(index, day);
    else if (screen === "insights") insights.paint(state, index);
  }

  const visitFilters = document.querySelectorAll("[data-visit-filter]");
  function setVisitFilter(value) {
    setPressed(visitFilters, option => option.dataset.visitFilter === value);
    appointments.setFilter(value);
  }
  for (const option of visitFilters) option.addEventListener("click", () => {
    setVisitFilter(option.dataset.visitFilter);
    render();
  });
  function changeContext() {
    days.reset();
    insights.reset();
    cycle.reset();
    setVisitFilter("all");
    for (const panel of $("app").querySelectorAll("[data-screen]")) {
      for (const list of panel.querySelectorAll("[data-context-list]")) list.replaceChildren();
      for (const search of panel.querySelectorAll('input[type="search"]')) search.value = "";
    }
    $("medicine-details-title").textContent = "";
    if ($("medicine-details").open) $("medicine-details").close();
    show("today", false, { mode: "replace" });
  }
  return {
    changeContext, setEntryAction: action => { entry = action; }, openVisit: appointments.openVisit, openWater: water.openWater, addWater: water.addWater, quickAddWater: water.quickAddWater, openCycle: cycle.open, dayVisits: appointments.dayVisits, renderScreen, monthStart, chooseDay: days.chooseDay, show, actionDay,
    screen: () => screen,
    formatDay,
    formatMonth: day => dates.month(day),
    formatYear: day => dates.year(day),
    yearStart: day => dates.yearStart(day),
    formatShortMonth: day => dates.shortMonth(day),
    formatDayNumber: day => dates.dayNumber(day),
    dateLimit: () => screen === "water" ? today() : Infinity
  };
}
