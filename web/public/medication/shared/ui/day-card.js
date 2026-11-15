import { element } from "./dom.js";

export function mountDayCard(card, { kind, label, image, title, time, dateTime, featured = false }) {
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
    const clock = element("time", time, "day-card-time");
    clock.dir = "auto";
    if (dateTime) clock.dateTime = dateTime;
    content.append(clock);
  }
  const details = element("div", "", "day-card-details");
  content.append(details);
  card.append(art, content);

  return {
    details,
    addActions(...controls) {
      if (!controls.length) return;
      const actions = element("div", "", "day-card-actions");
      actions.append(...controls);
      card.append(actions);
    }
  };
}
