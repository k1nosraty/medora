import { listSeparator, locale } from "../i18n/locale.js";
import { dayMs } from "../../domain/wall-clock.js";

export function calendarFormat(calendar) {
  const format = options => new Intl.DateTimeFormat(locale + "-u-ca-" + calendar, { ...options, timeZone: "UTC" });
  const weekday = format({ weekday: "long" });
  const shortDate = format({ day: "numeric", month: "short" });
  const shortMonth = format({ month: "short" });
  const month = format({ month: "long", year: "numeric" });
  const dayNumber = format({ day: "numeric" });
  const fullDate = format({ dateStyle: "long" });
  const dayIndex = new Intl.DateTimeFormat("en-u-ca-" + calendar + "-nu-latn", { day: "numeric", timeZone: "UTC" });
  const year = format({ year: "numeric" });

  function formatDay(day, includeWeekday = false) {
    const date = day * dayMs;
    let label = fullDate.format(date);
    if (locale !== "en-US") {
      const parts = month.formatToParts(date);
      label = [dayNumber.format(date), parts.find(part => part.type === "month").value,
        parts.find(part => part.type === "year").value].join(" ");
    }
    return includeWeekday ? weekday.format(date) + listSeparator + label : label;
  }

  function monthStart(day) {
    return day - Number(dayIndex.formatToParts(day * dayMs).find(part => part.type === "day").value) + 1;
  }

  return {
    formatDay,
    monthStart,
    month: day => month.format(day * dayMs),
    dayNumber: day => dayNumber.format(day * dayMs),
    weekday: day => weekday.format(day * dayMs),
    shortDate: day => shortDate.format(day * dayMs),
    shortMonth: day => shortMonth.format(day * dayMs),
    year: day => year.format(day * dayMs)
  };
}
