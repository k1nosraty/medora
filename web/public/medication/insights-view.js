import { listSeparator, locale, shortWeek, t, weekIndex } from "./locale.js";
import { $, button, dayCardOptions, element } from "./dom.js";

const numbers = new Intl.NumberFormat(locale);
const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
const timeMinutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
const number = value => numbers.format(value);
const sum = values => values.reduce((total, value) => total + value, 0);

function waterCard(entries, total, openHistory, addWater) {
  const card = element("article", "", "water day-card calendar-water");
  card.dataset.calendarState = "done";
  const art = element("div", "", "day-card-art");
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const use = document.createElementNS(icon.namespaceURI, "use");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  use.setAttribute("href", "#i-water");
  icon.append(use);
  art.append(icon, element("span", t("آب"), "day-card-kind"));
  const copy = element("div", "", "day-card-content");
  copy.append(element("h3", t("{0} میلی‌لیتر", number(total))), element("p",
    entries.length === 1 ? t("۱ بار ثبت آب") : t("{0} بار ثبت آب", number(entries.length)), "quiet"));
  const actions = element("div", "", "day-card-actions");
  actions.append(dayCardOptions(t("گزینه‌های ثبت آب"), button(t("سوابق"), openHistory)), button(t("ثبت آب"), addWater));
  card.append(art, copy, actions);
  return card;
}

export function renderCalendar(state, index, { day, start, end, today, formatMonth, formatDay, dateButton, selectDay,
  renderDose, renderRoutine, visitCard, openWaterHistory, addWater }) {
  const slots = shortWeek.map(label => element("span", label, "quiet"));
  for (let offset = 0; offset < weekIndex(start); offset++) slots.push(element("span"));
  for (let date = start; date <= end; date++) {
    const control = dateButton(date, day, selected => selectDay(selected, true));
    control.tabIndex = date === day ? 0 : -1;
    control.setAttribute("aria-pressed", String(date === day));
    if (date === today) control.classList.add("calendar-today");
    else control.removeAttribute("aria-current");
    if (date === today) control.setAttribute("aria-current", "date");
    control.addEventListener("keydown", event => {
      const rtl = document.documentElement.dir === "rtl";
      const target = { ArrowLeft: date + (rtl ? 1 : -1), ArrowRight: date + (rtl ? -1 : 1),
        ArrowUp: date - 7, ArrowDown: date + 7, Home: date - weekIndex(date), End: date + 6 - weekIndex(date) }[event.key];
      if (target === undefined) return;
      event.preventDefault();
      selectDay(target, true);
    });
    const dots = element("span", "", "calendar-dots");
    dots.setAttribute("aria-hidden", "true");
    for (const [exists, kind, label] of [
      [index.waterOn(date).length, "water", t("ثبت آب")], [index.dosesOn(date).length, "medicine", t("نوبت دارو")],
      [index.visitsOn(date).length, "visit", t("قرار پزشکی")], [index.calendarRoutinesOn(date).length, "routine", t("روتین")]
    ]) if (exists) {
      dots.append(element("i", "", kind));
      control.setAttribute("aria-label", control.getAttribute("aria-label") + listSeparator + label);
    }
    control.append(dots);
    slots.push(control);
  }
  const grid = $("calendar-days");
  const gridFocused = grid.contains(document.activeElement);
  $("calendar-month").textContent = formatMonth(start);
  grid.replaceChildren(...slots);
  if (gridFocused) grid.querySelector('[aria-pressed="true"]').focus({ preventScroll: true });

  const water = index.waterOn(day);
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
      render: () => renderRoutine(entry, day, { dayCard: true, calendar: true, readOnly: Boolean(entry.historical) })
    })),
    ...(water.length ? [{ key: "water", minute: water.reduce((first, entry) => Math.min(first, timeMinutes(entry.time)), Infinity),
      render: () => waterCard(water, index.waterTotal(day), openWaterHistory, addWater) }] : [])
  ].sort((a, b) => a.minute - b.minute);
  $("calendar-date").textContent = formatDay(day, true);
  $("calendar-agenda-label").textContent = t(day > today ? "برنامهٔ این روز" : "برنامه و سابقهٔ این روز");
  $("calendar-today").hidden = day === today;
  const list = $("calendar-entries");
  const active = list.contains(document.activeElement) ? document.activeElement : null;
  const focusedKey = active?.closest("[data-agenda-key]")?.dataset.agendaKey;
  const nodes = entries.map(entry => {
    const card = entry.render();
    card.dataset.agendaKey = entry.key;
    return card;
  });
  list.replaceChildren(...(nodes.length ? nodes : [element("p",
    t(day > today ? "برای این روز برنامه‌ای ندارید." : "برای این روز برنامه یا سابقه‌ای ندارید."), "empty")]));
  if (focusedKey) {
    const card = nodes.find(node => node.dataset.agendaKey === focusedKey);
    (card?.querySelector(".day-card-actions > button, .day-card-more > summary") ?? grid.querySelector('[aria-pressed="true"]'))
      ?.focus({ preventScroll: true });
  }
}

