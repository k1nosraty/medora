import { monthLayout, keepMonthFocus } from "./month-layout.js";
import { button, element } from "./dom.js";

export function renderMonthGrid(root, options) {
  const { weekdays, leading, trailing, days } = monthLayout(options);
  const cells = days.map(day => {
    const control = button(day.number, day.choose);
    control.dataset.focusKey = `month-day-${day.day}`;
    control.tabIndex = day.tabIndex;
    control.disabled = day.disabled;
    control.setAttribute("aria-label", day.label);
    control.setAttribute("aria-pressed", String(day.selected));
    if (day.today) control.setAttribute("aria-current", "date");
    control.addEventListener("keydown", day.move);
    if (day.details) {
      if (day.details.cycle) control.dataset.cycleStatus = day.details.cycle;
      const dots = element("span", "", "calendar-dots");
      dots.setAttribute("aria-hidden", "true");
      dots.append(...day.details.dots.map(kind => element("i", "", kind)));
      control.append(dots);
    }
    return control;
  });
  const blanks = count => Array.from({ length: count }, () => element("span"));
  keepMonthFocus(root, () => root.replaceChildren(
    ...weekdays.map(label => element("span", label, "quiet")), ...blanks(leading), ...cells, ...blanks(trailing)
  ));
}

export function clearMonthGrid(root) { root.replaceChildren(); }
