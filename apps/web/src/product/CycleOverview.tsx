import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, PlanArtwork } from "./PlanCard";
import { clearFeature, paintFeature } from "./renderer";
import { cycleEstimate } from "../../product-assets/public/medication/domain/cycle.js";
import {
  localDigits,
  t,
  weekIndex,
} from "../../product-assets/public/medication/shared/i18n/locale.js";

interface Entry {
  day: number;
  end?: number | null;
  flow?: keyof typeof flowLabels | "";
  note?: string;
  sharedNote?: string;
  recordedBy?: string;
}
type Records = Record<string, Omit<Entry, "day">>;
type Metric = "interval" | "duration";
type Point = { day: number; value: number };
interface FamilyView {
  canView: (screen: "insights") => boolean;
  authorName: (entry: Entry) => string;
  canRecord(kind: "cycle"): boolean;
}
interface OverviewOptions {
  today: () => number;
  getDates: () => {
    shortDate: (day: number) => string;
    dayNumber: (day: number) => string;
    formatDay: (day: number, full?: boolean) => string;
    year: (day: number) => string;
  };
  getFamilyView: () => FamilyView | null;
  openCalendar: (day: number) => void;
  edit: (day: number, options?: { end: boolean }) => void;
  add(): void;
  logDay(): void;
  remove: (day: number) => void;
}

function $<T extends HTMLElement = HTMLElement>(id: string) {
  return document.getElementById(id)! as T;
}

const weekStart = (day: number) => day - weekIndex(day);
const dayCount = (value: number) =>
  value === 1
    ? t("ui.cycle-one-day")
    : t("ui.cycle-day-count", localDigits(value));
const flowLabels = {
  light: "ui.cycle-flow-light",
  medium: "ui.cycle-flow-medium",
  heavy: "ui.cycle-flow-heavy",
};

export function installCycleOverview(options: OverviewOptions) {
  const host = $("cycle-overview-react");
  return {
    render(records: Records) {
      paintFeature(host, <CycleOverview {...options} records={records} />);
    },
    reset() {
      clearFeature(host);
      $("cycle-calendar").hidden =
        $("cycle-records").hidden =
        $("cycle-trend").hidden =
          true;
    },
  };
}

