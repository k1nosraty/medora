import { recordAction } from "../family/context.js";
import { localDigits, t } from "../../shared/i18n/locale.js";
import { isoDay } from "../../domain/care-index.js";
import { $, button, dayCardOptions, element } from "../../shared/ui/dom.js";
import { mountDayCard } from "../../shared/ui/day-card.js";

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

  function visitCard(local, zone, actionable, variant = "compact") {
    const { visit } = local;
    const calendar = variant === "calendar";
    const compactDay = variant === "day" || calendar;
    const dayCard = compactDay || variant === "day-featured";
    const card = element("article", "", "visit visit-card");
    const category = categoryOf(visit.category);
    card.dataset.focusScope = "visit:" + visit.id;
    card.dataset.ink = colorOf(visit.color);
    if (!dayCard && variant !== "compact") {
      card.classList.add("visit-shelf-card");
      const banner = element("div", "", "visit-banner");
      banner.append(visitIllustration(category, card.dataset.ink));
      if (variant === "next") {
        card.classList.add("visit-featured");
        banner.append(element("span", t("ui.next-appointment"), "visit-eyebrow"));
      }
      card.append(banner);
    }
    const title = element("h3", visit.name, dayCard ? "" : "visit-title");
    title.dir = "auto";
    const time = clockText(local.time);
    const dateTime = new Date(local.instant).toISOString();
    const layout = dayCard ? mountDayCard(card, {
      kind: "visit", label: t("ui.appointment"), image: visitIllustration(category, card.dataset.ink),
      title, time, dateTime, featured: variant === "day-featured"
    }) : null;
    const details = layout?.details ?? (variant === "compact" ? card : element("div", "", "visit-shelf-details"));
    let metadata = details;
    if (!layout) {
      const day = element("time", "", "visit-date");
      day.dateTime = isoDay(local.day);
      day.setAttribute("aria-label", formatDay(local.day, true));
      day.append(element("strong", formatDayNumber(local.day)), element("span", formatShortMonth(local.day)));
      const hour = element("time", time, "visit-hour");
      hour.dateTime = dateTime;
      hour.dir = "ltr";
      const body = element("div", "", "visit-card-body");
      body.append(title, hour);
      const header = element("div", "", "visit-card-header");
      header.append(day, body);
      details.append(header);
      metadata = body;
    }
    if (category !== "general") {
      const label = category === "custom" && visit.categoryName ? visit.categoryName : categories.get(category);
      metadata.append(element("bdi", label, layout ? "" : "visit-category"));
    }
    if (visit.zone && visit.zone !== zone) {
      details.append(element("p", t("ui.clinic-time-value-value-value", formatDay(visit.day), clockText(visit.time), visit.zone), "quiet"));
    }
    if (visit.place) details.append(element("p", t("ui.location-value", visit.place), "quiet"));
    if (visit.cancelled) details.append(element("p", t("ui.cancelled-appointment"), "badge"));
    else if (visit.completed) details.append(element("p", t("ui.attended"), "badge visit-attended"));
    else if (calendar) details.append(element("p", t(local.instant > Date.now() ? "برنامه‌ریزی‌شده" : "بدون ثبت حضور"), "badge"));
    const notes = [
      ...((visit.note || visit.notes) ? [element("p", visit.note || visit.notes)] : []),
      ...(visit.contact ? [element("p", t("ui.contact-value", visit.contact), "quiet")] : [])
    ];
    if (!calendar) details.append(...notes);
    if (!layout && details !== card) card.append(details);
    const view = getFamilyView();
    if (view) {
      if (visit.recordedBy) details.append(element("small", t("ui.recorded-by-value", view.authorName(visit)), "family-stamp"));
      const options = [];
      if (calendar && notes.length) options.push(dayCardOptions(t("ui.appointment-options"), ...notes));
      if (view.canRecord("visit", local.day) && !visit.completed && !visit.cancelled) {
        options.push(recordAction("ثبت حضور", () => view.record({ kind: "visit", day: local.day, id: visit.id, title: visit.name })));
      }
      if (layout) layout.addActions(...options);
      else if (options.length) {
        const controls = element("div", "", "buttons");
        controls.append(...options);
        details.append(controls);
      }
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
      if (compactDay) {
        const actions = attendance && visit.completed ? [attendance, edit, cancel, remove] : [edit, cancel, remove];
        layout.addActions(dayCardOptions(t("ui.appointment-options"), ...(calendar ? notes : []), ...actions),
          ...(attendance && !visit.completed ? [attendance] : []));
      } else if (layout) {
        layout.addActions(...(attendance ? [attendance] : []), dayCardOptions(t("ui.appointment-options"), edit, cancel, remove));
      } else {
        const controls = element("div", "", "buttons");
        if (attendance) controls.append(attendance);
        controls.append(edit, cancel, remove);
        details.append(controls);
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

  function renderVisits(index) {
    const now = Date.now();
    const ordered = [...index.allVisits()].sort((a, b) => a.instant - b.instant);
    const upcoming = visitFilter !== "past" ? ordered.filter(({ visit, instant }) => !visit.cancelled && !visit.completed && instant >= now) : [];
    const past = visitFilter !== "upcoming" ? ordered.filter(({ visit, instant }) => visit.cancelled || visit.completed || instant < now).reverse() : [];
    const content = [];
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
      const card = element("div", "", "visit-card visit-empty");
      card.append(element("h2", t("ui.no-appointments-in-this-view")), visitIllustration());
      content.push(card);
    }
    if (Math.max(upcoming.length, past.length) > visitLimit) {
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
    setFilter(value) {
      visitFilter = value;
      visitLimit = pageSize;
    }
  };
}
