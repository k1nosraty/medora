import { recordAction } from "../family/context.js";
import { button, dayCardOptions, element } from "../../shared/ui/dom.js";
import { appendPlanActions, mountDayCard } from "../../shared/ui/day-card.js";
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
    const row = element("article", "", dayCard ? "" : "routine-row plan-panel-row");
    if (!summaryOnly) row.dataset.routineId = entry.id;
    row.dataset.focusScope = "routine:" + entry.id;
    const state = getState();
    const plan = state.routines?.[entry.id];
    const isToday = day === today();
    const currentColor = !readOnly && isToday ? plan?.color : null;
    const color = colorOf(currentColor ?? entry.color);
    row.dataset.ink = color;
    const image = glyph(entry.category, color);
    const name = element(dayCard ? "h3" : "strong", entry.name);
    name.dir = "auto";
    const clock = entry.minute == null ? "" : timeText(entry.minute);
    const layout = dayCard ? mountDayCard(row, {
      kind: "routine", label: t("ui.routine"), image, title: name,
      time: localDigits(clock), dateTime: clock, untimed: compactDay && entry.minute == null, featured
    }) : null;
    const copy = layout?.details ?? element("div", "", "routine-row-copy plan-panel-copy");
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
    if (!layout) {
      if (clock) detail.push(localDigits(clock));
      const art = element("span", "", "plan-panel-art");
      art.append(image);
      row.append(art, copy);
      copy.append(name);
    }
    copy.append(element("small", detail.join(" · ")));
    if (dayCard && completed) copy.append(element("small", t("ui.done"), "routine-row-state"));
    else if (calendar) {
      const hasLog = Object.hasOwn(state.routineLogs[day] ?? {}, entry.id);
      const status = hasLog ? "نیمه‌تمام" : day < today() ||
        (isToday && entry.minute != null && doseTime(day, entry.minute) <= Date.now()) ? "بدون ثبت" : "برنامه‌ریزی‌شده";
      copy.append(element("p", t(status), "badge"));
    }
    if (summaryOnly) return row;
    const view = getFamilyView();
    if (view) {
      if (entry.notes || entry.sharedNotes) copy.append(element("p", entry.notes || entry.sharedNotes));
      if (entry.recordedBy) copy.append(element("small", t("ui.recorded-by-value", view.authorName(entry)), "family-stamp"));
      if (!manage && !readOnly && !completed && view.canRecord("routine", day)) {
        const action = recordAction(entry.mode === "done" ? "ثبت انجام" : "ثبت پیشرفت", () =>
          view.record({ kind: "routine", day, id: entry.id, title: entry.name, routine: entry }));
        if (layout) layout.addActions(action);
        else appendPlanActions(row, action);
      }
      return row;
    }
    let logAction;
    if (manage) {
      const edit = button(t("ui.edit"), () => openEditor(entry));
      edit.setAttribute("aria-label", t("ui.edit-routine-value", entry.name));
      appendPlanActions(row, dayCardOptions(t("ui.routine-options"), edit));
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
      if (!layout && completed) copy.append(element("span", t("ui.done"), "routine-row-state"));
    } else if (completed && !dayCard) row.append(element("span", t("ui.done"), "routine-row-state"));
    if (!layout && !manage && !readOnly && plan) {
      const edit = button(t("ui.edit"), () => openEditor(plan));
      edit.setAttribute("aria-label", t("ui.edit-routine-value", entry.name));
      const more = dayCardOptions(t("ui.routine-options"), ...(completed && logAction ? [logAction] : []), edit);
      appendPlanActions(row, more, ...(logAction && !completed ? [logAction] : []));
    } else if (layout && plan) {
      const edit = button(t("ui.edit"), () => openEditor(plan));
      edit.setAttribute("aria-label", t("ui.edit-routine-value", entry.name));
      if (compactDay) {
        const options = completed && logAction ? [logAction, edit] : [edit];
        layout.addActions(dayCardOptions(t("ui.routine-options"), ...options), ...(logAction && !completed ? [logAction] : []));
      } else layout.addActions(...(logAction ? [logAction] : []), dayCardOptions(t("ui.routine-options"), edit));
    }
    return row;
  }

  return card;
}
