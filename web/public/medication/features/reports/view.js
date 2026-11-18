import { renderWaterChart } from "./water-chart.js";
import { renderStats } from "./stats.js";
import { renderMonthGrid } from "../../shared/ui/month-grid.js";
import { listSeparator, locale, t } from "../../shared/i18n/locale.js";
import { $, button, dayCardOptions, element } from "../../shared/ui/dom.js";
import { mountDayCard } from "../../shared/ui/day-card.js";
import { glassObject } from "../../design/three-dimensional.js";
import { cycleIsEnabled } from "../../domain/profile.js";
import { sleepReport, sleepIsEnabled, sleepDay, sleepMinutes } from "../../domain/sleep.js";
import { sleepDuration, sleepImage } from "../sleep/presentation.js";
import { describeCycleDay } from "../cycle/daily.js";
import { cycleForecast, cycleTotals } from "../../domain/cycle.js";

const numbers = new Intl.NumberFormat(locale);
const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
const timeMinutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
const number = value => numbers.format(value);
const sum = values => values.reduce((total, value) => total + value, 0);

function calendarTracker(kind, label, image, title, details, optionsLabel, history, action) {
  const card = element("article", "", `program-${kind} calendar-tracker`);
  if (kind === "water") card.classList.add("water", "calendar-water");
  card.dataset.agendaKey = kind;
  const layout = mountDayCard(card, { kind, label, image, title: element("h3", title) });
  for (const line of details) layout.details.append(element("p", line, "quiet"));
  layout.addActions(dayCardOptions(optionsLabel, button(t("ui.history"), history)), ...(action ? [action] : []));
  return card;
}