function reportChart(range, first, goal, formatShortDate, formatDay, monthStart) {
  const last = first + range.length - 1;
  const bars = [];
  for (let start = first; start <= last;) {
    let end = start;
    if (range.length === 365) {
      const month = monthStart(start);
      end = Math.min(last, monthStart(month + 32) - 1);
    }
    const amounts = range.slice(start - first, end - first + 1).filter(Boolean);
    bars.push({ start, end, count: amounts.length, value: amounts.length ? sum(amounts) / amounts.length : 0 });
    start = end + 1;
  }

  const chart = $("report-chart");
  const label = (bar, long = false) => {
    const format = long ? formatDay : formatShortDate;
    const dates = bar.start === bar.end ? format(bar.start) : t("از {0} تا {1}", format(bar.start), format(bar.end));
    const value = bar.count ? t("{0} میلی‌لیتر", number(Math.round(bar.value))) : t("بدون ثبت");
    return t("{0}؛ {1}", dates, value);
  };
  const key = JSON.stringify([goal, bars.map(bar => [label(bar, true), bar.start, bar.end, bar.value])]);
  if (chart.dataset.chartKey === key) return;
  chart.dataset.chartKey = key;
  const max = Math.max(goal, ...bars.map(bar => bar.value));
  chart.style.setProperty("--goal", `${goal / max * 100}%`);
  const selection = $("report-chart-selection");
  const previous = $("report-chart-previous");
  const next = $("report-chart-next");
  const initial = bars.findLastIndex(bar => bar.count);
  let selected = initial;
  const controls = bars.map((bar, i) => {
    const control = button("", () => select(i));
    control.setAttribute("aria-label", label(bar, true));
    control.style.setProperty("--bar", `${bar.value / max * 100}%`);
    control.style.setProperty("--days", bar.end - bar.start + 1);
    control.dataset.logged = String(Boolean(bar.count));
    control.addEventListener("keydown", event => {
      const rtl = document.documentElement.dir === "rtl";
      const target = { ArrowLeft: i + (rtl ? 1 : -1), ArrowRight: i + (rtl ? -1 : 1),
        Home: 0, End: bars.length - 1 }[event.key];
      if (target === undefined) return;
      event.preventDefault();
      if (controls[target]) {
        select(target);
        controls[target].focus();
      }
    });
    return control;
  });
  function select(index) {
    selected = index;
    controls.forEach((control, i) => {
      control.setAttribute("aria-pressed", String(i === selected));
      control.tabIndex = i === selected ? 0 : -1;
    });
    const bar = bars[selected];
    const copy = label(bar, range.length === 365);
    selection.textContent = bar.end > bar.start && bar.count ?
      t("{0} میانگین روزهای ثبت‌شده ({1} روز)", copy, number(bar.count)) : copy;
    previous.setAttribute("aria-disabled", String(selected === 0));
    next.setAttribute("aria-disabled", String(selected === bars.length - 1));
  }
  previous.onclick = () => { if (selected > 0) select(selected - 1); };
  next.onclick = () => { if (selected < bars.length - 1) select(selected + 1); };
  chart.replaceChildren(...controls);
  $("report-chart-dates").replaceChildren(element("span", formatShortDate(first)), element("span", formatShortDate(last)));
  select(initial);
}