function CycleOverview({
  today,
  getDates,
  getFamilyView,
  openCalendar,
  edit,
  add,
  logDay,
  remove,
  records,
}: OverviewOptions & { records: Records }) {
  const [selection, setSelection] = useState<number>();
  const [requestedMetric, setMetric] = useState<Metric>("interval");
  const previousWeek = useRef<HTMLButtonElement>(null);
  const nextWeek = useRef<HTMLButtonElement>(null);
  const reactivate = useRef(false);
  const now = today();
  const view = getFamilyView();
  const dates = getDates();
  const entries = Object.entries(records)
    .map(([day, record]) => ({ ...record, day: Number(day) }))
    .sort((a, b) => b.day - a.day);
  const latest = entries[0];
  const first = weekStart(entries.at(-1)?.day ?? now);
  const forecast = cycleEstimate(records);
  const current = forecast && forecast.last >= now ? forecast : null;
  const last = weekStart(
    Math.max(now, latest?.day ?? now, forecast?.last ?? now),
  );
  const week = Math.max(first, Math.min(last, selection ?? weekStart(now)));
  const series: Record<Metric, Point[]> = {
    interval: entries
      .slice(0, -1)
      .map(({ day }, index) => ({ day, value: day - entries[index + 1]!.day })),
    duration: entries.flatMap(({ day, end }) =>
      end == null ? [] : [{ day, value: end - day + 1 }],
    ),
  };
  const metrics = (["interval", "duration"] as const).filter(
    (metric) => series[metric].length >= 2,
  );
  const metric = metrics.includes(requestedMetric)
    ? requestedMetric
    : (metrics[0] ?? "interval");

  function showRecord(day: number) {
    const card = $("cycle-entry-" + day);
    card?.focus({ preventScroll: true });
    card?.scrollIntoView({ block: "center" });
  }

  useLayoutEffect(() => {
    if (!reactivate.current) return;
    reactivate.current = false;
    if (previousWeek.current?.disabled) nextWeek.current?.focus();
    else if (nextWeek.current?.disabled) previousWeek.current?.focus();
  }, [week]);

  function shift(days: number) {
    reactivate.current = true;
    setSelection(week + days);
  }
  const days = Array.from({ length: 7 }, (_, offset): WeekCell => {
    const day = week + offset;
    const entry = entries.find(
      (item) => item.day <= day && day <= (item.end ?? item.day),
    );
    const mark = entry
      ? "recorded"
      : forecast && day >= now && day >= forecast.first && day <= forecast.last
        ? "forecast"
        : "";
    const label = dates.formatDay(day, true);
    return {
      day,
      mark,
      date: dates.dayNumber(day),
      current: day === now,
      label: mark
        ? label +
          " · " +
          t(
            mark === "recorded"
              ? "ui.logged-cycle"
              : "ui.estimated-cycle-start",
          )
        : label,
      choose: entry && (() => showRecord(entry.day)),
    };
  });
  const points = series[metric].slice(0, 6).reverse();
  const scale = Math.max(...points.map((point) => point.value));
  const bars = points.map(({ day, value }) => ({
    key: `cycle-bar-${metric}-${day}`,
    label: dates.formatDay(day) + " · " + dayCount(value),
    amount: dayCount(value),
    date: dates.shortDate(day),
    height: `${(100 * value) / scale}%`,
    choose: () => showRecord(day),
  }));
  const range =
    current &&
    (current.first === current.last
      ? t("ui.estimated-cycle-date", dates.formatDay(current.last))
      : t(
          "ui.estimated-value-to-value",
          dates.year(current.first) === dates.year(current.last)
            ? dates.shortDate(current.first)
            : dates.formatDay(current.first),
          dates.formatDay(current.last),
        ));
  useLayoutEffect(() => {
    const banner = $("cycle-banner");
    banner.classList.add("day-card");
    banner.dataset.cardKind = "cycle";
    banner.dataset.featured = "";
    $("cycle-calendar").hidden = $("cycle-records").hidden = !latest;
    $("cycle-trend").hidden = !metrics.length;
  }, [latest, metrics.length]);
  const missingEnd = latest && latest.end == null;
  const rows = entries.map((entry): HistoryRow => {
    const { day, end, flow, note, sharedNote, recordedBy } = entry;
    const date =
      end == null || end === day
        ? dates.formatDay(day)
        : t(
            "ui.cycle-date-range",
            dates.year(day) === dates.year(end)
              ? dates.shortDate(day)
              : dates.formatDay(day),
            dates.formatDay(end),
          );
    return {
      id: "cycle-entry-" + day,
      date,
      duration:
        end == null ? t("ui.cycle-end-missing") : dayCount(end - day + 1),
      flow: flow && t("ui.cycle-flow-level", t(flowLabels[flow])),
      note: note || sharedNote,
      author:
        view && recordedBy
          ? t("ui.recorded-by-value", view.authorName(entry))
          : undefined,
      actions: view
        ? undefined
        : { edit: () => edit(day), remove: () => remove(day) },
    };
  });
  return (
    <>
      {createPortal(
        <>
          <div className="day-card-art" aria-hidden="true">
            <PlanArtwork id="cycle" />
          </div>
          <div className="day-card-content">
            <small className="day-card-kind">{t("ui.cycle")}</small>
            <h2 id="cycle-banner-title" className="day-card-title">
              {t(current ? "ui.next-cycle-start" : "ui.menstrual-cycle")}
            </h2>
            <div className="day-card-details">
              <p id="cycle-latest">
                {latest &&
                  t("ui.cycle-last-start", dates.formatDay(latest.day))}
              </p>
              <p id="cycle-forecast" aria-live="polite">
                {current ? (
                  <>
                    <strong className="cycle-estimate-range">{range}</strong>
                    <span className="cycle-estimate-context">
                      {t(
                        "ui.cycle-estimate-samples",
                        localDigits(current.samples),
                      )}
                    </span>
                    {current.uncertain && (
                      <span className="cycle-estimate-context">
                        {t("ui.cycle-estimate-uncertain")}
                      </span>
                    )}
                  </>
                ) : (
                  t(
                    !latest
                      ? "ui.no-cycles-logged-yet"
                      : !forecast
                        ? "ui.an-estimate-appears-after-you-log-three-start-dates"
                        : "ui.log-a-new-start-date-to-update-the-estimate",
                  )
                )}
              </p>
              <p id="cycle-end-status" hidden={!missingEnd}>
                {t("ui.cycle-end-missing")}
              </p>
            </div>
          </div>
          <div className="day-card-actions">
            <button
              id="cycle-add"
              className="primary-action"
              type="button"
              hidden={view?.canRecord("cycle") === false}
              onClick={(event) => {
                event.stopPropagation();
                add();
              }}
            >
              {t(latest ? "ui.log-period-start" : "ui.cycle-first-start")}
            </button>
            <button
              id="cycle-log-end"
              className="secondary"
              type="button"
              hidden={!missingEnd || Boolean(view)}
              onClick={() => {
                if (!view && latest) edit(latest.day, { end: true });
              }}
            >
              {t("ui.cycle-log-end")}
            </button>
            <button
              id="cycle-log-symptoms"
              className="secondary"
              type="button"
              data-cycle-log=""
              hidden={Boolean(view)}
              onClick={logDay}
            >
              {t("ui.cycle-day-log")}
            </button>
          </div>
        </>,
        $("cycle-banner"),
      )}
      {createPortal(
        <>
          <div className="cycle-panel-heading">
            <h2 id="cycle-calendar-title">{t("ui.calendar")}</h2>
            <button
              id="cycle-full-calendar"
              className="text-button"
              type="button"
              hidden={view?.canView("insights") === false}
              onClick={() => openCalendar(weekStart(now) === week ? now : week)}
            >
              {t("ui.cycle-full-calendar")}
            </button>
          </div>
          <div className="cycle-week-heading">
            <button
              id="cycle-previous-week"
              data-date-arrow="previous"
              className="icon-button"
              type="button"
              aria-label={t("ui.cycle-previous-week")}
              ref={previousWeek}
              disabled={week === first}
              onClick={() => shift(-7)}
            >
              <Icon name="expand" />
            </button>
            <p id="cycle-week-label" aria-live="polite">
              {latest &&
                t(
                  "ui.cycle-date-range",
                  dates.shortDate(week),
                  dates.shortDate(week + 6),
                )}
            </p>
            <button
              id="cycle-next-week"
              data-date-arrow="next"
              className="icon-button"
              type="button"
              aria-label={t("ui.cycle-next-week")}
              ref={nextWeek}
              disabled={week === last}
              onClick={() => shift(7)}
            >
              <Icon name="expand" />
            </button>
          </div>
          <div id="cycle-days" className="cycle-days">
            {latest && <CycleWeek days={days} />}
          </div>
          <ul className="cycle-calendar-key">
            <li>
              <span data-cycle-mark="recorded" aria-hidden="true" />
              {t("ui.logged-cycle")}
            </li>
            <li>
              <span data-cycle-mark="forecast" aria-hidden="true" />
              {t("ui.estimated-cycle-start")}
            </li>
          </ul>
        </>,
        $("cycle-calendar"),
      )}
      {createPortal(
        <>
          <h2 id="cycle-trend-title">{t("ui.cycle-recent-trend")}</h2>
          <div
            className="cycle-metrics"
            role="group"
            aria-labelledby="cycle-trend-title"
          >
            <button
              type="button"
              className="secondary"
              data-cycle-metric="interval"
              aria-pressed={metric === "interval"}
              hidden={!metrics.includes("interval")}
              onClick={() => setMetric("interval")}
            >
              {t("ui.cycle-start-interval")}
            </button>
            <button
              type="button"
              className="secondary"
              data-cycle-metric="duration"
              aria-pressed={metric === "duration"}
              hidden={!metrics.includes("duration")}
              onClick={() => setMetric("duration")}
            >
              {t("ui.cycle-period-duration")}
            </button>
          </div>
          <ol id="cycle-bars" className="cycle-bars" aria-live="polite">
            {metrics.length > 0 && <CycleTrend bars={bars} />}
          </ol>
        </>,
        $("cycle-trend"),
      )}
      {createPortal(
        <>
          <h2 id="cycle-history-title" tabIndex={-1}>
            {t("ui.cycle-history")}
          </h2>
          <div id="cycle-history">
            <CycleHistory rows={rows} />
          </div>
        </>,
        $("cycle-records"),
      )}
    </>
  );
}

