export interface WeekDay {
  value: number;
  number: string;
  weekday: string;
  label: string;
  selected: boolean;
  today: boolean;
}
export function DayWeek({
  days,
  choose,
}: {
  days: WeekDay[];
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
