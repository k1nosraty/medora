import { localDigits, t } from "./locale.js";
import { clockMinute } from "./care-plan.js";
import { isoDay } from "./care-index.js";
import { $, button, element } from "./dom.js";

const clockText = value => localDigits(value);
const pageSize = 20;

export function visitIllustration(category = "general") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "visit-illustration");
  svg.setAttribute("aria-hidden", "true");
  const specialty = category !== "general";
  svg.setAttribute("viewBox", specialty ? "0 0 48 48" : "0 0 160 132");
  if (specialty) svg.classList.add("visit-specialty");
  const use = document.createElementNS(svg.namespaceURI, "use");
  use.setAttribute("href", `#art-visit-${category}`);
  svg.append(use);
  return svg;
}

export function appointmentView({
  categoryOf, categories, colorOf, formatDay, formatDayNumber, formatShortMonth,
  today, openVisit, deleteVisit, mutate, render
}) {
  let visitFilter = "all";
  let visitLimit = pageSize;

  function visitCard(local, zone, actionable, variant = "compact") {
    const { visit } = local;
    const card = element("article", "", "visit visit-card");
    const category = categoryOf(visit.category);
    card.dataset.ink = colorOf(visit.color);
    if (variant !== "compact") {
      card.classList.add(variant === "day" ? "visit-day-card" : "visit-shelf-card");
      const banner = element("div", "", "visit-banner");
      banner.append(visitIllustration(category));
      if (variant === "next") {
        card.classList.add("visit-featured");
        banner.append(element("span", t("نزدیک‌ترین قرار"), "visit-eyebrow"));
      }
      card.append(banner);
    }
    const title = element("h3", visit.name, "visit-title");
    title.dir = "auto";
    const day = element("time", "", "visit-date");
    day.dateTime = isoDay(local.day);
    day.setAttribute("aria-label", formatDay(local.day, true));
    day.append(element("strong", formatDayNumber(local.day)), element("span", formatShortMonth(local.day)));
    const hour = element("time", clockText(local.time), "visit-hour");
    hour.dateTime = new Date(local.instant).toISOString();
    hour.dir = "ltr";
    const body = element("div", "", "visit-card-body");
    body.append(title);
    if (variant === "day") body.append(element("span", t("قرار"), "visit-kind"));
    body.append(hour);
    if (category !== "general") {
      const label = category === "custom" && visit.categoryName ? visit.categoryName : categories.get(category);
      body.append(element("bdi", label, "visit-category"));
    }
    const header = element("div", "", "visit-card-header");
    if (variant !== "day") header.append(day);
    header.append(body);
    const details = variant === "compact" ? card : element("div", "", "visit-shelf-details");
    details.append(header);
    if (visit.zone && visit.zone !== zone) {
      details.append(element("p", t("ساعت مطب {0}، {1} ({2})", formatDay(visit.day), clockText(visit.time), visit.zone), "quiet"));
    }
    if (visit.place) details.append(element("p", t("مکان: {0}", visit.place), "quiet"));
    if (visit.cancelled) details.append(element("p", t("قرار لغو شده"), "badge"));
    else if (visit.completed) details.append(element("p", t("حضور ثبت شد"), "badge visit-attended"));
    if (visit.note) details.append(element("p", visit.note));
    if (visit.contact) details.append(element("p", t("تماس: {0}", visit.contact), "quiet"));
    if (details !== card) card.append(details);
    if (actionable) {
      const controls = element("div", "", "buttons");
      if (!visit.cancelled && local.day <= today()) {
        const attendance = button(visit.completed ? t("برگشت ثبت حضور") : t("ثبت حضور"), () => {
          void mutate(state => {
            const saved = state.visits?.[visit.id];
            if (saved && !saved.cancelled) saved.completed = !visit.completed;
          }, t("وضعیت قرار ذخیره شد."), true);
        });
        attendance.setAttribute("aria-pressed", String(Boolean(visit.completed)));
        controls.append(attendance);
      }
      controls.append(button(t("ویرایش"), () => openVisit(visit)), button(visit.cancelled ? t("فعال‌کردن قرار") : t("لغو قرار"), () => {
        void mutate(state => {
          const saved = state.visits[visit.id];
          if (saved) {
            saved.cancelled = !saved.cancelled;
            if (saved.cancelled) delete saved.completed;
          }
        }, t("وضعیت قرار ذخیره شد."), true);
      }));
      const remove = button(t("حذف قرار"), () => deleteVisit(visit.id));
      remove.className = "text-button danger-link";
      controls.append(remove);
      if (variant === "day") card.append(controls);
      else details.append(controls);
    }
    return card;
  }

  function dayVisits(index, day) {
    return index.visitsOn(day).filter(({ visit }) => !visit.cancelled)
      .map(local => ({ minute: clockMinute(local.time), completed: Boolean(local.visit.completed), card: visitCard(local, index.zone, day <= today(), "day") }));
  }

  function renderVisits(index) {
    const now = Date.now();
    const ordered = [...index.allVisits()].sort((a, b) => a.instant - b.instant);
    const upcoming = visitFilter !== "past" ? ordered.filter(({ visit, instant }) => !visit.cancelled && !visit.completed && instant >= now) : [];
    const past = visitFilter !== "upcoming" ? ordered.filter(({ visit, instant }) => visit.cancelled || visit.completed || instant < now).reverse() : [];
    const content = [];
    if (upcoming.length) {
      const [next, ...later] = upcoming.slice(0, visitLimit);
      content.push(visitCard(next, index.zone, true, "next"));
      if (later.length) content.push(element("h2", t("قرارهای بعدی")),
        ...later.map(local => visitCard(local, index.zone, true, "shelf")));
    }
    if (past.length) {
      if (visitFilter === "all") content.push(element("h2", t("گذشته و لغوشده")));
      content.push(...past.slice(0, visitLimit).map(local => visitCard(local, index.zone, true, "shelf")));
    }
    if (!content.length) {
      const card = element("div", "", "visit-card visit-empty");
      card.append(element("h2", t("در این بخش قراری ندارید.")), visitIllustration());
      content.push(card);
    }
    if (Math.max(upcoming.length, past.length) > visitLimit) {
      const more = button(t("نمایش قرارهای بیشتر"), () => {
        visitLimit += pageSize;
        render();
        ($("visits-more") ?? $("visits").lastElementChild.querySelector("button"))?.focus({ preventScroll: true });
      });
      more.id = "visits-more";
      content.push(more);
    }
    $("visits").replaceChildren(...content);
  }

  return {
    dayVisits, renderVisits, visitCard,
    setFilter(value) {
      visitFilter = value;
      visitLimit = pageSize;
    }
  };
}
