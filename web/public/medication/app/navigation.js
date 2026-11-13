import { defaultCalendar, listSeparator, shortWeek, t, weekIndex } from "../shared/i18n/locale.js";
import { $, button, element } from "../shared/ui/dom.js";
import { renderCalendar, renderReports } from "../features/reports/view.js";
import { applyDisplay } from "../styles/display.js";
import { installSettings } from "../features/settings/dialog.js";
import { installAppointments } from "../features/appointments/editor.js";
import { installWater } from "../features/water/controller.js";
import { calendarFormat } from "../shared/ui/calendar-format.js";
import { isoDay as iso } from "../domain/care-index.js";
import { cycleIsEnabled } from "../domain/profile.js";
import { installCycle } from "../features/cycle/controller.js";
import { refreshArtwork } from "../design/three-dimensional.js";

const titles = { today: t("امروز"), medications: t("داروها"), appointments: t("قرارها"), routines: t("روتین‌ها"), insights: t("گزارش و تقویم"), water: t("آب"), cycle: t("چرخه") };

export function installNavigation({ getState, selectedDay, today, render, mutate, requestDeletion, renderDose, renderRoutine, refreshFields }) {
  let screen = "today";
  const selectedDates = new Map();
  const dayWeek = $("day-week");
  let weekSlide;
  let insight = "calendar";
  let calendarSelection = today();
  let waterBack = "today";
  let reportPeriod = "month";
  let reportTimer;
  let calendar = defaultCalendar;
  let dates = calendarFormat(calendar);
  const actionDay = () => screen === "insights" ? (insight === "calendar" ? calendarSelection : today()) : selectedDay();

  const formatDay = (day, includeWeekday) => dates.formatDay(day, includeWeekday);
  const monthStart = day => dates.monthStart(day);

  function chooseDay(day, restoreFocus) {
    if (screen === "today" || screen === "medications") {
      if (day === today()) selectedDates.delete(screen);
      else selectedDates.set(screen, day);
    }
    $("day").value = iso(day);
    render();
    if (restoreFocus) $(restoreFocus).querySelector('[aria-current="date"]')?.focus();
  }
  const settings = installSettings({ getState, mutate, refreshFields });
  const water = installWater({
    getState, selectedDay, today, actionDay, mutate, refreshFields, formatDay,
    formatShortDate: day => dates.shortDate(day)
  });
  const appointments = installAppointments({
    getState, today, defaultDay: () => screen === "insights" ? actionDay() : today(),
    render, mutate, requestDeletion, refreshFields, formatDay,
    formatDayNumber: day => dates.dayNumber(day),
    formatShortMonth: day => dates.shortMonth(day)
  });
  const cycle = installCycle({ getState, mutate, today, formatDay, requestDeletion, refreshFields });

  function show(destination, notifications = false) {
    if (destination === "cycle" && !cycleIsEnabled(getState())) return;
    if (destination === "settings") {
      settings(notifications);
      return;
    }
    if (destination === "water") {
      waterBack = screen === "insights" ? "insights" : "today";
      $("day").value = iso(Math.min(actionDay(), today()));
    }
    if (destination === "today" || destination === "medications") $("day").value = iso(selectedDates.get(destination) ?? today());
    screen = destination;
    const dayControls = $("day-controls");
    if (screen === "medications") $("med-day-title").after(dayControls);
    else if (screen === "routines") $("routine-dates").append(dayControls);
    else if (screen === "water") document.querySelector('[data-screen="water"]').prepend(dayControls);
    else $("today-dates").append(dayControls);
    $("today-story").hidden = screen !== "today";
    $("app").dataset.activeScreen = screen;
    for (const view of document.querySelectorAll("[data-screen]")) view.hidden = view.dataset.screen !== screen;
    for (const item of document.querySelectorAll(".dock [data-destination]")) {
      if (item.dataset.destination === (screen === "insights" ? "insights" : "today")) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    }
    $("screen-title").textContent = titles[screen];
    if (screen !== "today") $("header-date").textContent = "";
    $("screen-back").hidden = screen === "today" || screen === "insights";
    document.querySelector(".app-bar .brand-mark").hidden = !$("screen-back").hidden;
    dayControls.hidden = !["today", "water", "medications", "routines"].includes(screen);
    dayControls.classList.toggle("single-date", screen !== "today");
    dayControls.classList.toggle("compact-day", screen === "medications" || screen === "routines");
    $("today-reset").hidden = screen !== "today" || selectedDay() === today();
    render();
    scrollTo(0, 0);
  }
  $("screen-back").addEventListener("click", () => show(screen === "water" ? waterBack : "today"));
  for (const button of document.querySelectorAll("[data-destination]")) {
    button.addEventListener("click", () => show(button.dataset.destination, button.hasAttribute("data-open-notifications")));
  }
  for (const [id, delta] of [["previous-day", -1], ["next-day", 1]]) {
    $(id).addEventListener("click", () => {
      const animate = screen === "today" && !matchMedia("(prefers-reduced-motion: reduce)").matches;
      const outgoing = animate ? dayWeek.children[delta > 0 ? 0 : 6]?.cloneNode(true) : null;
      chooseDay(selectedDay() + delta);
      if (!outgoing) return;
      outgoing.inert = true;
      outgoing.setAttribute("aria-hidden", "true");
      outgoing.classList.add("day-week-ghost");
      outgoing.dataset.edge = delta > 0 ? "start" : "end";
      dayWeek.append(outgoing);
      const direction = document.documentElement.dir === "rtl" ? -1 : 1;
      weekSlide = dayWeek.animate(
        [{ transform: `translateX(${direction * delta * 100 / 7}%)` }, { transform: "none" }],
        { duration: 210, easing: "ease-out" }
      );
      weekSlide.onfinish = () => outgoing.remove();
    });
  }
  $("today-reset").addEventListener("click", () => {
    chooseDay(today(), "day-week");
  });

  function dateButton(day, selected, choose) {
    const control = button(dates.dayNumber(day), () => choose(day));
    control.setAttribute("aria-label", formatDay(day, true));
    if (day === selected) control.setAttribute("aria-current", "date");
    return control;
  }

  function reportStart(day) {
    if (reportPeriod === "week") return day - weekIndex(day);
    let start = monthStart(day);
    if (reportPeriod === "year") {
      const year = dates.year(day);
      while (dates.year(start - 1) === year) start = monthStart(start - 1);
    }
    return start;
  }

  function renderTodayHeader(day) {
    $("story-date").dateTime = iso(day);
    $("story-date").textContent = dates.weekday(day) + listSeparator + dates.shortDate(day);
    $("story-date").setAttribute("aria-label", formatDay(day, true));
    $("story-title").textContent = day === today() ? t("امروز با مدورا") : t("برنامهٔ این روز");
    $("today-reset").hidden = day === today();
    weekSlide?.cancel();
    dayWeek.replaceChildren(...Array.from({ length: 7 }, (_, offset) => {
      const date = day - 3 + offset;
      const control = dateButton(date, day, selected => chooseDay(selected, "day-week"));
      if (date === today()) control.classList.add("calendar-today");
      control.append(element("span", shortWeek[weekIndex(date)]));
      return control;
    }));
    $("header-date").textContent = formatDay(day, true);
  }

  function renderScreen(state, day, index) {
    clearTimeout(reportTimer);
    const preferredCalendar = state.calendar ?? defaultCalendar;
    if (calendar !== preferredCalendar) {
      calendar = preferredCalendar;
      dates = calendarFormat(calendar);
    }
    const previousFinish = document.body.dataset.finish;
    applyDisplay(state);
    if (previousFinish !== document.body.dataset.finish) refreshArtwork(document.body.dataset.finish);
    const cycleEnabled = cycleIsEnabled(state);
    $("program-cycle").hidden = $("quick-cycle").hidden = !cycleEnabled;
    document.body.toggleAttribute("data-cycle-enabled", cycleEnabled);
    if (!cycleEnabled) {
      $("cycle-dialog").close();
      $("cycle-history").replaceChildren();
      if (screen === "cycle") {
        show("today");
        return;
      }
    }
    if (["today", "medications", "water", "routines"].includes(screen)) {
      $("day-label").textContent = screen === "today" ? dates.month(day) : day === today() ? t("امروز") : formatDay(day);
      $("pick-day").setAttribute("aria-label", t("انتخاب تاریخ، {0}", formatDay(day, true)));
    }
    const goal = state.waterGoal ?? 2000;
    if (screen === "today" || screen === "water") {
      const total = index.waterTotal(day);
      const progress = Math.min(1, total / goal);
      if (screen === "today") {
        renderTodayHeader(day);
        water.renderTodayWater(state, day, total, goal, progress);
      } else water.renderWater(day, index, total, goal, progress);
    } else if (screen === "cycle") cycle.render(state);
    else if (screen === "appointments") appointments.renderVisits(index);
    else if (screen === "insights") {
      if (insight === "calendar") {
        const start = monthStart(calendarSelection);
        renderCalendar(state, index, {
          day: calendarSelection, start, end: monthStart(start + 32) - 1, today: today(),
          formatMonth: day => dates.month(day), formatDay, dateButton, selectDay: selectCalendarDay,
          renderDose, renderRoutine, visitCard: appointments.visitCard,
          openWaterHistory: () => show("water"), addWater: () => water.openWater(null)
        });
      } else {
        const last = today();
        renderReports({ first: reportStart(last), last, period: reportPeriod }, goal, index,
          day => dates.shortDate(day), formatDay, monthStart, state);
        reportTimer = setTimeout(render, 60_000 - Date.now() % 60_000);
      }
    }
  }

  function chooseOption(attribute, change) {
    const options = document.querySelectorAll(`[data-${attribute}]`);
    for (const option of options) option.addEventListener("click", () => {
      for (const item of options) item.setAttribute("aria-pressed", String(item === option));
      change(option.getAttribute(`data-${attribute}`));
      render();
    });
  }
  chooseOption("visit-filter", appointments.setFilter);
  function openInsight(value) {
    insight = value;
    for (const control of document.querySelectorAll("[data-insight]")) {
      control.setAttribute("aria-pressed", String(control.dataset.insight === value));
    }
    $("calendar-panel").hidden = value !== "calendar";
    $("reports-panel").hidden = value !== "reports";
  }
  chooseOption("insight", openInsight);
  chooseOption("report-range", value => { reportPeriod = value; });
  function selectCalendarDay(day, focus = false) {
    calendarSelection = day;
    render();
    if (focus) $("calendar-days").querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
  }
  $("calendar-today").addEventListener("click", () => selectCalendarDay(today(), true));
  for (const [id, delta] of [["previous-month", -1], ["next-month", 32]]) {
    $(id).addEventListener("click", () => {
      const oldStart = monthStart(calendarSelection);
      const nextStart = monthStart(oldStart + delta);
      const nextEnd = monthStart(nextStart + 32) - 1;
      selectCalendarDay(Math.min(nextEnd, nextStart + calendarSelection - oldStart));
    });
  }
  return {
    dayVisits: appointments.dayVisits, renderScreen, monthStart, chooseDay, show, actionDay,
    screen: () => screen,
    formatDay,
    formatMonth: day => dates.month(day),
    formatDayNumber: day => dates.dayNumber(day),
    dateLimit: () => screen === "water" ? today() : Infinity
  };
}
