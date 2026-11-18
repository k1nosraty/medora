import {
  locale,
  t,
} from "../../../../web/public/medication/shared/i18n/locale.js";

const number = new Intl.NumberFormat(locale).format;
interface Interval {
  start: number;
  end: number;
  count: number;
  value: number;
}

export function waterChartModel(
  range: number[],
  first: number,
  goal: number,
  groupByMonth: boolean,
  formatShortDate: (day: number) => string,
  formatDay: (day: number) => string,
  monthStart: (day: number) => number,
) {
  const last = first + range.length - 1;
  const intervals: Interval[] = [];
  let start = first;
  while (start <= last) {
    const end = groupByMonth
      ? Math.min(last, monthStart(monthStart(start) + 32) - 1)
      : start;
    const amounts = range.slice(start - first, end - first + 1).filter(Boolean);
    intervals.push({
      start,
      end,
      count: amounts.length,
      value: amounts.length
        ? amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length
        : 0,
    });
    start = end + 1;
  }

  const direction = document.documentElement.dir;
  const dateLabel = (interval: Interval, long = false) => {
    const format = long ? formatDay : formatShortDate;
    const { start, end } = interval;
    return start === end
      ? format(start)
      : t("ui.from-value-to-value", format(start), format(end));
  };
  const max = Math.max(goal, ...intervals.map((interval) => interval.value));
  const bars = intervals.map((interval) => {
    const { start, end, count, value } = interval;
    const volume = count
      ? t("ui.value-ml", number(Math.round(value)))
      : t("ui.not-logged");
    return {
      label: t("ui.value-value", dateLabel(interval, true), volume),
      option: t("ui.value-value", dateLabel(interval), volume),
      date: dateLabel(interval),
      value: volume,
      average:
        end > start && count
          ? t("ui.average-across-value-logged-days", number(count))
          : null,
      size: `${(value / max) * 100}%`,
      days: end - start + 1,
      logged: Boolean(count),
    };
  });
  return {
    key: JSON.stringify([
      goal,
      groupByMonth,
      direction,
      intervals.map((interval) => [
        dateLabel(interval, true),
        interval.value,
        interval.count,
      ]),
    ]),
    direction,
    goal: `${(goal / max) * 100}%`,
    first: formatShortDate(first),
    last: formatShortDate(Math.max(first, last)),
    initial: intervals.length
      ? Math.max(
          0,
          intervals.findLastIndex((interval) => interval.count),
        )
      : -1,
    bars,
  };
}
