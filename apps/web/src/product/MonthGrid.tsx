import {
  keepMonthFocus,
  monthLayout,
} from "../../../../web/public/medication/shared/ui/month-layout.js";
import { renderMonthGrid as firstPaint } from "../../../../web/public/medication/shared/ui/month-grid.js";
import { clearFeature, paintFeature } from "./lazy-renderer";

type MonthOptions = Parameters<typeof monthLayout>[0];

function MonthGrid({
  weekdays,
  leading,
  trailing,
  days,
}: ReturnType<typeof monthLayout>) {
  return (
    <>
      {weekdays.map((label) => (
        <span key={label} className="quiet">
          {label}
        </span>
      ))}
      {Array.from({ length: leading }, (_, index) => (
        <span key={"start-" + index} />
      ))}
      {days.map((day) => (
        <button
          key={day.day}
          type="button"
          className="secondary"
          aria-label={day.label}
          aria-pressed={day.selected}
          aria-current={day.today ? "date" : undefined}
          data-focus-key={`month-day-${day.day}`}
          data-cycle-status={day.details?.cycle}
          tabIndex={day.tabIndex}
          disabled={day.disabled}
          onClick={day.choose}
          onKeyDown={day.move}
        >
          {day.number}
          {day.details && (
            <span className="calendar-dots" aria-hidden="true">
              {day.details.dots.map((kind: string) => (
                <i key={kind} className={kind} />
              ))}
            </span>
          )}
        </button>
      ))}
      {Array.from({ length: trailing }, (_, index) => (
        <span key={"end-" + index} />
      ))}
    </>
  );
}
export function renderMonthGrid(root: HTMLElement, options: MonthOptions) {
  keepMonthFocus(root, () =>
    paintFeature(root, <MonthGrid {...monthLayout(options)} />, () =>
      firstPaint(root, options),
    ),
  );
}
export const clearMonthGrid = clearFeature;
