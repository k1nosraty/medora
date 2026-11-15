import { recordAction } from "../family/context.js";
import { button, dayCardOptions, element } from "../../shared/ui/dom.js";
import { listSeparator, localDigits, t } from "../../shared/i18n/locale.js";
import { doseTime, timeText } from "../../domain/care-index.js";
import { routineComplete } from "../../domain/routine-plan.js";
import { routineIllustration as glyph } from "./illustration.js";

function entryText(entry, displayAmount) {
  if (entry.mode === "quantity") return t("ui.value-of-value", localDigits(entry.amount ?? 0), displayAmount(entry, entry.target));
  if (entry.mode === "steps") return t("ui.value-of-value-steps", localDigits(entry.checked?.length ?? 0), localDigits(entry.steps.length));
  return "";
}

export function routineCard({ getState, getFamilyView, today, colorOf, labelFor, days, formatDay, openEditor, saveLog, focusLogAction, openLog, displayAmount }) {
  function card(entry, day, { manage = false, readOnly = false, dayCard = false, featured = false, summaryOnly = false, calendar = false } = {}) {
    const compactDay = dayCard && !featured;
    const row = element("article", "", dayCard ? "day-card routine-day-card" : "routine-row");
    if (!summaryOnly) row.dataset.routineId = entry.id;
    row.dataset.focusScope = "routine:" + entry.id;
    const art = element("span", "", dayCard ? "day-card-art routine-day-art" : "routine-glyph");
    const state = getState();
    const plan = state.routines?.[entry.id];
    const isToday = day === today();
    const currentColor = !readOnly && isToday ? plan?.color : null;
    const color = colorOf(currentColor ?? entry.color);
    row.dataset.ink = art.dataset.ink = color;
    art.append(glyph(entry.category, color));
    if (dayCard) art.append(element("span", t("ui.routine"), "day-card-kind"));
    const copy = element("div", "", dayCard ? "day-card-content routine-row-copy" : "routine-row-copy");
    const name = element(dayCard ? "h3" : "strong", entry.name);
    name.dir = "auto";
    const completed = routineComplete(entry);
    const detail = [labelFor(entry.category)];
    if (manage) {
      detail.push(entry.paused ? t("ui.paused") : entry.mask === 127 && entry.interval === 1 ? t("ui.every-day") :
        days.filter((_, index) => entry.mask & (1 << index)).join(listSeparator));
      if (!entry.paused && entry.interval > 1) detail.push(t("ui.every-value-weeks", localDigits(entry.interval)));
      if (!entry.paused && entry.start > today()) detail.push(t("ui.from-value", formatDay(entry.start)));
    } else if (entryText(entry, displayAmount)) {
      detail.push(entryText(entry, displayAmount));
    }
    if (entry.minute !== null) detail.push(localDigits(timeText(entry.minute)));
    copy.append(name, element("small", detail.join(" · ")));
    if (dayCard && completed) copy.append(element("small", t("ui.done"), "routine-row-state"));
    else if (calendar) {
      const hasLog = Object.hasOwn(state.routineLogs[day] ?? {}, entry.id);
      const status = hasLog ? "نیمه‌تمام" : day < today() ||
        (isToday && entry.minute != null && doseTime(day, entry.minute) <= Date.now()) ? "بدون ثبت" : "برنامه‌ریزی‌شده";
      copy.append(element("p", t(status), "badge"));
    }
    row.append(art, copy);
    if (summaryOnly) return row;
    const view = getFamilyView();
    if (view) {
      if (entry.notes) copy.append(element("p", entry.notes));
      if (entry.recordedBy) copy.append(element("small", t("ui.recorded-by-value", view.authorName(entry)), "family-stamp"));
      if (!manage && !readOnly && !completed && view.canRecord("routine", day)) {
        const footer = dayCard ? element("div", "", "day-card-actions") : row;
        footer.append(recordAction(entry.mode === "done" ? "ثبت انجام" : "ثبت پیشرفت", () =>
          view.record({ kind: "routine", day, id: entry.id, title: entry.name, routine: entry })));
        if (dayCard) row.append(footer);
      }
      return row;
    }
    const footer = dayCard ? element("div", "", "day-card-actions") : row;
    let logAction;
    if (manage) {
      const edit = button(t("ui.edit"), () => openEditor(entry));
      edit.setAttribute("aria-label", t("ui.edit-routine-value", entry.name));
      row.append(edit);
    } else if (!readOnly && day <= today() && plan) {
      const activity = { entry, day, plan, recorded: state.routineLogs[day]?.[entry.id] };
      logAction = entry.mode === "done" ?
        button(completed ? t(dayCard ? "برگشت ثبت" : "انجام شد") : t(dayCard ? "انجام دادم" : "ثبت انجام"), async () => {
          if (await saveLog(activity, !completed)) focusLogAction(entry.id);
        }) :
        button(completed ? t("ui.edit-progress") : t("ui.log-progress"), () => openLog(activity));
      if (entry.mode === "done") {
        logAction.setAttribute("aria-pressed", String(completed));
        const label = completed ? "برگشت ثبت {0}" : dayCard ? "انجام دادم، {0}" : "ثبت انجام {0}";
        logAction.setAttribute("aria-label", t(label, entry.name));
      } else logAction.setAttribute("aria-label", t("ui.log-progress-for-value", entry.name));
      if (!completed) logAction.classList.add("care-record-action");
      row.dataset.complete = String(completed);
      if (!compactDay) footer.append(logAction);
    } else if (completed && !dayCard) row.append(element("span", t("ui.done"), "routine-row-state"));
    if (dayCard && plan) {
      const edit = button(t("ui.edit"), () => openEditor(plan));
      edit.setAttribute("aria-label", t("ui.edit-routine-value", entry.name));
      if (compactDay) {
        const options = completed && logAction ? [logAction, edit] : [edit];
        footer.append(dayCardOptions(t("ui.routine-options"), ...options));
        if (logAction && !completed) footer.append(logAction);
      } else footer.append(edit);
    }
    if (dayCard && footer.childElementCount) row.append(footer);
    return row;
  }

  return card;
}
