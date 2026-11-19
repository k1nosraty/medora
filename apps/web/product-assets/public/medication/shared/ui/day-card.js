import { element } from "./dom.js";
import { t } from "../i18n/locale.js";

export function appendPlanActions(card, ...controls) {
  if (!controls.length) return;
  const actions = element("div", "", "plan-panel-actions");
  actions.append(...controls);
  card.append(actions);
}

export function mountDayCard(card, { kind, label, image, title, time, dateTime, untimed = false, summary, featured = false }) {
  card.classList.add("day-card");
  card.dataset.cardKind = kind;
  card.toggleAttribute("data-featured", featured);

  const art = element("div", "", "day-card-art");
  art.setAttribute("aria-hidden", "true");
  art.append(image);
  const content = element("div", "", "day-card-content");
  const category = element("small", label, "day-card-kind");
  title.classList.add("day-card-title");
  content.append(category, title);
  if (time) {
    const clock = element("time", "", "day-card-time");
    const digits = element("bdi", time);
    digits.dir = "ltr";
    clock.append(digits);
    if (dateTime) clock.dateTime = dateTime;
    content.append(clock);
  } else if (untimed) {
    const clock = element("span", "", "day-card-time");
    clock.setAttribute("role", "img");
    clock.setAttribute("aria-label", t("ui.no-scheduled-time"));
    addIcon(clock, "clock-off");
    content.append(clock);
  }
  if (summary) content.append(element("small", summary, "day-card-summary"));
  const details = element("div", "", "day-card-details");
  content.append(details);
  card.append(art, content);

  return {
    details,
    addActions(...controls) {
      if (!controls.length) return;
      const actions = element("div", "", "day-card-actions");
      if (featured && kind !== "cycle") {
        for (const control of controls) {
          if (control.classList.contains("care-record-action")) addIcon(control, "check");
          if (control.classList.contains("day-card-snooze")) addIcon(control, "clock");
        }
      }
      actions.append(...controls);
      card.append(actions);
    }
  };
}

function addIcon(control, name) {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const use = document.createElementNS(icon.namespaceURI, "use");
  icon.setAttribute("aria-hidden", "true");
  use.setAttribute("href", "#i-" + name);
  icon.append(use);
  control.prepend(icon);
}
