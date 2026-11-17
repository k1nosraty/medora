import { $, button, dayCardOptions, element } from "../../shared/ui/dom.js";
import { cycleForecast } from "../../domain/cycle.js";
import { localDigits, t, weekIndex } from "../../shared/i18n/locale.js";

const weekStart = day => day - weekIndex(day);
const dayCount = value => value === 1 ? t("ui.cycle-one-day") : t("ui.cycle-day-count", localDigits(value));
const flowLabels = { light: "ui.cycle-flow-light", medium: "ui.cycle-flow-medium", heavy: "ui.cycle-flow-heavy" };

export function installCycleOverview({ today, getDates, getFamilyView, openCalendar, edit, remove }) {
  const previousWeek = $("cycle-previous-week");
  const nextWeek = $("cycle-next-week");
  const metrics = [...document.querySelectorAll("[data-cycle-metric]")];
  let week;
  let metric = "interval";
  let entries = [];
  let forecast;
  let series;

  function showRecord(day) {
    const card = $("cycle-entry-" + day);
    card?.focus({ preventScroll: true });
    card?.scrollIntoView({ block: "center" });
  }

  function paintWeek() {
    const now = today();
    const { shortDate, formatDay, dayNumber } = getDates();
    const first = weekStart(entries.at(-1).day);
    const last = weekStart(Math.max(now, entries[0].day, forecast?.last ?? now));
    week = Math.max(first, Math.min(last, week ?? weekStart(now)));
    previousWeek.disabled = week === first;
    nextWeek.disabled = week === last;
    $("cycle-week-label").textContent = t("ui.cycle-date-range", shortDate(week), shortDate(week + 6));
    $("cycle-days").replaceChildren(...Array.from({ length: 7 }, (_, offset) => {
      const day = week + offset;
      const entry = entries.find(item => item.day <= day && day <= (item.end ?? item.day));
      const mark = entry ? "recorded" : forecast && day >= now && day >= forecast.first && day <= forecast.last ? "forecast" : "";
      const cell = entry ? button(dayNumber(day), () => showRecord(entry.day)) : element("span", dayNumber(day));
      cell.dataset.focusKey = "cycle-day-" + day;
      if (mark) cell.dataset.cycleMark = mark;
      if (day === now) cell.setAttribute("aria-current", "date");
      const state = mark === "recorded" ? "ui.logged-cycle" : mark === "forecast" ? "ui.estimated-cycle-start" : null;
      if (!entry) cell.setAttribute("role", "img");
      cell.setAttribute("aria-label", state ? `${formatDay(day, true)} · ${t(state)}` : formatDay(day, true));
      return cell;
    }));
    const view = getFamilyView();
    $("cycle-full-calendar").hidden = Boolean(view && !view.canView("insights"));
  }

  function paintTrend() {
    const visible = metrics.filter(control => series[control.dataset.cycleMetric].length >= 2);
    $("cycle-trend").hidden = visible.length === 0;
    if (!visible.length) {
      $("cycle-bars").replaceChildren();
      return;
    }
    if (!visible.some(control => control.dataset.cycleMetric === metric)) metric = visible[0].dataset.cycleMetric;
    for (const control of metrics) {
      control.hidden = !visible.includes(control);
      control.setAttribute("aria-pressed", String(control.dataset.cycleMetric === metric));
    }
    const points = series[metric].slice(0, 6).reverse();
    const scale = Math.max(...points.map(point => point.value));
    const { shortDate, formatDay } = getDates();
    $("cycle-bars").replaceChildren(...points.map(({ day, value }) => {
      const item = element("li");
      const control = button("", () => showRecord(day));
      control.dataset.focusKey = `cycle-bar-${metric}-${day}`;
      control.setAttribute("aria-label", formatDay(day) + " · " + dayCount(value));
      const plot = element("span", "", "cycle-bar-track");
      const bar = element("span", "", "cycle-bar");
      bar.style.blockSize = `${100 * value / scale}%`;
      plot.append(bar);
      control.append(element("strong", dayCount(value)), plot, element("small", shortDate(day)));
      item.append(control);
      return item;
    }));
  }

  function recordCard(entry, view) {
    const { day, end, flow, note, sharedNote, recordedBy } = entry;
    const { formatDay, shortDate, year } = getDates();
    const row = element("article", "", "cycle-record");
    row.id = "cycle-entry-" + day;
    row.tabIndex = -1;
    row.dataset.focusScope = row.id;
    const heading = element("div", "", "cycle-record-heading");
    const date = end == null || end === day ? formatDay(day) :
      t("ui.cycle-date-range", year(day) === year(end) ? shortDate(day) : formatDay(day), formatDay(end));
    heading.append(element("h3", date));
    if (!view) {
      const removeButton = button(t("ui.delete"), () => remove(day));
      removeButton.classList.add("danger-link");
      heading.append(dayCardOptions(t("ui.cycle-record-options"), button(t("ui.edit"), () => edit(day)), removeButton));
    }
    row.append(heading);
    const facts = element("div", "", "cycle-record-facts");
    facts.append(element("span", end == null ? t("ui.cycle-end-missing") : dayCount(end - day + 1)));
    if (flowLabels[flow]) facts.append(element("span", t("ui.cycle-flow-level", t(flowLabels[flow]))));
    row.append(facts);
    if (note || sharedNote) {
      const details = element("details", "", "cycle-record-note");
      const summary = element("summary");
      const preview = element("span", note || sharedNote, "cycle-note-preview");
      const full = element("p", note || sharedNote);
      preview.dir = full.dir = "auto";
      summary.append(element("span", t("ui.cycle-note-details")), preview);
      details.append(summary, full);
      row.append(details);
    }
    if (view && recordedBy) row.append(element("small", t("ui.recorded-by-value", view.authorName(entry)), "family-stamp"));
    return row;
  }

  function render(records) {
    const now = today();
    const view = getFamilyView();
    entries = Object.entries(records).map(([day, record]) => ({ ...record, day: Number(day) })).sort((a, b) => b.day - a.day);
    forecast = cycleForecast(records);
    const latest = entries[0];
    $("cycle-banner-title").textContent = t(latest ? "ui.menstrual-cycle" : "ui.cycle");
    $("cycle-add").textContent = t(latest ? "ui.log-period-start" : "ui.cycle-first-start");
    $("cycle-latest").textContent = latest ? t("ui.cycle-last-start", getDates().formatDay(latest.day)) : "";
    $("cycle-forecast").textContent = !latest ? t("ui.no-cycles-logged-yet") :
      !forecast ? t("ui.an-estimate-appears-after-you-log-three-start-dates") :
      forecast.last < now ? t("ui.log-a-new-start-date-to-update-the-estimate") :
      t("ui.estimated-value-to-value", getDates().formatDay(forecast.first), getDates().formatDay(forecast.last));
    const missingEnd = latest?.end == null && Boolean(latest);
    $("cycle-end-status").hidden = !missingEnd;
    $("cycle-log-end").hidden = !missingEnd || Boolean(view);
    $("cycle-calendar").hidden = $("cycle-records").hidden = !latest;
    $("cycle-history").replaceChildren(...entries.map(item => recordCard(item, view)));
    series = {
      interval: entries.slice(0, -1).map(({ day }, i) => ({ day, value: day - entries[i + 1].day })),
      duration: entries.filter(({ end }) => end != null).map(({ day, end }) => ({ day, value: end - day + 1 }))
    };
    if (latest) paintWeek();
    paintTrend();
  }

  for (const [control, step] of [[previousWeek, -7], [nextWeek, 7]]) {
    control.addEventListener("click", () => {
      week += step;
      paintWeek();
      if (control.disabled) (control === previousWeek ? nextWeek : previousWeek).focus();
    });
  }
  for (const control of metrics) control.addEventListener("click", () => {
    metric = control.dataset.cycleMetric;
    paintTrend();
  });
  $("cycle-full-calendar").addEventListener("click", () => {
    const now = today();
    openCalendar(weekStart(now) === week ? now : week);
  });
  $("cycle-log-end").addEventListener("click", () => {
    if (!getFamilyView() && entries.length) edit(entries[0].day, { end: true });
  });

  return { render, reset() {
    week = undefined;
    metric = "interval";
    entries = [];
    forecast = undefined;
    series = undefined;
    for (const id of ["cycle-latest", "cycle-forecast", "cycle-week-label", "cycle-days", "cycle-history", "cycle-bars"]) {
      $(id).replaceChildren();
    }
    for (const id of ["cycle-calendar", "cycle-end-status", "cycle-log-end", "cycle-records", "cycle-trend"]) $(id).hidden = true;
  } };
}
