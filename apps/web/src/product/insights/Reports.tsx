import { useLayoutEffect } from "react";
import {
  locale,
  t,
} from "../../../product-assets/public/medication/shared/i18n/locale.js";
import { cycleIsEnabled } from "../../../product-assets/public/medication/domain/profile.js";
import { cycleTotals } from "../../../product-assets/public/medication/domain/cycle.js";
import {
  sleepIsEnabled,
  sleepReport,
} from "../../../product-assets/public/medication/domain/sleep.js";
import { sleepDuration } from "../../../product-assets/public/medication/features/sleep/presentation.js";
import type { calendarFormat } from "../../../product-assets/public/medication/shared/ui/calendar-format.js";
import type { createCareIndex } from "../../../product-assets/public/medication/domain/care-index.js";
import { Icon, PlanArtwork } from "../PlanCard";
import { renderWaterChart, clearWaterChart } from "../WaterChart";
import type { CareState, FamilyView } from "../product";

export type Period = "week" | "month" | "year";
type StatsRow = [label: string, value: string, tone?: "done" | "partial"];
const numbers = new Intl.NumberFormat(locale);
const percent = new Intl.NumberFormat(locale, {
  style: "percent",
  maximumFractionDigits: 1,
});
const number = (value: number) => numbers.format(value);
const ratioText = (value: number) =>
  percent.format(Math.floor(value * 1000) / 1000);