interface WeekCell {
  day: number;
  mark: string;
  date: string;
  current: boolean;
  label: string;
  choose: (() => void) | undefined;
}

function CycleWeek({ days }: { days: WeekCell[] }) {
  return days.map(({ day, mark, date, current, label, choose }) => {
    const attributes = {
      "data-focus-key": "cycle-day-" + day,
      "data-cycle-mark": mark || undefined,
      "aria-current": current ? ("date" as const) : undefined,
      "aria-label": label,
    };
    return choose ? (
      <button
        key={day}
        {...attributes}
        type="button"
        className="secondary"
        onClick={choose}
      >
        {date}
      </button>
    ) : (
      <span key={day} {...attributes} role="img">
        {date}
      </span>
    );
  });
}

interface TrendBar {
  key: string;
  label: string;
  amount: string;
  date: string;
  height: string;
  choose: () => void;
}

function CycleTrend({ bars }: { bars: TrendBar[] }) {
  return bars.map(({ key, label, amount, date, height, choose }) => (
    <li key={key}>
      <button
        type="button"
        className="secondary"
        data-focus-key={key}
        aria-label={label}
        onClick={choose}
      >
        <strong>{amount}</strong>
        <span className="cycle-bar-track">
          <span className="cycle-bar" style={{ blockSize: height }} />
        </span>
        <small>{date}</small>
      </button>
    </li>
  ));
}

