import { CareInputError } from "../../shared/ui/care-error.js";
import { $, element } from "../../shared/ui/dom.js";
import { mountDayCard } from "../../shared/ui/day-card.js";
import { glassObject } from "../../design/three-dimensional.js";
import { t } from "../../shared/i18n/locale.js";
import { dayNumber } from "../../shared/ui/dates.js";
import { isoDay } from "../../domain/care-index.js";
import { cycleIsEnabled } from "../../domain/profile.js";
import { installCycleOverview } from "./overview.js";

export function installCycle({ getState, getFamilyView, getDates, mutate, today, openCalendar, requestDeletion, refreshFields }) {
  const banner = mountDayCard($("cycle-banner"), {
    kind: "cycle", label: t("ui.cycle"), image: glassObject("cycle", "cycle"),
    title: $("cycle-banner-title"), featured: true
  });
  const latest = element("p");
  latest.id = "cycle-latest";
  const endStatus = element("p", t("ui.cycle-end-missing"));
  endStatus.id = "cycle-end-status";
  endStatus.hidden = true;
  const logEnd = element("button", t("ui.cycle-log-end"), "secondary");
  logEnd.id = "cycle-log-end";
  logEnd.type = "button";
  logEnd.hidden = true;
  banner.details.append(latest, $("cycle-forecast"), endStatus);
  banner.addActions($("cycle-add"), logEnd, $("cycle-log-symptoms"));
  const dialog = $("cycle-dialog");
  const start = $("cycle-start");
  const end = $("cycle-end");
  const flow = $("cycle-flow");
  const note = $("cycle-note");
  const error = $("cycle-error");
  let editing;
  let delegation;
  const overview = installCycleOverview({
    today, getDates, getFamilyView, openCalendar,
    edit(day, { end: focusEnd } = {}) {
      open(day);
      if (focusEnd && dialog.open) (dialog.querySelector('[data-for="cycle-end"]') ?? end).focus();
    },
    remove(day) {
      requestDeletion({
        title: t("ui.delete-this-cycle-entry"),
        message: getDates().formatDay(day),
        change: state => {
          if (!cycleIsEnabled(state)) throw new CareInputError(t("ui.cycle-is-turned-off"));
          delete state.cycleRecords?.[day];
        },
        success: t("ui.cycle-entry-deleted"),
        scheduleChanged: true
      });
    }
  });

  function open(day, target) {
    delegation = target;
    dialog.toggleAttribute("data-family-editor", Boolean(target));
    dialog.querySelector('[type="submit"]').textContent = target ? t("ui.save-for-value", target.name) : t("ui.save");
    if (!cycleIsEnabled(getState())) return;
    editing = day;
    const record = getState().cycleRecords?.[day];
    start.max = end.max = isoDay(today());
    start.value = isoDay(day ?? target?.day ?? today());
    end.value = record?.end == null ? "" : isoDay(record.end);
    flow.value = record?.flow ?? "";
    note.value = record?.note ?? "";
    error.textContent = "";
    refreshFields(dialog);
    dialog.showModal();
  }

  $("cycle-form").addEventListener("submit", async event => {
    event.preventDefault();
    const previous = editing;
    let day, last;
    try {
      day = dayNumber(start.value);
      last = end.value ? dayNumber(end.value) : null;
    } catch {
      error.textContent = t("ui.check-the-cycle-start-and-end-dates");
      return;
    }
    if (!Number.isInteger(day) || day > today() || (last !== null && (last < day || last > today()))) {
      error.textContent = t("ui.check-the-cycle-start-and-end-dates");
      return;
    }
    const entry = { end: last, flow: flow.value, note: note.value.trim() };
    const submit = event.submitter;
    submit.disabled = true;
    try {
      if (delegation) await delegation.save({ day, ...entry });
      else if (await mutate(state => {
        if (!cycleIsEnabled(state)) throw new CareInputError(t("ui.cycle-is-turned-off"));
        state.cycleRecords ??= {};
        if (day !== previous && Object.hasOwn(state.cycleRecords, day)) throw new CareInputError(t("ui.a-cycle-is-already-logged-for-that-date"));
        if (previous !== undefined && !Object.hasOwn(state.cycleRecords, previous)) throw new CareInputError(t("ui.this-entry-is-no-longer-available"));
        if (Object.entries(state.cycleRecords).some(([key, record]) => Number(key) !== previous &&
            Number(key) <= (last ?? day) && day <= (record.end ?? Number(key)))) {
          throw new CareInputError(t("ui.cycle-possible-overlap"));
        }
        const sharedNote = state.cycleRecords[previous]?.sharedNote;
        if (previous !== undefined) delete state.cycleRecords[previous];
        state.cycleRecords[day] = { ...entry, ...(sharedNote && { sharedNote }) };
      }, t("ui.cycle-saved"), true)) dialog.close();
      else error.textContent = $("status").textContent;
    } catch (reason) { error.textContent = reason.message; }
    finally { submit.disabled = false; }
  });

  return { open, render: state => overview.render(state.cycleRecords ?? {}), reset: overview.reset };
}
