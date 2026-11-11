import { listSeparator, locale, shortWeek, t, weekIndex } from "./locale.js";
import { $, element } from "./dom.js";

const numbers = new Intl.NumberFormat(locale);
const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });

export function renderCalendar(state, index, { day, start, today, formatMonth, formatDay, dateButton, selectDay, renderDose, renderRoutine, visitCard }) {
  const month = formatMonth(start);
  const slots = shortWeek.map(label => element("span", label, "quiet"));
  for (let offset = 0; offset < weekIndex(start); offset++) slots.push(element("span"));
  for (let date = start; formatMonth(date) === month; date++) {
    const control = dateButton(date, day, selected => {
      selectDay(selected);
      $("calendar-days").querySelector('[aria-current="date"]')?.focus();
    });
    if (date === today) control.classList.add("calendar-today");
    const dots = element("span", "", "calendar-dots");
    dots.setAttribute("aria-hidden", "true");
    for (const [exists, kind, label] of [
      [index.waterOn(date).length, "water", t("ثبت آب")], [index.hasDoses(date), "medicine", t("نوبت دارو")],
      [index.visitsOn(date).some(({ visit }) => !visit.cancelled), "visit", t("قرار پزشکی")],
      [index.routinesOn(date).length, "routine", t("روتین")]
    ]) if (exists) {
      dots.append(element("i", "", kind));
      control.setAttribute("aria-label", control.getAttribute("aria-label") + listSeparator + label);
    }
    control.append(dots);
    slots.push(control);
  }
  $("calendar-month").textContent = month;
  $("calendar-days").replaceChildren(...slots);
  const entries = [
    ...(index.waterOn(day).length ? [element("article", t("{0} میلی‌لیتر آب", numbers.format(index.waterTotal(day))), "water")] : []),
    ...index.dosesOn(day).map(dose => renderDose(state.medicines[dose.medicineId], dose)),
    ...index.visitsOn(day).map(local => visitCard(local, index.zone, true)),
    ...index.routinesOn(day).map(entry => renderRoutine(entry, day))
  ];
  $("calendar-activity").replaceChildren(element("h2", formatDay(day, true)),
    ...(entries.length ? entries : [element("p", t("فعالیتی ثبت نشده است."), "empty")]));
}

export function renderReports(last, goal, index, reportSpan, formatShortDate) {
  const first = last - reportSpan + 1;
  const range = Array.from({ length: reportSpan }, (_, i) => index.waterTotal(first + i));
  const average = range.reduce((sum, amount) => sum + amount, 0) / reportSpan;
  const { taken, skipped, unrecorded } = index.doseTotals(first, last);
  $("report-dates").textContent = t("از {0} تا {1}", formatShortDate(first), formatShortDate(last));
  const formattedAverage = numbers.format(Math.round(average));
  $("report-water-number").textContent = formattedAverage;
  $("report-goal-label").textContent = t("هدف روزانهٔ آب، {0} میلی‌لیتر", numbers.format(goal));
  $("report-water-empty").hidden = range.some(amount => amount > 0);
  const doses = taken + skipped + unrecorded;
  const hasDoses = doses > 0;
  const ratio = hasDoses ? taken / doses : 0;
  $("report-dose-number").textContent = percent.format(Math.floor(taken * 1000 / (doses || 1)) / 1000);
  $("report-dose-number").hidden = !hasDoses;
  $("report-dose-progress").value = ratio;
  $("report-dose-progress").hidden = !hasDoses;
  $("report-doses").textContent = hasDoses
    ? t("{0} از {1} نوبت مصرف شد.", numbers.format(taken), numbers.format(doses))
    : t("در این بازه نوبت موعدرسیده یا ثبت‌شده‌ای نیست.");
  $("report-dose-breakdown").hidden = !hasDoses;
  $("report-dose-breakdown").textContent = [
    t("{0} مصرف‌نشده", numbers.format(skipped)),
    t("{0} بدون ثبت", numbers.format(unrecorded))
  ].join(" · ");
  const { completed, activeDays } = index.routineTotals(first, last);
  $("report-routine-number").textContent = numbers.format(completed);
  $("report-routine-number").hidden = !activeDays;
  $("report-routines").textContent = activeDays
    ? t("روتین انجام‌شده در {0} روز دارای ثبت", numbers.format(activeDays))
    : t("در این بازه پیشرفت روتینی ثبت نشده است.");
  const bucketSize = reportSpan === 365 ? 30 : 1;
  const bars = [];
  for (let i = 0; i < range.length; i += bucketSize) {
    const group = range.slice(i, i + bucketSize);
    bars.push(group.reduce((sum, amount) => sum + amount, 0) / group.length);
  }
  const max = Math.max(goal, ...bars);
  const chart = $("report-chart");
  chart.setAttribute("aria-label", t("نمودار مصرف آب؛ {0}", t("میانگین روزانه {0} میلی‌لیتر", formattedAverage)));
  chart.style.setProperty("--goal", `${goal / max * 100}%`);
  chart.replaceChildren(...bars.map((value, i) => {
    const bar = element("div");
    bar.style.setProperty("--bar", `${value / max * 100}%`);
    bar.title = t("{0} · {1} میلی‌لیتر", formatShortDate(first + i * bucketSize), numbers.format(Math.round(value)));
    return bar;
  }));
  $("report-chart-dates").replaceChildren(element("span", formatShortDate(first)), element("span", formatShortDate(last)));
}