interface HistoryRow {
  id: string;
  date: string;
  duration: string;
  flow: string | undefined;
  note: string | undefined;
  author: string | undefined;
  actions: { edit: () => void; remove: () => void } | undefined;
}

function CycleHistory({ rows }: { rows: HistoryRow[] }) {
  return rows.map(({ id, date, duration, flow, note, author, actions }) => (
    <article
      key={id}
      id={id}
      className="cycle-record"
      tabIndex={-1}
      data-focus-scope={id}
    >
      <div className="cycle-record-heading">
        <h3>{date}</h3>
        {actions && (
          <details
            className="day-card-more"
            name="day-card-options"
            onKeyDown={(event) => {
              if (event.key !== "Escape" || !event.currentTarget.open) return;
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.open = false;
              event.currentTarget.querySelector("summary")?.focus();
            }}
          >
            <summary aria-label={t("ui.cycle-record-options")}>⋯</summary>
            <div
              className="day-card-menu"
              onClick={(event) => {
                if (!(event.target instanceof HTMLButtonElement)) return;
                const menu = event.currentTarget;
                const details = menu.closest("details");
                if (menu.contains(document.activeElement))
                  details
                    ?.querySelector("summary")
                    ?.focus({ preventScroll: true });
                if (details) details.open = false;
              }}
            >
              <button
                type="button"
                className="secondary"
                onClick={actions.edit}
              >
                {t("ui.edit")}
              </button>
              <button
                type="button"
                className="secondary danger-link"
                onClick={actions.remove}
              >
                {t("ui.delete")}
              </button>
            </div>
          </details>
        )}
      </div>
      <div className="cycle-record-facts">
        <span>{duration}</span>
        {flow && <span>{flow}</span>}
      </div>
      {note && (
        <details className="cycle-record-note">
          <summary>
            <span>{t("ui.cycle-note-details")}</span>
            <span className="cycle-note-preview" dir="auto">
              {note}
            </span>
          </summary>
          <p dir="auto">{note}</p>
        </details>
      )}
      {author && <small className="family-stamp">{author}</small>}
    </article>
  ));
}
