import { shortWeek, weekIndex } from "../i18n/locale.js";
import { button, element } from "./dom.js";

export function renderMonthGrid(root, { start, end, selected, active = selected, last = Infinity,
  minCells = 0, formatDay, formatNumber, onSelect, onMove = onSelect, decorate = () => {} }) {
  const hadFocus = root.contains(document.activeElement);
  const direction = document.documentElement.dir === "rtl" ? -1 : 1;
  const cells = Array.from({ length: weekIndex(start) }, () => element("span"));
  const tabbable = Math.max(start, Math.min(active, end, last));
  for (let day = start; day <= end; day++) {
    const control = button(formatNumber(day), () => onSelect(day, true));
    control.dataset.focusKey = `month-day-${day}`;
    control.tabIndex = day === tabbable && day <= last ? 0 : -1;
    control.disabled = day > last;
    control.setAttribute("aria-label", formatDay(day, true));
    control.setAttribute("aria-pressed", String(day === selected));
    control.addEventListener("keydown", event => {
      const target = { ArrowLeft: day - direction, ArrowRight: day + direction,
        ArrowUp: day - 7, ArrowDown: day + 7, Home: day - weekIndex(day), End: day + 6 - weekIndex(day) }[event.key];
      if (target === undefined) return;
      event.preventDefault();
      if (target <= last) onMove(target, true);
    });
    decorate(control, day);
    cells.push(control);
  }
  while (cells.length < minCells) cells.push(element("span"));
  root.replaceChildren(...shortWeek.map(label => element("span", label, "quiet")), ...cells);
  if (hadFocus) root.querySelector('button[tabindex="0"]')?.focus({ preventScroll: true });
}
