import { recordAction } from "../family/context.js";
import { localDigits, t } from "../../shared/i18n/locale.js";
import { isoDay } from "../../domain/care-index.js";
import { $, button, dayCardOptions, element } from "../../shared/ui/dom.js";
import { appendPlanActions, mountDayCard } from "../../shared/ui/day-card.js";
import { timeZoneCity } from "../../shared/ui/time-zone-picker.js";

import { visitGlass } from "../../design/three-dimensional.js";

const clockText = value => localDigits(value);
const pageSize = 20;

export function visitIllustration(category = "general", color) {
  const specialty = category !== "general";
  const art = visitGlass(category, color === "green" ? undefined : color);
  art.classList.add("visit-illustration");
  if (specialty) art.classList.add("visit-specialty");
  return art;
}

export function appointmentView({
  categoryOf, categories, colorOf, formatDay, formatDayNumber, formatShortMonth,
  today, getFamilyView, openVisit, deleteVisit, mutate, render
}) {
  let visitFilter = "all";
  let visitLimit = pageSize;

  function visitCard(local, zone, actionable, variant = "shelf") {
    const { visit } = local;
    const calendar = variant === "calendar";
    const compactDay = variant === "day" || calendar;
    const dayCard = compactDay || variant === "day-featured";
    const card = element("article", "", "visit visit-card");
    const category = categoryOf(visit.category);
    card.dataset.focusScope = "visit:" + visit.id;
    card.dataset.ink = colorOf(visit.color);
    if (!dayCard) {
      card.classList.add("plan-panel-row", "visit-panel-row");
      const art = element("span", "", "plan-panel-art");
      art.setAttribute("aria-hidden", "true");
      art.append(visitIllustration(category, card.dataset.ink));
      card.append(art);
    }
    const title = element("h3", visit.name, dayCard ? "" : "visit-title");
    title.dir = "auto";
    const time = clockText(local.time);
    const dateTime = new Date(local.instant).toISOString();
    const layout = dayCard ? mountDayCard(card, {
      kind: "visit", label: t("ui.appointment"), image: visitIllustration(category, card.dataset.ink),
      title, time, dateTime, featured: variant === "day-featured"
    }) : null;
    const details = layout?.details ?? element("div", "", "plan-panel-copy");
    if (!layout) {
      if (variant === "next") details.append(element("small", t("ui.next-appointment"), "visit-next-label"));
      const when = element("small", "", "visit-row-when");
      const date = element("time", formatDayNumber(local.day) + " " + formatShortMonth(local.day));
      date.dateTime = isoDay(local.day);
      date.setAttribute("aria-label", formatDay(local.day, true));
      const clock = element("time", time);
      clock.dateTime = dateTime;
      clock.dir = "ltr";
      when.append(date, document.createTextNode(" · "), clock);
      details.append(title, when);
      card.append(details);
    }
    if (category !== "general") {
      const label = category === "custom" && visit.categoryName ? visit.categoryName : categories.get(category);
      details.append(element(layout ? "bdi" : "small", label));
    }
    if (visit.zone && visit.zone !== zone) {
      details.append(element("p", t("ui.clinic-time-value-value-value", formatDay(visit.day), clockText(visit.time), timeZoneCity(visit.zone)), "quiet"));
    }
    if (visit.place) details.append(element("p", t("ui.location-value", visit.place), "quiet"));
    if (visit.cancelled) details.append(element("p", t("ui.cancelled-appointment"), "badge"));
    else if (visit.completed) details.append(element("p", t("ui.attended"), "badge visit-attended"));
    else if (calendar) details.append(element("p", t(local.instant > Date.now() ? "برنامه‌ریزی‌شده" : "بدون ثبت حضور"), "badge"));
    const notes = [
      ...((visit.note || visit.notes || visit.sharedNote) ? [element("p", visit.note || visit.notes || visit.sharedNote)] : []),
      ...((visit.contact || visit.sharedContact) ? [element("p", t("ui.contact-value", visit.contact || visit.sharedContact), "quiet")] : [])
    ];
    if (!calendar) details.append(...notes);
    const view = getFamilyView();
    if (view) {
      if (visit.recordedBy) details.append(element("small", t("ui.recorded-by-value", view.authorName(visit)), "family-stamp"));
      const options = [];
      if (calendar && notes.length) options.push(dayCardOptions(t("ui.appointment-options"), ...notes));
      if (view.canRecord("visit", local.day) && !visit.completed && !visit.cancelled) {
        options.push(recordAction("ثبت حضور", () => view.record({ kind: "visit", day: local.day, id: visit.id, title: visit.name })));
      }
      if (layout) layout.addActions(...options);
      else appendPlanActions(card, ...options);
      return card;
    }
    if (actionable) {
      let attendance;
      if (!visit.cancelled && local.day <= today()) {
        attendance = button(visit.completed ? t("ui.undo-attendance") : t(dayCard ? "حضور یافتم" : "ثبت حضور"), () => {
          void mutate(state => {
            const saved = state.visits?.[visit.id];
            if (!saved || saved.cancelled) return;
            saved.completed = !visit.completed;
            if (saved.completed) saved.resolvedAt ??= Date.now();
            else delete saved.resolvedAt;
          }, t("ui.appointment-status-saved"), true);
        });
        attendance.setAttribute("aria-pressed", String(Boolean(visit.completed)));
        if (!visit.completed) attendance.classList.add("care-record-action");
      }
      const edit = button(t("ui.edit"), () => openVisit(visit));
      const cancel = button(visit.cancelled ? t("ui.reinstate-appointment") : t("ui.cancel-appointment"), () => {
        void mutate(state => {
          const saved = state.visits[visit.id];
          if (saved) {
            saved.cancelled = !saved.cancelled;
            if (saved.cancelled) {
              delete saved.completed;
              delete saved.resolvedAt;
            }
          }
        }, t("ui.appointment-status-saved"), true);
      });
      const remove = button(t("ui.delete-appointment"), () => deleteVisit(visit.id));
      remove.className = "text-button danger-link";
      if (variant === "day-featured") {
        layout.addActions(...(attendance ? [attendance] : []), dayCardOptions(t("ui.appointment-options"), edit, cancel, remove));
      } else {
        const more = dayCardOptions(t("ui.appointment-options"), ...(calendar ? notes : []),
          ...(visit.completed && attendance ? [attendance] : []), edit, cancel, remove);
        const controls = [more, ...(attendance && !visit.completed ? [attendance] : [])];
        if (compactDay) layout.addActions(...controls);
        else appendPlanActions(card, ...controls);
      }
    }
    return card;
  }

  function dayVisits(index, day) {
    return index.visitsOn(day).filter(({ visit }) => !visit.cancelled)
      .map(local => ({
        key: `visit:${local.visit.id}`,
        title: local.visit.name,
        time: local.instant,
        state: local.visit.completed ? "done" : "pending",
        resolvedAt: local.visit.resolvedAt,
        render: featured => visitCard(local, index.zone, day <= today(), featured ? "day-featured" : "day")
      }));
  }

  function renderVisits(index, day) {
    const now = Date.now();
    const ordered = [...index.allVisits()].sort((a, b) => a.instant - b.instant);
    const scheduled = ordered.filter(({ visit, instant }) => !visit.cancelled && !visit.completed && instant >= now);
    $("visits-summary").textContent = scheduled.length ? t("ui.upcoming-appointment-count", localDigits(scheduled.length)) : t("ui.no-upcoming-appointments");
    document.querySelector('[data-visit-filter="day"]').textContent = t(day === today() ? "ui.today" : "ui.this-day");
    const onlyDay = visitFilter === "day";
    const sameDay = onlyDay ? ordered.filter(local => local.day === day) : [];
    const upcoming = !onlyDay && visitFilter !== "past" ? scheduled : [];
    const past = !onlyDay && visitFilter !== "upcoming"
      ? ordered.filter(({ visit, instant }) => visit.cancelled || visit.completed || instant < now).reverse() : [];
    const content = [];
    if (onlyDay) content.push(...sameDay.slice(0, visitLimit).map(local => visitCard(local, index.zone, true)));
    if (upcoming.length) {
      const [next, ...later] = upcoming.slice(0, visitLimit);
      content.push(visitCard(next, index.zone, true, "next"));
      if (later.length) content.push(element("h2", t("ui.later-appointments")),
        ...later.map(local => visitCard(local, index.zone, true, "shelf")));
    }
    if (past.length) {
      if (visitFilter === "all") content.push(element("h2", t("ui.past-and-cancelled")));
      content.push(...past.slice(0, visitLimit).map(local => visitCard(local, index.zone, true, "shelf")));
    }
    if (!content.length) {
      content.push(element("p", t("ui.no-appointments-in-this-view"), "empty"));
    }
    if (Math.max(sameDay.length, upcoming.length, past.length) > visitLimit) {
      const more = button(t("ui.show-more-appointments"), () => {
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
    isDayFiltered: () => visitFilter === "day",
    setFilter(value) {
      visitFilter = value;
      visitLimit = pageSize;
    }
  };
}
