import { $, button, element } from "../medication/shared/ui/dom.js";
import { shortWeek, weekIndex } from "../medication/shared/i18n/locale.js";
import { isoDay } from "../medication/domain/care-index.js";

export function installCalendarPreview(dates, today) {
  let selected = today;
  let month = dates.monthStart(today);

  function dateButton(day, select) {
    const control = button(dates.dayNumber(day), select);
    control.dataset.date = isoDay(day);
    control.setAttribute("aria-label", dates.formatDay(day, true));
    control.setAttribute("aria-pressed", String(day === selected));
    if (day === today) control.setAttribute("aria-current", "date");
    return control;
  }

  function render() {
    $("day").value = isoDay(selected);
    $("day-label").textContent = dates.month(selected);
    $("today-reset").hidden = selected === today;
    $("day-week").replaceChildren(...Array.from({ length: 7 }, (_, index) => {
      const day = selected + index - 3;
      const control = dateButton(day, () => choose(day, "day-week"));
      control.append(element("span", shortWeek[weekIndex(day)]));
      return control;
    }));
    $("gallery-month-label").textContent = dates.month(month);
    $("gallery-month-reset").hidden = selected === today && month === dates.monthStart(today);

    const cycle = $("cycle-preview").checked;
    const headings = shortWeek.map(label => element("span", label, "gallery-weekday"));
    const empty = Array.from({ length: weekIndex(month) }, () => element("span"));
    const days = Array.from({ length: dates.monthStart(month + 32) - month }, (_, index) => {
      const day = month + index;
      const control = dateButton(day, () => choose(day, "gallery-month-days"));
      const offset = day - today;
      const status = offset >= -8 && offset <= -6 ? "recorded" : offset >= 3 && offset <= 6 ? "forecast" : "";
      if (cycle && status) {
        control.dataset.cycleStatus = status;
        const key = status === "recorded" ? "gallery-legend-recorded" : "gallery-legend-forecast";
        control.setAttribute("aria-label", dates.formatDay(day, true) + " · " + $(key).textContent);
      }
      return control;
    });
    $("gallery-month-days").replaceChildren(...headings, ...empty, ...days);
    $("gallery-calendar-legend").hidden = !cycle;
    $("gallery-agenda-date").textContent = dates.formatDay(selected, true);
  }

  function choose(day, focusId) {
    selected = day;
    month = dates.monthStart(day);
    render();
    if (focusId) $(focusId).querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
  }

  for (const [id, delta] of [["previous-day", -1], ["next-day", 1]]) {
    $(id).addEventListener("click", () => choose(selected + delta));
  }
  for (const [id, delta] of [["gallery-month-previous", -1], ["gallery-month-next", 32]]) {
    $(id).addEventListener("click", () => {
      month = dates.monthStart(month + delta);
      render();
    });
  }
  for (const [id, grid] of [["today-reset", "day-week"], ["gallery-month-reset", "gallery-month-days"]]) {
    $(id).addEventListener("click", () => choose(today, grid));
  }
  for (const id of ["day-week", "gallery-month-days"]) {
    $(id).addEventListener("keydown", event => {
      const day = event.target.closest("[data-date]")?.dataset.date;
      if (!day) return;
      const rtl = document.documentElement.dir === "rtl";
      const delta = { ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
      if (delta === undefined) return;
      event.preventDefault();
      choose(Date.parse(day + "T00:00:00Z") / 86400000 + delta, id);
    });
  }
  $("cycle-preview").addEventListener("change", render);
  render();
  return { choose, selected: () => selected };
}
