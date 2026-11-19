import { equalCareValues } from "../../domain/care-contract.js";
import { cycleEntries, cycleEstimate, cycleOn, cyclePatterns, cycleSymptoms } from "../../domain/cycle.js";
import { isoDay } from "../../domain/care-index.js";
import { cycleIsEnabled } from "../../domain/profile.js";
import { CareInputError } from "../../shared/ui/care-error.js";
import { dayNumber } from "../../shared/ui/dates.js";
import { localDigits, locale, t } from "../../shared/i18n/locale.js";
import { cyclePrintReport, describeCycleDay as describeDay, mergeCyclePeriods } from "./tools.js";
import { $, button, dayCardOptions, element } from "../../shared/ui/dom.js";

const selectedDate = input => { try { return dayNumber(input); } catch { return NaN; } };
const labelFor = key => t(`ui.cycle-${key}`);

export const describeCycleDay = (row, translate = t) => describeDay(row, translate);

/** @type {((day: number) => void) | undefined} */
const noDayEditor = undefined;

export function installDailyCycle({ getState, getFamilyView, getDates, getIndex, mutate, today, actionDay, requestDeletion, refreshFields, openSettings, editCycle, openEditor = noDayEditor, reactTools = false }) {
  const dialog = $("cycle-day-dialog");
  const form = $("cycle-day-form");
  const symptoms = openEditor ? new Map() : new Map(cycleSymptoms.map(key => {
    const label = element("label", labelFor(key));
    const select = element("select");
    select.add(new Option(t("ui.not-selected"), ""));
    for (const level of [1, 2, 3]) select.add(new Option(t(`ui.cycle-strength-${level}`), level));
    label.append(select);
    return [key, { label, select }];
  }));
  let editing, original;
  let quickEntry;
  const personal = () => !getFamilyView() && cycleIsEnabled(getState());

  function open(day = actionDay()) {
    if (!personal() || day > today()) return;
    if (openEditor) return openEditor(day);
    editing = day;
    const daily = getState().cycleDays ?? {};
    const previous = original = daily[day];
    const usage = key => Object.values(daily).filter(row => row.symptoms?.[key]).length;
    const ordered = [...cycleSymptoms].sort((a, b) => usage(b) - usage(a));
    $("cycle-symptom-controls").replaceChildren(...ordered.map(key => symptoms.get(key).label));
    $("cycle-day-date").value = isoDay(day);
    $("cycle-day-date").max = isoDay(today());
    $("cycle-day-flow").value = previous?.flow ?? "";
    $("cycle-day-tags").value = previous?.tags ?? "";
    $("cycle-day-note").value = previous?.note ?? "";
    for (const [key, { select }] of symptoms) select.value = previous?.symptoms?.[key] ?? "";
    $("cycle-day-error").textContent = "";
    $("cycle-day-delete").hidden = !previous;
    refreshFields(form);
    dialog.showModal();
  }

  if (!openEditor) {
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const day = selectedDate($("cycle-day-date").value);
      const row = { flow: $("cycle-day-flow").value, symptoms: Object.fromEntries([...symptoms].filter(([, control]) => control.select.value)
        .map(([key, control]) => [key, Number(control.select.value)])),
        tags: $("cycle-day-tags").value.trim(), note: $("cycle-day-note").value.trim() };
      if (!Number.isInteger(day) || day > today() || !describeCycleDay(row).length) {
        $("cycle-day-error").textContent = t("ui.cycle-days-required");
        return;
      }
      if (await mutate(state => {
        if (!cycleIsEnabled(state)) throw new CareInputError(t("ui.cycle-is-turned-off"));
        const rows = state.cycleDays ??= {};
        if (!equalCareValues(rows[editing], original)) throw new CareInputError(t("ui.cycle-entry-changed"));
        if (day !== editing && Object.hasOwn(rows, day)) throw new CareInputError(t("ui.a-cycle-is-already-logged-for-that-date"));
        if (editing !== day) delete rows[editing];
        rows[day] = row;
      }, t("ui.cycle-days-saved"))) dialog.close();
      else $("cycle-day-error").textContent = $("status").textContent;
    });
    $("cycle-day-delete").addEventListener("click", () => {
      dialog.close();
      const day = editing;
      requestDeletion({ title: t("ui.delete-this-cycle-entry"), message: getDates().formatDay(day), success: t("ui.cycle-entry-deleted"),
        change: state => { delete state.cycleDays?.[day]; } });
    });
  }
  for (const control of document.querySelectorAll("[data-cycle-log]")) control.addEventListener("click", () => open(Math.min(actionDay(), today())));
  $("cycle-open-settings").addEventListener("click", openSettings);

  const feedback = $("today-cycle-feedback");
  const edit = button(t("ui.edit"), () => {
    if (!personal()) return;
    const day = actionDay();
    const active = cycleOn(getState().cycleRecords, day, today());
    if (active) editCycle(active.start);
    else if (getState().cycleDays?.[day]) open(day);
  });
  const undo = button(t("ui.undo-log"), undoQuickCycle);
  const menu = dayCardOptions(t("ui.cycle-record-options"), edit, undo);
  menu.hidden = true;
  $("cycle-today-card").prepend(menu);

  function paintQuickActions(state, day, visible) {
    if (quickEntry && !equalCareValues(state.cycleRecords?.[quickEntry.key], quickEntry.after)) quickEntry = undefined;
    undo.hidden = !visible || quickEntry?.day !== day || day !== today();
    edit.hidden = !visible || day > today() || !(cycleOn(state.cycleRecords, day, today()) || state.cycleDays?.[day]);
    menu.hidden = edit.hidden && undo.hidden;
    if (menu.hidden) menu.open = false;
    feedback.hidden = undo.hidden || Boolean(quickEntry?.dismissed);
  }

  async function saveQuickCycle(change, message) {
    if (!personal()) return;
    const day = today();
    let entry;
    if (!await mutate(state => {
      if (!cycleIsEnabled(state)) throw new CareInputError(t("ui.cycle-is-turned-off"));
      entry = change(state, day);
    }, "", true)) return;
    quickEntry = { ...entry, day };
    paintQuickActions(getState(), actionDay(), personal() && !$("cycle-today-card").hidden);
    $("today-cycle-message").textContent = t(message);
  }

  function start() {
    return saveQuickCycle((state, day) => {
      const rows = state.cycleRecords ??= {};
      if (cycleOn(rows, day)) throw new CareInputError(t("ui.cycle-possible-overlap"));
      const after = rows[day] = { end: null, flow: "" };
      const followup = state.cycleFollowup;
      delete state.cycleFollowup;
      return { key: day, after, followup };
    }, "ui.cycle-start-logged");
  }
  $("cycle-today-start").addEventListener("click", start);
  $("cycle-follow-yes").addEventListener("click", start);
  $("cycle-today-end").addEventListener("click", () => {
    void saveQuickCycle((state, day) => {
      const active = cycleOn(state.cycleRecords, day);
      if (active?.end !== null) throw new CareInputError(t("ui.cycle-entry-changed"));
      const before = state.cycleRecords[active.start];
      const after = state.cycleRecords[active.start] = { ...before, end: day };
      return { key: active.start, before, after };
    }, "ui.cycle-today-end-logged");
  });
  async function undoQuickCycle() {
    const entry = quickEntry;
    if (!entry || !personal() || entry.day !== today() || actionDay() !== entry.day) return;
    if (!await mutate(state => {
      if (!cycleIsEnabled(state) || !equalCareValues(state.cycleRecords?.[entry.key], entry.after)) {
        throw new CareInputError(t("ui.cycle-entry-changed"));
      }
      if (entry.before) state.cycleRecords[entry.key] = entry.before;
      else {
        delete state.cycleRecords[entry.key];
        if (entry.followup && !state.cycleFollowup) state.cycleFollowup = entry.followup;
      }
    }, t("ui.cycle-log-undone"), true)) return;
    $(entry.before ? "cycle-today-end" : "cycle-today-start").focus({ preventScroll: true });
  }
  $("today-cycle-undo").addEventListener("click", undoQuickCycle);
  $("today-cycle-dismiss").addEventListener("click", () => {
    if (quickEntry) quickEntry.dismissed = true;
    feedback.hidden = true;
    $("cycle-today-symptoms").focus({ preventScroll: true });
  });
  for (const choice of ["no", "later"]) $(`cycle-follow-${choice}`).addEventListener("click", async () => {
    if (!personal()) return;
    const estimate = cycleEstimate(getState().cycleRecords);
    if (!estimate) return;
    await mutate(state => { state.cycleFollowup = { until: choice === "no" ? null : today() + 1, estimate: estimate.last }; },
      t("ui.cycle-follow-saved"));
  });

  function paintToday(state, day, visible, compact) {
    const wide = visible && !compact;
    $("cycle-today-card").hidden = !wide;
    const personalView = personal();
    const quick = day === today() && personalView;
    paintQuickActions(state, day, wide && personalView);
    if (!visible) return;
    const active = personalView ? cycleOn(state.cycleRecords, day, today()) : null;
    const estimate = personalView ? cycleEstimate(state.cycleRecords) : null;
    const details = [];
    if (active) details.push(t("ui.cycle-today-period-day", localDigits(day - active.start + 1)));
    const daily = personalView ? state.cycleDays?.[day] : null;
    if (daily) details.push(...describeCycleDay(daily));
    if (!details.length && quick && estimate && day <= estimate.last) {
      const { shortDate } = getDates();
      details.push(estimate.first === estimate.last ? t("ui.estimated-cycle-date", shortDate(estimate.first)) :
        t("ui.estimated-value-to-value", shortDate(estimate.first), shortDate(estimate.last)));
    }
    if (compact) {
      $("program-cycle-summary").textContent = details[0] ?? "";
      return;
    }
    $("cycle-today-detail").textContent = details.slice(0, 2).join(" · ") || (quick ? t("ui.not-logged") : "");
    $("cycle-today-start").hidden = !quick || Boolean(active);
    const end = $("cycle-today-end");
    end.hidden = !quick || !active;
    end.disabled = active?.end !== null;
    end.textContent = t(end.disabled ? "ui.cycle-today-end-logged" : "ui.cycle-end-now");
    $("cycle-today-symptoms").hidden = !quick;
    const follow = state.cycleFollowup;
    $("cycle-follow-up").hidden = !quick || !estimate || day <= estimate.last || Boolean(active) ||
      (follow?.estimate === estimate.last && (follow.until === null || day < follow.until));
  }

  function paint(state) {
    const personalView = personal();
    $("cycle-tracking").hidden = $("cycle-personal-tools").hidden = !personalView;
    if (!personalView) return;
    const { logged, total, symptoms: patterns, spotting, longest } = cyclePatterns(state.cycleRecords, state.cycleDays);
    const formatDay = getDates().formatDay;
    $("cycle-patterns").textContent = total ? t("ui.cycle-trend-coverage", localDigits(logged), localDigits(total)) : "";
    const summaries = patterns.map(([key, count]) => t("ui.cycle-days-symptoms-by-period", labelFor(key), localDigits(count), localDigits(logged)));
    if (longest) summaries.push(t("ui.cycle-longest", localDigits(longest)));
    if (spotting) summaries.push(t("ui.cycle-spotting-total", localDigits(spotting)));
    $("cycle-pattern-list").replaceChildren(...summaries.map(message => element("li", message)));
    const map = $("cycle-symptom-map");
    map.replaceChildren();
    if (total && Object.keys(state.cycleDays ?? {}).length) {
      const table = element("table");
      table.append(element("caption", t("ui.cycle-map-title")));
      const header = element("tr");
      header.append(element("th", t("ui.start-date")));
      for (const offset of [-2, -1, 0, 1, 2]) {
        const cell = element("th", offset ? new Intl.NumberFormat(locale, { signDisplay: "always" }).format(offset) : t("ui.cycle-map-start"));
        cell.scope = "col";
        header.append(cell);
      }
      table.createTHead().append(header);
      const body = table.createTBody();
      for (const { start } of cycleEntries(state.cycleRecords).slice(0, 6)) {
        const row = body.insertRow();
        const date = element("th", getDates().shortDate(start));
        date.scope = "row";
        row.append(date);
        for (const offset of [-2, -1, 0, 1, 2]) {
          const day = start + offset;
          const entry = state.cycleDays?.[day];
          const count = Object.keys(entry?.symptoms ?? {}).length;
          const cell = row.insertCell();
          const control = button(entry ? localDigits(count) : "·", () => open(day));
          control.dataset.logged = String(Boolean(entry));
          control.disabled = day > today();
          control.setAttribute("aria-label", formatDay(day) + " · " +
            (entry ? describeCycleDay(entry).join("، ") : t("ui.sleep-no-record")));
          cell.append(control);
        }
      }
      map.append(table);
    }
    const daily = state.cycleDays ?? {};
    const nearest = cycleEntries(state.cycleRecords).slice(0, 12);
    const medicineDates = Object.values(state.doses ?? {}).filter(dose => dose.status === "taken" &&
      nearest.some(row => dose.day >= row.start - 2 && dose.day <= (row.end ?? row.start) + 2)).map(dose => dose.day);
    const entries = [...new Set([...Object.keys(daily).map(Number), ...medicineDates])].sort((a, b) => b - a);
    const index = getIndex();
    $("cycle-daily-records").replaceChildren(...entries.map(day => {
      const row = daily[day];
      const card = element("article", "", "cycle-record");
      const edit = button(formatDay(day, true), () => open(day));
      edit.className = "text-button";
      card.append(edit, element("p", row ? describeCycleDay(row).join(" · ") : t("ui.cycle-history-empty")));
      const doses = index.dosesOn(day).filter(dose => dose.status === "taken").map(dose =>
        state.medicines[dose.medicineId]?.name ?? dose.name).filter(Boolean);
      if (doses.length) card.append(element("p", t("ui.cycle-dose-taken-day") + " · " + [...new Set(doses)].join("، "), "quiet"));
      return card;
    }));
    const estimate = cycleEstimate(state.cycleRecords);
    const now = today();
    const list = state.cycleChecklist ?? [];
    $("cycle-preparation").hidden = !list.length || !estimate || now < estimate.first - 3 || now > estimate.last;
    const checked = state.cyclePreparation?.estimate === estimate?.first ? state.cyclePreparation?.items ?? [] : [];
    $("cycle-preparation-list").replaceChildren(...list.map(item => {
      const label = element("label");
      const input = element("input");
      input.type = "checkbox";
      input.checked = checked.includes(item);
      input.addEventListener("change", () => {
        const selected = input.checked;
        void mutate(record => {
          const preparation = record.cyclePreparation?.estimate === estimate.first ? record.cyclePreparation : { estimate: estimate.first, items: [] };
          preparation.items = selected ? [...new Set([...preparation.items, item])] : preparation.items.filter(value => value !== item);
          record.cyclePreparation = preparation;
        }, t("ui.cycle-days-saved"));
      });
      label.append(input, " " + item);
      return label;
    }));
    if (!reactTools && !$("cycle-print-first").value) {
      $("cycle-print-first").value = isoDay(now - 90);
      $("cycle-print-last").value = isoDay(now);
      refreshFields($("cycle-print-form"));
    }
  }

  if (!reactTools) {
    function addBulk() {
      const rows = $("cycle-bulk-rows");
      if (rows.children.length >= 24) return;
      const row = element("div", "", "sleep-fields");
      for (const endpoint of ["start", "end"]) {
        const label = element("label", t(endpoint === "start" ? "ui.start-date" : "ui.end-date-optional"));
        const date = element("input");
        date.type = "date";
        date.dataset.endpoint = endpoint;
        date.max = isoDay(today());
        label.append(date);
        row.append(label);
      }
      rows.append(row);
      refreshFields(row);
    }
    $("cycle-bulk-add").addEventListener("click", addBulk);
    $("cycle-bulk-form").addEventListener("submit", async event => {
      event.preventDefault();
      if (!personal()) return;
      const error = $("cycle-bulk-error");
      error.textContent = "";
      const additions = [...$("cycle-bulk-rows").children].flatMap(row => {
        const start = row.querySelector('[data-endpoint="start"]').value;
        const end = row.querySelector('[data-endpoint="end"]').value;
        return start || end ? [{ start: selectedDate(start), end: end ? selectedDate(end) : null }] : [];
      });
      const now = today();
      if (!additions.length || additions.some(row => !Number.isInteger(row.start) || row.start > now ||
        row.end !== null && (!Number.isInteger(row.end) || row.end < row.start || row.end > now))) {
        error.textContent = t("ui.check-the-cycle-start-and-end-dates"); return;
      }
      if (await mutate(state => {
        const rows = mergeCyclePeriods(state.cycleRecords ?? {}, additions);
        if (!rows) throw new CareInputError(t("ui.cycle-possible-overlap"));
        state.cycleRecords = rows;
      }, t("ui.cycle-saved"), true)) {
        $("cycle-bulk-rows").replaceChildren();
        addBulk();
      } else error.textContent = $("status").textContent;
    });
    $("cycle-bulk-form").closest("details").addEventListener("toggle", event => {
      if (event.target.open && !$("cycle-bulk-rows").children.length) addBulk();
    });

    $("cycle-print-form").addEventListener("submit", event => {
      event.preventDefault();
      if (!personal()) return;
      const first = selectedDate($("cycle-print-first").value), last = selectedDate($("cycle-print-last").value);
      const error = $("cycle-print-error");
      error.textContent = "";
      if (!Number.isInteger(first) || !Number.isInteger(last) || first > last || last > today()) {
        error.textContent = t("ui.check-the-cycle-start-and-end-dates");
        return;
      }
      const { title, lines } = cyclePrintReport(getState(), first, last, {
        symptoms: $("cycle-print-symptoms").checked,
        notes: $("cycle-print-notes").checked,
        medicines: $("cycle-print-meds").checked
      });
      const report = $("cycle-print-view");
      report.dir = "rtl";
      report.lang = "fa";
      report.replaceChildren(element("h1", title), ...lines.map(line => element("p", line)));
      document.body.dataset.cyclePrint = "";
      window.addEventListener("afterprint", () => {
        delete document.body.dataset.cyclePrint;
        report.replaceChildren();
      }, { once: true });
      window.print();
    });
  }

  return { open, paint, paintToday, close() { dialog.close(); } };
}