export function renderCalendar(state, index, { day, start, end, today, formatMonth, formatDay, formatNumber, selectDay,
  renderDose, disposeDoseCards, renderRoutine, visitCard, openWaterHistory, openSleepHistory, openSleep, cycleOpenDay, openCycleHistory, canLogPersonal, canAddWater = true, addWater }) {
  const cycleEnabled = cycleIsEnabled(state);
  const cycleRecords = cycleEnabled ? state.cycleRecords ?? {} : {};
  const periods = Object.entries(cycleRecords).map(([first, record]) => [Number(first), record.end ?? Number(first)]);
  const forecast = cycleEnabled ? cycleForecast(cycleRecords) : null;
  const daily = cycleEnabled ? state.cycleDays ?? {} : {};
  const cycleDayMark = date => {
    const flow = daily[date]?.flow;
    if (flow === "spotting") return "spotting";
    if (["light", "medium", "heavy"].includes(flow) || flow !== "none" &&
        periods.some(([first, last]) => date >= first && date <= last)) return "recorded";
    if (forecast && date >= Math.max(forecast.first, today) && date <= forecast.last) return "forecast";
    return null;
  };
  const sleepEnabled = sleepIsEnabled(state);
  const sleepDays = new Map();
  if (sleepEnabled) for (const row of Object.values(state.sleepRecords ?? {})) {
    if (row.end === null) continue;
    const date = sleepDay(row);
    if (date >= start && date <= end) {
      const entries = sleepDays.get(date) ?? [];
      entries.push(row);
      sleepDays.set(date, entries);
    }
  }
  $("calendar-sleep-key").hidden = !sleepEnabled;
  $("calendar-cycle-key").hidden = !cycleEnabled;
  $("calendar-month").textContent = formatMonth(start);
  renderMonthGrid($("calendar-days"), {
    start, end, selected: day, today, formatDay, formatNumber, onSelect: selectDay,
    describe(date) {
      const dots = [], captions = [];
      for (const [exists, kind, label] of [
        [index.waterOn(date).length, "water", t("ui.log-water")], [index.dosesOn(date).length, "medicine", t("ui.medication-dose")],
        [sleepDays.has(date), "sleep", t("ui.sleep")],
        [index.visitsOn(date).length, "visit", t("ui.medical-appointment")], [index.calendarRoutinesOn(date).length, "routine", t("ui.routine")]
      ]) if (exists) {
        dots.push(kind);
        captions.push(label);
      }
      const cycle = cycleDayMark(date);
      if (cycle) {
        const label = { spotting: "ui.cycle-spotting", recorded: "ui.logged-cycle", forecast: "ui.estimated-cycle-start" }[cycle];
        captions.push(t(label));
      } else if (daily[date]) dots.push("cycle");
      return { dots, cycle: cycle ?? undefined, caption: captions.length ? listSeparator + captions.join(listSeparator) : "" };
    }
  });

  const trackers = [];
  const water = index.waterOn(day);
  if (water.length || canAddWater) {
    const count = !water.length ? t("ui.no-water-logged-for-this-day") :
      water.length === 1 ? t("ui.1-water-entry") : t("ui.value-water-entries", number(water.length));
    trackers.push(calendarTracker("water", t("ui.water"), glassObject("water", "water"),
      t("ui.value-ml", number(index.waterTotal(day))), [count], t("ui.water-log-options"), openWaterHistory,
      canAddWater ? button(t("ui.log-water"), addWater) : null));
  }
  const sleepEntries = sleepDays.get(day) ?? [];
  if (sleepEnabled && (sleepEntries.length || canLogPersonal)) {
    const total = sum(sleepEntries.map(sleepMinutes));
    const details = sleepEntries.length ? sleepEntries.map(row => {
      const kind = t(row.kind === "nap" ? "ui.sleep-nap" : "ui.sleep-main");
      return sleepEntries.length === 1 ? kind : kind + listSeparator + sleepDuration(sleepMinutes(row));
    }) : [];
    trackers.push(calendarTracker("sleep", t("ui.sleep"), sleepImage(),
      sleepEntries.length ? sleepDuration(total) : t("ui.not-logged"), details, t("ui.sleep-history"), () => openSleepHistory(day),
      canLogPersonal ? button(t("ui.sleep-log"), () => openSleep(day)) : null));
  }
  const cycleMark = cycleDayMark(day);
  if (cycleEnabled && (daily[day] || cycleMark || canLogPersonal)) {
    const title = t({ forecast: "ui.estimated-cycle-start", recorded: "ui.logged-cycle", spotting: "ui.cycle-spotting" }[cycleMark] ??
      (daily[day] ? "ui.cycle-recorded-day" : "ui.not-logged"));
    trackers.push(calendarTracker("cycle", t("ui.cycle"), glassObject("cycle", "cycle"), title,
      daily[day] ? [describeCycleDay(daily[day]).join(" · ")] : [], t("ui.cycle-record-options"), openCycleHistory,
      canLogPersonal ? button(t("ui.cycle-day-log"), () => cycleOpenDay(day)) : null));
  }
  const entries = [
    ...index.dosesOn(day).map(dose => ({
      key: `dose:${dose.medicineId}:${dose.minute}`, minute: dose.minute,
      render: () => renderDose(state.medicines[dose.medicineId], dose, "calendar")
    })),
    ...index.visitsOn(day).map(local => ({
      key: `visit:${local.visit.id}`, minute: timeMinutes(local.time),
      render: () => visitCard(local, index.zone, true, "calendar")
    })),
    ...index.calendarRoutinesOn(day).map(entry => ({
      key: `routine:${entry.id}`, minute: entry.minute ?? Infinity,
      render: () => renderRoutine(entry, day, { dayCard: true, calendar: true, readOnly: day >= today && Boolean(entry.historical) })
    })),
  ].sort((a, b) => a.minute - b.minute);
  $("calendar-date").textContent = formatDay(day, true);
  $("calendar-agenda-label").textContent = t(day > today ? "برنامهٔ این روز" : "برنامه و سابقهٔ این روز");
  $("calendar-today").hidden = day === today;
  const list = $("calendar-entries");
  const active = list.contains(document.activeElement) ? document.activeElement : null;
  const focusedKey = active?.closest("[data-agenda-key]")?.dataset.agendaKey;
  const nodes = [...trackers, ...entries.map(entry => {
    const card = entry.render();
    card.dataset.agendaKey = entry.key;
    return card;
  })];
  for (const card of nodes) card.dataset.focusScope = "agenda:" + card.dataset.agendaKey;
  disposeDoseCards?.(list);
  list.replaceChildren(...(nodes.length ? nodes : [element("p",
    t(day > today ? "برای این روز برنامه‌ای ندارید." : "برای این روز برنامه یا سابقه‌ای ندارید."), "empty")]));
  if (focusedKey) {
    const card = nodes.find(node => node.dataset.agendaKey === focusedKey);
    (card?.querySelector(".day-card-actions > button, .day-card-more > summary") ?? $("calendar-days").querySelector('[aria-pressed="true"]'))
      ?.focus({ preventScroll: true });
  }
}

