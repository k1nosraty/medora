import { equalCareValues } from "../../domain/care-contract.js";
import { localZone } from "../../domain/care-plan.js";
import { isoDay } from "../../domain/care-index.js";
import { sleepConflicts, sleepDay, sleepInstant, sleepIsEnabled, sleepMinutes, sleepReport, sleepWall, validSleepRecord } from "../../domain/sleep.js";
import { localDigits, locale, t, weekIndex } from "../../shared/i18n/locale.js";
import { CareInputError } from "../../shared/ui/care-error.js";
import { $, button, element } from "../../shared/ui/dom.js";
import { setPressed } from "../../shared/ui/controls.js";
import { sleepDuration } from "./presentation.js";

const number = new Intl.NumberFormat(locale).format;
const timeOf = (at, zone) => localDigits(sleepWall(at, zone).time);
const pending = rows => Object.entries(rows ?? {}).find(([, row]) => row.end === null);
const completed = rows => Object.entries(rows ?? {}).filter(([, row]) => row.end !== null).sort((a, b) => b[1].end - a[1].end);

export function installSleep({ getState, getFamilyView, getDates, mutate, today, actionDay, requestDeletion, refreshFields, render }) {
  const dialog = $("sleep-dialog");
  const form = $("sleep-form");
  const error = $("sleep-error");
  let editId, original, timezone, wakeDraft;
  let period = "week";
  let selection;
  let chartDay;

  function save(row, id, expected, draft) {
    return mutate(state => {
      if (!sleepIsEnabled(state)) throw new CareInputError(t("ui.sleep-disabled"));
      const rows = state.sleepRecords ??= {};
      if (id && !equalCareValues(rows[id], expected)) throw new CareInputError(t("ui.sleep-entry-changed"));
      if (!validSleepRecord(row) || (row.end ?? row.start) > Date.now()) throw new CareInputError(t("ui.sleep-invalid-time"));
      if (sleepConflicts(rows, row, id)) throw new CareInputError(t("ui.sleep-overlap"));
      rows[id ?? crypto.randomUUID()] = row;
      if (draft && equalCareValues(state.sleepDraftWake, draft)) delete state.sleepDraftWake;
    }, t(row.end === null ? "ui.sleep-start-saved" : "ui.sleep-saved"));
  }

  function setEndpoint(key, at) {
    const wall = sleepWall(at, timezone);
    $(`sleep-${key}-day`).value = wall.day;
    $(`sleep-${key}-time`).value = wall.time;
  }
  function open(id, draft, selectedDay) {
    if (getFamilyView() || !sleepIsEnabled(getState())) return;
    editId = id;
    original = getState().sleepRecords?.[id];
    wakeDraft = draft;
    timezone = original?.zone ?? draft?.zone ?? localZone() ?? "UTC";
    const day = Math.min(selectedDay ?? actionDay(), today());
    form.reset();
    for (const key of ["start", "end"]) {
      $(`sleep-${key}-day`).max = sleepWall(Date.now(), timezone).day;
      $(`sleep-${key}-day`).value = isoDay(day);
    }
    if (original) {
      setEndpoint("start", original.start);
      if (original.end !== null) setEndpoint("end", original.end);
      $("sleep-kind").value = original.kind;
      $("sleep-quality").value = original.quality;
      $("sleep-note").value = original.note ?? "";
    } else if (draft) {
      setEndpoint("end", draft.at);
      $("sleep-start-day").value = $("sleep-end-day").value;
    }
    error.textContent = "";
    preview();
    refreshFields(dialog);
    dialog.showModal();
    if (draft) (dialog.querySelector('[data-for="sleep-start-time"]') ?? $("sleep-start-time")).focus();
  }
  function endpoint(key) {
    const day = $(`sleep-${key}-day`).value;
    const time = $(`sleep-${key}-time`).value;
    if (original?.[key] != null) {
      const before = sleepWall(original[key], timezone);
      if (day === before.day && time === before.time) return original[key];
    }
    return sleepInstant(day, time, timezone);
  }
  function preview() {
    const row = { start: endpoint("start"), end: endpoint("end") };
    $("sleep-duration-preview").textContent = row.start < row.end ? sleepDuration(sleepMinutes(row)) : "";
  }
  form.addEventListener("input", preview);
  form.addEventListener("change", preview);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const row = { start: endpoint("start"), end: endpoint("end"), zone: timezone, kind: $("sleep-kind").value,
      quality: $("sleep-quality").value, note: $("sleep-note").value.trim() };
    if (!validSleepRecord(row) || row.end > Date.now()) { error.textContent = t("ui.sleep-invalid-time"); return; }
    event.submitter.disabled = true;
    try {
      if (await save(row, editId, original, wakeDraft)) dialog.close();
      else error.textContent = $("status").textContent;
    } finally { event.submitter.disabled = false; }
  });

  for (const [start, wake, manual] of [
    ["sleep-start-now", "sleep-wake-now", "sleep-manual"],
    ["today-sleep-start", "today-sleep-wake", "today-sleep-manual"]
  ]) {
    $(start).addEventListener("click", async event => {
      const control = event.currentTarget;
      if (pending(getState().sleepRecords)) return;
      control.disabled = true;
      try {
        if (await save({ start: Date.now(), end: null, zone: localZone() ?? "UTC", kind: "main", quality: "" })) $(wake).focus();
      } finally { control.disabled = false; }
    });
    $(wake).addEventListener("click", async event => {
      const openRecord = pending(getState().sleepRecords);
      const now = Date.now();
      const control = event.currentTarget;
      control.disabled = true;
      try {
        if (openRecord) {
          if (await save({ ...openRecord[1], end: now }, openRecord[0], openRecord[1]) && wake === "today-sleep-wake") $(start).focus();
        } else {
          const draft = { at: now, zone: localZone() ?? "UTC" };
          if (await mutate(state => { state.sleepDraftWake = draft; }, t("ui.sleep-wake-saved"))) open(undefined, draft);
        }
      } finally { control.disabled = false; }
    });
    $(manual).addEventListener("click", () => {
      if (manual === "today-sleep-manual" && actionDay() < today()) {
        open(undefined, undefined, actionDay());
        return;
      }
      const state = getState();
      const active = pending(state.sleepRecords);
      open(active?.[0], active ? undefined : state.sleepDraftWake);
    });
  }

  function paintToday(state, day, visible, compact) {
    $("today-sleep").hidden = !visible || compact;
    if (!visible) return;
    const active = day === today() ? pending(state.sleepRecords) : null;
    const last = completed(state.sleepRecords).find(([, row]) => sleepDay(row) === day)?.[1];
    const summary = active ? t("ui.sleep-in-progress") : last ? sleepDuration(sleepMinutes(last)) : "";
    if (compact) {
      $("program-sleep-summary").textContent = summary;
      return;
    }
    const detail = active ? t("ui.sleep-since", timeOf(active[1].start, active[1].zone)) :
      last ? t("ui.sleep-times", timeOf(last.start, last.zone), timeOf(last.end, last.zone)) : "";
    $("today-sleep-detail").textContent = [summary, detail].filter(Boolean).join(" · ") || t("ui.not-logged");
    const personal = !getFamilyView();
    const quick = personal && day === today();
    $("today-sleep-start").hidden = !quick || Boolean(active);
    $("today-sleep-wake").hidden = !quick || !active;
    $("today-sleep-manual").hidden = !personal || day > today();
    $("today-sleep-manual").textContent = t(quick && !active && state.sleepDraftWake ? "ui.sleep-finish-draft" : "ui.sleep-log");
  }

  function range(state) {
    const cursor = selection ?? today();
    const dates = getDates();
    const first = period === "week" ? cursor - weekIndex(cursor) : dates.monthStart(cursor);
    const last = period === "week" ? first + 6 : dates.monthStart(first + 32) - 1;
    return { first, last, ...sleepReport(state.sleepRecords, first, last) };
  }
  for (const mode of ["week", "month"]) $(`sleep-${mode}`).addEventListener("click", () => {
    period = mode; selection = undefined; chartDay = undefined;
    setPressed([$("sleep-week"), $("sleep-month")], control => control.id === `sleep-${period}`);
    render();
  });
  for (const [direction, offset] of [["previous", -1], ["next", 1]]) $(`sleep-${direction}`).addEventListener("click", () => {
    const { first, last } = range(getState());
    selection = offset > 0 ? last + 1 : first - 1;
    chartDay = undefined;
    render();
  });

  function draw(state) {
    const rows = state.sleepRecords ?? {};
    const active = pending(rows);
    const latest = completed(rows)[0]?.[1];
    const status = $("sleep-banner-status");
    status.hidden = !active && !latest;
    status.textContent = active ? t("ui.sleep-in-progress") : latest ? sleepDuration(sleepMinutes(latest)) : "";
    $("sleep-banner-detail").textContent = active ? t("ui.sleep-since", timeOf(active[1].start, active[1].zone)) :
      latest ? t("ui.sleep-times", timeOf(latest.start, latest.zone), timeOf(latest.end, latest.zone)) : t("ui.sleep-empty");
    $("sleep-actions").hidden = Boolean(getFamilyView());
    $("sleep-start-now").hidden = Boolean(active);
    const draft = !getFamilyView() ? state.sleepDraftWake : null;
    $("sleep-manual").textContent = t(draft && !active ? "ui.sleep-finish-draft" : "ui.sleep-manual");
    const { first, last, nights, average, naps } = range(state);
    const dates = getDates();
    const chart = $("sleep-chart");
    chart.dataset.period = period;
    $("sleep-range").textContent = t("ui.sleep-range", dates.shortDate(first), dates.shortDate(last));
    $("sleep-next").disabled = last >= today();
    const metrics = [];
    if (average !== null) metrics.push(t("ui.sleep-average", sleepDuration(average), number(nights.size)));
    if (naps) metrics.push(t("ui.sleep-nap-total", sleepDuration(naps)));
    if (state.sleepSettings?.goal) metrics.push(t("ui.sleep-goal-value", sleepDuration(state.sleepSettings.goal)));
    $("sleep-average").textContent = metrics.join(" · ") || t("ui.sleep-empty");
    const scale = Math.max(600, ...nights.values());
    chart.replaceChildren(...Array.from({ length: last - first + 1 }, (_, index) => {
      const day = first + index;
      const minutes = nights.get(day);
      const item = element("li");
      const select = button(dates.dayNumber(day), () => {
        chartDay = chartDay === day ? undefined : day;
        render();
      });
      select.dataset.focusKey = "sleep-chart-" + day;
      select.setAttribute("aria-label", dates.formatDay(day, true) + " · " +
        (minutes === undefined ? t("ui.sleep-no-record") : sleepDuration(minutes)));
      select.setAttribute("aria-pressed", String(day === chartDay));
      const bar = element("span");
      bar.setAttribute("aria-hidden", "true");
      bar.style.setProperty("--sleep-bar", (minutes ?? 0) / scale * 100 + "%");
      select.prepend(bar);
      item.append(select);
      return item;
    }));
    const entries = Object.entries(rows).sort((a, b) => (b[1].end ?? b[1].start) - (a[1].end ?? a[1].start))
      .filter(([, row]) => chartDay === undefined ? row.end === null || sleepDay(row) >= first && sleepDay(row) <= last : sleepDay(row) === chartDay);
    $("sleep-empty").hidden = Boolean(entries.length);
    $("sleep-history").replaceChildren(...entries.map(([id, row]) => {
      const article = element("article", "", "sleep-history-row");
      const title = row.end === null ? t("ui.sleep-in-progress") : t(row.kind === "main" ? "ui.sleep-main" : "ui.sleep-nap") +
        " · " + sleepDuration(sleepMinutes(row));
      const detail = element("div");
      detail.append(element("strong", title), element("p", dates.formatDay(sleepDay(row), true) + " · " +
        (row.end === null ? timeOf(row.start, row.zone) : t("ui.sleep-times", timeOf(row.start, row.zone), timeOf(row.end, row.zone))), "quiet"));
      if (row.quality) detail.append(element("p", t(`ui.sleep-${row.quality}`), "quiet"));
      if (row.note) detail.append(element("p", row.note, "quiet"));
      article.append(detail);
      if (!getFamilyView()) {
        const edit = button(t("ui.edit"), () => open(id));
        const remove = button(t("ui.delete"), () => requestDeletion({
          title: t("ui.sleep-delete"), message: dates.formatDay(sleepDay(row)), success: t("ui.sleep-deleted"),
          change: next => { delete next.sleepRecords?.[id]; }
        }));
        edit.className = remove.className = "text-button";
        article.append(edit, remove);
      }
      return article;
    }));
  }
  return { open, draw, paintToday, focusDay(day) {
    selection = chartDay = day;
    render();
    $("sleep-history-title").scrollIntoView({ block: "nearest" });
  }, reset() { period = "week"; selection = chartDay = undefined; dialog.close(); } };
}
