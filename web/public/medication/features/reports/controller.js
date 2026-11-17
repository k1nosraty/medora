import { weekIndex } from "../../shared/i18n/locale.js";
import { renderCalendar, renderReports } from "./view.js";

export function installInsights({ root, today, getFamilyView, getDates, render, renderDose, renderRoutine, visitCard, openWater, openWaterHistory }) {
  const get = id => root.querySelector("#" + id);
  let section = "calendar";
  let selection = today();
  let period = "month";
  let timer;

  function options(attribute, select) {
    const key = `data-${attribute}`;
    const buttons = root.querySelectorAll(`[${key}]`);
    function choose(value) {
      for (const option of buttons) option.setAttribute("aria-pressed", String(option.getAttribute(key) === value));
      select(value);
    }
    for (const button of buttons) button.addEventListener("click", () => {
      choose(button.getAttribute(key));
      render();
    });
    return choose;
  }
  const selectSection = options("insight", value => {
    section = value;
    get("calendar-panel").hidden = value !== "calendar";
    get("reports-panel").hidden = value !== "reports";
  });
  options("report-range", value => { period = value; });

  function choose(day, focus = false) {
    selection = day;
    render();
    if (focus) get("calendar-days").querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
  }
  get("calendar-today").addEventListener("click", () => choose(today(), true));
  for (const [id, delta] of [["previous-month", -1], ["next-month", 32]]) {
    get(id).addEventListener("click", () => {
      const { monthStart } = getDates();
      const oldStart = monthStart(selection);
      const start = monthStart(oldStart + delta);
      choose(Math.min(monthStart(start + 32) - 1, start + selection - oldStart));
    });
  }

  function stop() { clearTimeout(timer); }
  function paint(state, index) {
    stop();
    const { monthStart, year, formatDay, month, dayNumber, shortDate } = getDates();
    const view = getFamilyView();
    const last = today();
    if (section === "calendar") {
      const start = monthStart(selection);
      renderCalendar(state, index, {
        day: selection, start, end: monthStart(start + 32) - 1, today: last, formatDay,
        formatMonth: month, formatNumber: dayNumber, selectDay: choose,
        renderDose, renderRoutine, visitCard, openWaterHistory,
        canAddWater: selection <= last && (!view || view.canRecord("water", selection)), addWater: openWater
      });
      return;
    }
    let first = period === "week" ? last - weekIndex(last) : monthStart(last);
    if (period === "year") while (year(first - 1) === year(last)) first = monthStart(first - 1);
    renderReports({ first, last, period }, state.waterGoal ?? 2000, index, shortDate, formatDay, monthStart, state);
    for (const [id, scope] of [["water", "water"], ["dose", "doses"], ["routine", "routines"], ["visit", "visits"]]) {
      get(`report-${id}-title`).closest("section").hidden = view ? !view.has(scope) : false;
    }
    timer = setTimeout(render, 60_000 - Date.now() % 60_000);
  }

  function reset() {
    selection = today();
    for (const id of ["calendar-days", "calendar-entries", "report-chart", "report-chart-dates", "report-chart-pick"]) get(id).replaceChildren();
    delete get("report-chart").dataset.chartKey;
    get("report-chart-pick").onchange = null;
    for (const id of ["report-chart-previous", "report-chart-next"]) get(id).onclick = null;
  }
  return { paint, stop, reset, actionDay: () => section === "calendar" ? selection : today(),
    openCalendar(day) {
      selection = day;
      selectSection("calendar");
    }
  };
}
