import { button, element } from "../shared/ui/dom.js";

export function renderWeek(host, days, choose) {
  const controls = days.map(day => {
    const control = button(day.number + " ", () => choose(day.value));
    control.append(element("span", day.weekday));
    control.setAttribute("aria-label", day.label);
    control.dataset.focusKey = "day-" + day.value;
    control.setAttribute("aria-pressed", String(day.selected));
    if (day.today) control.setAttribute("aria-current", "date");
    return control;
  });
  host.replaceChildren(...controls);
}
