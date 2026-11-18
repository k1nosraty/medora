import { renderWeek as initialPaint } from "../../../../web/public/medication/app/week-strip.js";
import { paintFeature } from "./lazy-renderer";

interface Day {
  value: number;
  number: string;
  weekday: string;
  label: string;
  selected: boolean;
  today: boolean;
}
function DayWeek({
  days,
  choose,
}: {
  days: Day[];
  choose: (day: number) => void;
}) {
  return days.map((day) => (
    <button
      type="button"
      key={day.value}
      className="secondary"
      data-focus-key={`day-${day.value}`}
      aria-label={day.label}
      aria-pressed={day.selected}
      aria-current={day.today ? "date" : undefined}
      onClick={() => choose(day.value)}
    >
      {day.number} <span>{day.weekday}</span>
    </button>
  ));
}
export function renderWeek(
  host: HTMLElement,
  days: Day[],
  choose: (day: number) => void,
) {
  paintFeature(host, <DayWeek days={days} choose={choose} />, () =>
    initialPaint(host, days, choose),
  );
}