function renderCycleReport(state, first, last, formatDay) {
  const sleepEnabled = sleepIsEnabled(state);
  $("report-sleep-card").hidden = !sleepEnabled;
  if (sleepEnabled) {
    const summary = sleepReport(state.sleepRecords, first, last);
    $("report-sleep-value").textContent = summary.average === null ? t("ui.sleep-empty") :
      t("ui.sleep-average", sleepDuration(summary.average), number(summary.nights.size));
  }
  const enabled = cycleIsEnabled(state);
  $("report-cycle-card").hidden = !enabled;
  const totals = enabled ? cycleTotals(state.cycleRecords, first, last, state.cycleDays) : null;
  $("report-cycle-empty").hidden = Boolean(totals?.days);
  $("report-cycle-breakdown").hidden = !totals?.days;
  renderStats($("report-cycle-breakdown"), totals?.days ? [
    ["شروع‌های ثبت‌شده", number(totals.starts)],
    ["روزهای ثبت‌شدهٔ پریود", number(totals.days)],
    ...(totals.latestStart === null ? [] : [["آخرین شروع در این بازه", formatDay(totals.latestStart)]])
  ] : []);
}

export function renderReports({ first, last, period }, goal, index, formatShortDate, formatDay, monthStart, state) {
  renderCycleReport(state, first, last, formatDay);
  const range = Array.from({ length: last - first + 1 }, (_, i) => index.waterTotal(first + i));
  const waterDays = range.filter(Boolean).length;
  const totalWater = sum(range);
  const { taken, skipped, unrecorded } = index.doseTotals(first, last);
  $("report-dates").textContent = t("ui.from-value-to-value", formatDay(first), formatDay(last));
  $("report-water-number").textContent = waterDays ? number(Math.round(totalWater / waterDays)) : "";
  $("report-average").hidden = $("report-water-value").hidden = $("report-water-details").hidden =
    $("report-water-trend").hidden = !waterDays;
  $("report-water-empty").hidden = Boolean(waterDays);
  if (waterDays) {
    renderStats($("report-water-coverage"), [
      ["کل آب (میلی‌لیتر)", number(totalWater)],
      ["روزهای دارای ثبت", t("ui.value-of-value", number(waterDays), number(range.length))],
      ["روزهای رسیدن به هدف", number(range.filter(amount => amount >= goal).length), "done"]
    ]);
  }
  $("report-goal-label").textContent = t("ui.current-daily-goal-value-ml", number(goal));
  const doses = taken + skipped + unrecorded;
  const hasDoses = doses > 0;
  const ratio = hasDoses ? taken / doses : 0;
  $("report-dose-number").textContent = percent.format(Math.floor(ratio * 1000) / 1000);
  $("report-dose-value").hidden = !hasDoses;
  $("report-dose-progress").value = ratio;
  $("report-dose-progress").hidden = !hasDoses;
  $("report-doses").textContent = hasDoses
    ? t("ui.value-of-value-doses-taken", number(taken), number(doses))
    : t("ui.no-doses-are-due-or-logged-in-this-period");
  $("report-dose-breakdown").hidden = !hasDoses;
  if (hasDoses) renderStats($("report-dose-breakdown"), [
    ["مصرف‌شده", number(taken), "done"],
    ["مصرف‌نشده", number(skipped), "partial"],
    ["بدون ثبت", number(unrecorded)]
  ]);

  const routines = index.routineTotals(first, last);
  const routineCount = routines.completed + routines.partial + routines.unrecorded;
  const hasRoutines = routineCount > 0;
  const routineRatio = hasRoutines ? routines.completed / routineCount : 0;
  $("report-routine-number").textContent = percent.format(Math.floor(routineRatio * 1000) / 1000);
  $("report-routine-value").hidden = !hasRoutines;
  $("report-routine-progress").value = routineRatio;
  $("report-routine-progress").hidden = !hasRoutines;
  $("report-routines").textContent = hasRoutines
    ? t("ui.value-of-value-routine-occurrences-completed", number(routines.completed), number(routineCount))
    : t("ui.no-routines-are-due-or-logged-in-this-period");
  $("report-routine-breakdown").hidden = !hasRoutines;
  if (hasRoutines) renderStats($("report-routine-breakdown"), [
    ["انجام‌شده", number(routines.completed), "done"],
    ["نیمه‌تمام", number(routines.partial), "partial"],
    ["بدون ثبت", number(routines.unrecorded)]
  ]);

  const visits = index.visitTotals(first, last);
  const hasVisits = Object.values(visits).some(Boolean);
  $("report-visit-number").textContent = number(visits.attended);
  $("report-visit-value").hidden = !hasVisits;
  $("report-visits").textContent = t(hasVisits ? "قرار با حضور ثبت‌شده" : "در این بازه قراری ندارید.");
  $("report-visit-breakdown").hidden = !hasVisits;
  if (hasVisits) renderStats($("report-visit-breakdown"), [
    ["بدون ثبت حضور", number(visits.unrecorded)],
    ["پیش رو", number(visits.upcoming)],
    ["لغوشده", number(visits.cancelled), "partial"]
  ]);

  if (waterDays) renderWaterChart(range, first, goal, period === "year", formatShortDate, formatDay, monthStart);
}
