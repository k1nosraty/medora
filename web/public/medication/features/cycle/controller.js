import { $, button, element } from "../../shared/ui/dom.js";
import { mountDayCard } from "../../shared/ui/day-card.js";
import { glassObject } from "../../design/three-dimensional.js";
import { t } from "../../shared/i18n/locale.js";
import { dayNumber } from "../../shared/ui/dates.js";
import { isoDay } from "../../domain/care-index.js";
import { cycleForecast } from "../../domain/cycle.js";
import { cycleIsEnabled } from "../../domain/profile.js";

export function installCycle({ getState, getFamilyView = () => null, mutate, today, formatDay, requestDeletion, refreshFields }) {
  const output = $("cycle-forecast");
  const banner = mountDayCard($("cycle-banner"), {
    kind: "cycle", label: t("ui.cycle"), image: glassObject("cycle", "cycle"),
    title: $("cycle-banner-title"), featured: true
  });
  banner.details.append(output);
  banner.addActions($("cycle-add"));
  const dialog = $("cycle-dialog");
  const start = $("cycle-start");
  const end = $("cycle-end");
  const flow = $("cycle-flow");
  const note = $("cycle-note");
  const error = $("cycle-error");
  let editing;
  let delegation;

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
        if (!cycleIsEnabled(state)) throw new Error(t("ui.cycle-is-turned-off"));
        state.cycleRecords ??= {};
        if (day !== previous && Object.hasOwn(state.cycleRecords, day)) throw new Error(t("ui.a-cycle-is-already-logged-for-that-date"));
        if (previous !== undefined && !Object.hasOwn(state.cycleRecords, previous)) throw new Error(t("ui.this-entry-is-no-longer-available"));
        const sharedNote = state.cycleRecords[previous]?.sharedNote;
        if (previous !== undefined) delete state.cycleRecords[previous];
        state.cycleRecords[day] = { ...entry, ...(sharedNote && { sharedNote }) };
      }, t("ui.cycle-saved"))) dialog.close();
      else error.textContent = $("status").textContent;
    } catch (reason) { error.textContent = reason.message; }
    finally { submit.disabled = false; }
  });

  function render(state) {
    const records = state.cycleRecords ?? {};
    const forecast = cycleForecast(records);
    output.textContent = !forecast ? t("ui.an-estimate-appears-after-you-log-three-start-dates")
      : forecast.last < today() ? t("ui.log-a-new-start-date-to-update-the-estimate")
      : t("ui.estimated-value-to-value", formatDay(forecast.first), formatDay(forecast.last));
    const history = $("cycle-history");
    const dates = Object.keys(records).map(Number).sort((a, b) => b - a);
    history.replaceChildren(...dates.map(day => {
      const record = records[day];
      const row = element("article", "", "cycle-record");
      const copy = element("div");
      copy.append(element("strong", formatDay(day)));
      if (record.end !== null) copy.append(element("p", t("ui.through-value", formatDay(record.end))));
      if (record.flow) copy.append(element("p", t({ light: "کم", medium: "متوسط", heavy: "زیاد" }[record.flow])));
      if (record.note || record.sharedNote) copy.append(element("p", record.note || record.sharedNote));
      const view = getFamilyView();
      if (view) {
        if (record.recordedBy) copy.append(element("small", t("ui.recorded-by-value", view.authorName(record)), "family-stamp"));
        row.append(copy);
        return row;
      }
      const actions = element("div", "", "buttons");
      actions.append(button(t("ui.edit"), () => open(day)), button(t("ui.delete"), () => {
        requestDeletion({
          title: t("ui.delete-this-cycle-entry"),
          message: formatDay(day),
          change: state => {
            if (!cycleIsEnabled(state)) throw new Error(t("ui.cycle-is-turned-off"));
            delete state.cycleRecords?.[day];
          },
          success: t("ui.cycle-entry-deleted"),
          scheduleChanged: false
        });
      }));
      row.append(copy, actions);
      return row;
    }));
    if (!dates.length) history.append(element("p", t("ui.no-cycles-logged-yet"), "quiet"));
  }
  return { open, render };
}