export function Stats({
  id,
  rows,
  hidden = false,
}: {
  id: string;
  rows: StatsRow[];
  hidden?: boolean;
}) {
  return (
    <dl id={id} className="report-stats" hidden={hidden}>
      {rows.map(([label, value, tone]) => (
        <div key={label} data-tone={tone}>
          <dt>{t(label)}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
function OpenReport({ id, destination }: { id: string; destination: string }) {
  return (
    <button
      type="button"
      className="report-card-open"
      data-destination={destination}
      aria-labelledby={`report-${id}-open-label report-${id}-title`}
    >
      <span id={`report-${id}-open-label`} className="report-open-label">
        {t("ui.open-details")} <Icon name="back" />
      </span>
    </button>
  );
}
function ReportValue({
  id,
  value,
  caption,
  art,
  title,
  destination,
  rows,
  hidden,
  className,
  progress,
  progressLabel,
}: {
  id: string;
  value: string;
  caption: string;
  art: string;
  title: string;
  destination: string;
  rows: StatsRow[];
  hidden: boolean;
  className: string;
  progress?: number;
  progressLabel?: string;
}) {
  return (
    <section
      className={className}
      hidden={hidden}
      aria-labelledby={`report-${id}-title`}
    >
      <div className="report-hero">
        <PlanArtwork id={art} className="report-art category-art" />
        <h2 id={`report-${id}-title`}>{title}</h2>
        <div
          id={`report-${id}-value`}
          className="report-number"
          hidden={!rows.length}
        >
          <strong id={`report-${id}-number`}>{value}</strong>
        </div>
        <p
          id={
            id === "dose"
              ? "report-doses"
              : id === "routine"
                ? "report-routines"
                : "report-visits"
          }
          className="report-caption"
        >
          {caption}
        </p>
      </div>
      {progress !== undefined && (
        <progress
          id={`report-${id}-progress`}
          className="report-progress"
          max={1}
          value={progress}
          aria-label={progressLabel}
          hidden={!rows.length}
        />
      )}
      <Stats id={`report-${id}-breakdown`} rows={rows} hidden={!rows.length} />
      <OpenReport id={id} destination={destination} />
    </section>
  );
}
interface ReportProps {
  first: number;
  last: number;
  period: Period;
  change(period: Period): void;
  dates: ReturnType<typeof calendarFormat>;
  state: CareState;
  view: FamilyView | null;
  index: ReturnType<typeof createCareIndex>;
}
export function Reports({
  first,
  last,
  period,
  change,
  dates,
  state,
  view,
  index,
}: ReportProps) {
  const goal = state.waterGoal ?? 2000;
  const range = Array.from({ length: last - first + 1 }, (_, i) =>
    index.waterTotal(first + i),
  );
  const waterDays = range.filter(Boolean).length;
  const total = range.reduce((sum, item) => sum + item, 0);
  const dose = index.doseTotals(first, last);
  const doses = dose.taken + dose.skipped + dose.unrecorded;
  const doseRatio = doses ? dose.taken / doses : 0;
  const routine = index.routineTotals(first, last);
  const routines = routine.completed + routine.partial + routine.unrecorded;
  const routineRatio = routines ? routine.completed / routines : 0;
  const visits = index.visitTotals(first, last);
  const hasVisits = Object.values(visits).some(Boolean);
  const sleep = sleepIsEnabled(state);
  const nights = sleep ? sleepReport(state.sleepRecords, first, last) : null;
  const cycle = cycleIsEnabled(state);
  const cycles = cycle
    ? cycleTotals(state.cycleRecords, first, last, state.cycleDays)
    : null;
  const has = (scope: string) => view?.has(scope) !== false;

  // The chart is a separate React root in the static host. Invoke it after
  // the enclosing render commits instead of nesting two synchronous commits.
  useLayoutEffect(() => {
    if (!waterDays || !has("water")) return;
    let active = true;
    queueMicrotask(() => {
      if (active)
        renderWaterChart(
          range,
          first,
          goal,
          period === "year",
          dates.shortDate,
          dates.formatDay,
          dates.monthStart,
        );
    });
    return () => {
      active = false;
    };
  });

  const labels: [Period, string][] = [
    ["week", "ui.week"],
    ["month", "ui.month"],
    ["year", "ui.year"],
  ];
  return (
    <>
      <div className="report-period glass-toolbar">
        <div
          id="report-range"
          className="segmented"
          role="group"
          aria-label={t("ui.report-period")}
        >
          {labels.map(([key, label]) => (
            <button
              type="button"
              key={key}
              data-report-range={key}
              aria-pressed={period === key}
              onClick={() => change(key)}
            >
              {t(label)}
            </button>
          ))}
        </div>
        <p id="report-dates" className="quiet">
          {t(
            "ui.from-value-to-value",
            dates.formatDay(first),
            dates.formatDay(last),
          )}
        </p>
      </div>
      <div className="report-cards">
        <section
          className="feature water report-card program-water"
          aria-labelledby="report-water-title"
          hidden={!has("water")}
        >
          <div className="report-hero">
            <PlanArtwork id="water" className="report-art" />
            <h2 id="report-water-title">{t("ui.water-intake")}</h2>
            <div
              id="report-water-value"
              className="report-number"
              hidden={!waterDays}
            >
              <strong id="report-water-number">
                {waterDays ? number(Math.round(total / waterDays)) : ""}
              </strong>{" "}
              <span>{t("ui.ml")}</span>
            </div>
            <p
              id="report-average"
              className="report-caption"
              hidden={!waterDays}
            >
              {t("ui.average-on-days-with-entries")}
            </p>
            <p
              id="report-water-empty"
              className="report-empty"
              hidden={waterDays > 0}
            >
              {t("ui.no-water-logged-in-this-period")}
            </p>
          </div>
          <button
            type="button"
            className="text-button report-water-link"
            data-destination="water"
          >
            {t("ui.water-history")} <Icon name="back" />
          </button>
          <div
            id="report-water-trend"
            className="report-trend"
            hidden={!waterDays}
          >
            <p className="report-goal">
              <span aria-hidden="true" />
              <span id="report-goal-label">
                {t("ui.current-daily-goal-value-ml", number(goal))}
              </span>
            </p>
            <div
              id="report-chart"
              className="report-chart"
              role="group"
              aria-label={t("ui.water-intake-chart")}
            />
            <div id="report-chart-dates" className="quiet" />
            <div className="report-chart-controls">
              <button
                type="button"
                id="report-chart-previous"
                className="secondary icon-button"
                aria-label={t("ui.previous-chart-period")}
              >
                <Icon name="back" />
              </button>
              <div className="report-chart-date-picker">
                <p
                  id="report-chart-selection"
                  className="quiet"
                  aria-live="polite"
                />
                <select
                  id="report-chart-pick"
                  aria-label={t("ui.select-chart-date")}
                />
              </div>
              <button
                type="button"
                id="report-chart-next"
                className="secondary icon-button reverse"
                aria-label={t("ui.next-chart-period")}
              >
                <Icon name="back" />
              </button>
            </div>
          </div>
          <details
            id="report-water-details"
            className="report-water-details"
            hidden={!waterDays}
          >
            <summary>
              {t("ui.water-intake-details")}
              <Icon name="expand" />
            </summary>
            <Stats
              id="report-water-coverage"
              rows={
                waterDays
                  ? [
                      ["کل آب (میلی‌لیتر)", number(total)],
                      [
                        "روزهای دارای ثبت",
                        t(
                          "ui.value-of-value",
                          number(waterDays),
                          number(range.length),
                        ),
                      ],
                      [
                        "روزهای رسیدن به هدف",
                        number(range.filter((amount) => amount >= goal).length),
                        "done",
                      ],
                    ]
                  : []
              }
            />
          </details>
        </section>
        <ReportValue
          id="dose"
          value={ratioText(doseRatio)}
          title={t("ui.medication-intake")}
          art="bottle"
          caption={
            doses
              ? t(
                  "ui.value-of-value-doses-taken",
                  number(dose.taken),
                  number(doses),
                )
              : t("ui.no-doses-are-due-or-logged-in-this-period")
          }
          destination="medications"
          hidden={!has("doses")}
          className="feature medicine report-card program-medicine"
          rows={
            doses
              ? [
                  ["مصرف‌شده", number(dose.taken), "done"],
                  ["مصرف‌نشده", number(dose.skipped), "partial"],
                  ["بدون ثبت", number(dose.unrecorded)],
                ]
              : []
          }
          progress={doseRatio}
          progressLabel={t("ui.share-of-due-or-logged-doses-taken")}
        />
        <ReportValue
          id="routine"
          value={ratioText(routineRatio)}
          title={t("ui.routines")}
          art="routine-main"
          caption={
            routines
              ? t(
                  "ui.value-of-value-routine-occurrences-completed",
                  number(routine.completed),
                  number(routines),
                )
              : t("ui.no-routines-are-due-or-logged-in-this-period")
          }
          destination="routines"
          hidden={!has("routines")}
          className="feature program-routine report-card"
          rows={
            routines
              ? [
                  ["انجام‌شده", number(routine.completed), "done"],
                  ["نیمه‌تمام", number(routine.partial), "partial"],
                  ["بدون ثبت", number(routine.unrecorded)],
                ]
              : []
          }
          progress={routineRatio}
          progressLabel={t("ui.share-of-routines-completed")}
        />
        <ReportValue
          id="visit"
          value={number(visits.attended)}
          title={t("ui.visits")}
          art="visit-main"
          caption={t(
            hasVisits ? "قرار با حضور ثبت‌شده" : "در این بازه قراری ندارید.",
          )}
          destination="appointments"
          hidden={!has("visits")}
          className="feature visit report-card program-visit"
          rows={
            hasVisits
              ? [
                  ["بدون ثبت حضور", number(visits.unrecorded)],
                  ["پیش رو", number(visits.upcoming)],
                  ["لغوشده", number(visits.cancelled), "partial"],
                ]
              : []
          }
        />
        <section
          id="report-sleep-card"
          className="feature report-card program-sleep"
          aria-labelledby="report-sleep-title"
          hidden={!sleep}
        >
          <div className="report-hero">
            <img
              className="glass-object report-art"
              src="/medication/assets/illustrations/sleep.webp"
              width={256}
              height={256}
              alt=""
            />
            <h2 id="report-sleep-title">{t("ui.sleep")}</h2>
            <p id="report-sleep-value" className="report-empty">
              {nights
                ? nights.average === null
                  ? t("ui.sleep-empty")
                  : t(
                      "ui.sleep-average",
                      sleepDuration(nights.average),
                      number(nights.nights.size),
                    )
                : ""}
            </p>
          </div>
          <OpenReport id="sleep" destination="sleep" />
        </section>
        <section
          id="report-cycle-card"
          className="feature report-card program-cycle"
          aria-labelledby="report-cycle-title"
          hidden={!cycle}
        >
          <div className="report-hero">
            <PlanArtwork id="cycle" className="report-art" />
            <h2 id="report-cycle-title">{t("ui.menstrual-cycle")}</h2>
            <p
              id="report-cycle-empty"
              className="report-empty"
              hidden={Boolean(cycles?.days)}
            >
              {t("ui.no-cycle-records-in-this-period")}
            </p>
          </div>
          <Stats
            id="report-cycle-breakdown"
            hidden={!cycles?.days}
            rows={
              cycles?.days
                ? [
                    ["شروع‌های ثبت‌شده", number(cycles.starts)],
                    ["روزهای ثبت‌شدهٔ پریود", number(cycles.days)],
                    ...(cycles.latestStart === null
                      ? []
                      : [
                          [
                            "آخرین شروع در این بازه",
                            dates.formatDay(cycles.latestStart),
                          ] as StatsRow,
                        ]),
                  ]
                : []
            }
          />
          <OpenReport id="cycle" destination="cycle" />
        </section>
      </div>
    </>
  );
}
export { clearWaterChart };