export function renderReports(last, goal, index, reportSpan, formatShortDate, formatDay, monthStart) {
  const first = last - reportSpan + 1;
  const range = Array.from({ length: reportSpan }, (_, i) => index.waterTotal(first + i));
  const waterDays = range.filter(Boolean).length;
  const totalWater = sum(range);
  const { taken, skipped, unrecorded } = index.doseTotals(first, last);
  $("report-dates").textContent = t("از {0} تا {1}", formatDay(first), formatDay(last));
  $("report-water-number").textContent = waterDays ? number(Math.round(totalWater / waterDays)) : "";
  $("report-average").hidden = $("report-water-value").hidden = $("report-water-coverage").hidden =
    $("report-water-trend").hidden = !waterDays;
  $("report-water-empty").hidden = Boolean(waterDays);
  $("report-water-coverage").textContent = t("{0} میلی‌لیتر در {1} روز از {2} روز", number(totalWater), number(waterDays), number(reportSpan));
  $("report-goal-label").textContent = t("هدف روزانهٔ آب، {0} میلی‌لیتر", number(goal));
  const doses = taken + skipped + unrecorded;
  const hasDoses = doses > 0;
  const ratio = hasDoses ? taken / doses : 0;
  $("report-dose-number").textContent = percent.format(Math.floor(ratio * 1000) / 1000);
  $("report-dose-number").hidden = !hasDoses;
  $("report-dose-progress").value = ratio;
  $("report-dose-progress").hidden = !hasDoses;
  $("report-doses").textContent = hasDoses
    ? t("{0} از {1} نوبت مصرف شد.", number(taken), number(doses))
    : t("در این بازه نوبت موعدرسیده یا ثبت‌شده‌ای نیست.");
  $("report-dose-breakdown").hidden = !hasDoses;
  $("report-dose-breakdown").textContent = [
    t("{0} مصرف‌نشده", number(skipped)),
    t("{0} بدون ثبت", number(unrecorded))
  ].join(" · ");

  const routines = index.routineTotals(first, last);
  const hasRoutines = routines.completed + routines.partial + routines.unrecorded > 0;
  $("report-routine-number").textContent = number(routines.completed);
  $("report-routine-number").hidden = !hasRoutines;
  $("report-routines").textContent = t(hasRoutines ? "نوبت روتین انجام شد" : "در این بازه نوبت روتین موعدرسیده یا ثبت‌شده‌ای نیست.");
  $("report-routine-breakdown").hidden = !hasRoutines;
  $("report-routine-breakdown").textContent = [
    t("{0} نیمه‌تمام", number(routines.partial)),
    t("{0} بدون ثبت", number(routines.unrecorded)),
    t("{0} روز دارای ثبت", number(routines.activeDays))
  ].join(" · ");

  const visits = index.visitTotals(first, last);
  const hasVisits = Object.values(visits).some(Boolean);
  $("report-visit-number").textContent = number(visits.attended);
  $("report-visit-number").hidden = !hasVisits;
  $("report-visits").textContent = t(hasVisits ? "قرار با حضور ثبت‌شده" : "در این بازه قراری ندارید.");
  $("report-visit-breakdown").hidden = !hasVisits;
  $("report-visit-breakdown").textContent = [
    t("{0} بدون ثبت حضور", number(visits.unrecorded)),
    t("{0} پیش رو", number(visits.upcoming)),
    t("{0} لغوشده", number(visits.cancelled))
  ].join(" · ");

  if (waterDays) reportChart(range, first, goal, formatShortDate, formatDay, monthStart);
}
