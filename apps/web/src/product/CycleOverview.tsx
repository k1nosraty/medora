import { clearFeature, paintFeature } from "./renderer";
import { element } from "../../../../web/public/medication/shared/ui/dom.js";
import { cycleEstimate } from "../../../../web/public/medication/domain/cycle.js";
import {
  localDigits,
  t,
  weekIndex,
} from "../../../../web/public/medication/shared/i18n/locale.js";

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

export function installCycleOverview({
  today,
  getDates,
  getFamilyView,
  openCalendar,
  edit,
  remove,
}: OverviewOptions) {
  const previousWeek = $<HTMLButtonElement>("cycle-previous-week");
  const nextWeek = $<HTMLButtonElement>("cycle-next-week");
  const metrics = [
    ...document.querySelectorAll<HTMLButtonElement>("[data-cycle-metric]"),
  ].map((control) => ({
    control,
    metric: control.dataset.cycleMetric as Metric,
  }));
  let week: number | undefined;
  let historyPaint = 0;
  let metric: Metric = "interval";
  let entries: Entry[] = [];
  let forecast: ReturnType<typeof cycleEstimate> | undefined;
  let series: Record<Metric, Point[]> = { interval: [], duration: [] };

  function showRecord(day: number) {
    const card = $("cycle-entry-" + day);
    card?.focus({ preventScroll: true });
    card?.scrollIntoView({ block: "center" });
  }

  function paintWeek() {
    const now = today();
    const { shortDate, formatDay, dayNumber } = getDates();
    const earliest = entries.at(-1);
    const latest = entries[0];
    if (!earliest || !latest) return;
    const first = weekStart(earliest.day);
    const last = weekStart(Math.max(now, latest.day, forecast?.last ?? now));
    week = Math.max(first, Math.min(last, week ?? weekStart(now)));
    previousWeek.disabled = week === first;
    nextWeek.disabled = week === last;
    $("cycle-week-label").textContent = t(
      "ui.cycle-date-range",
      shortDate(week),
      shortDate(week + 6),
    );
    const days = Array.from({ length: 7 }, (_, offset): WeekCell => {
      const day = week! + offset;
      const entry = entries.find(
        (item) => item.day <= day && day <= (item.end ?? item.day),
      );
      const mark = entry
        ? "recorded"
        : forecast &&
            day >= now &&
            day >= forecast.first &&
            day <= forecast.last
          ? "forecast"
          : "";
      const state =
        mark === "recorded"
          ? "ui.logged-cycle"
          : mark === "forecast"
            ? "ui.estimated-cycle-start"
            : null;
      return {
        day,
        mark,
        date: dayNumber(day),
        current: day === now,
        label: state
          ? `${formatDay(day, true)} · ${t(state)}`
          : formatDay(day, true),
        choose: entry && (() => showRecord(entry.day)),
      };
    });
    const host = $("cycle-days");
    paintFeature(host, <CycleWeek days={days} />);
    const view = getFamilyView();
    $("cycle-full-calendar").hidden = Boolean(
      view && !view.canView("insights"),
    );
  }

  function paintTrend() {
    const visible = metrics.filter(({ metric }) => series[metric].length >= 2);
    $("cycle-trend").hidden = visible.length === 0;
    if (!visible.length) {
      clearFeature($("cycle-bars"));
      return;
    }
    if (!visible.some((item) => item.metric === metric))
      metric = visible[0]!.metric;
    for (const item of metrics) {
      item.control.hidden = !visible.includes(item);
      item.control.setAttribute("aria-pressed", String(item.metric === metric));
    }
    const points = series[metric].slice(0, 6).reverse();
    const scale = Math.max(...points.map((point) => point.value));
    const { shortDate, formatDay } = getDates();
    const bars = points.map(({ day, value }) => ({
      key: `cycle-bar-${metric}-${day}`,
      label: formatDay(day) + " · " + dayCount(value),
      amount: dayCount(value),
      date: shortDate(day),
      height: `${(100 * value) / scale}%`,
      choose: () => showRecord(day),
    }));
    const host = $("cycle-bars");
    paintFeature(host, <CycleTrend bars={bars} />);
  }

  function historyRow(entry: Entry, view: FamilyView | null): HistoryRow {
    const { day, end, flow, note, sharedNote, recordedBy } = entry;
    const { formatDay, shortDate, year } = getDates();
    const date =
      end == null || end === day
        ? formatDay(day)
        : t(
            "ui.cycle-date-range",
            year(day) === year(end) ? shortDate(day) : formatDay(day),
            formatDay(end),
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
  }

  function render(records: Records) {
    const now = today();
    const view = getFamilyView();
    entries = Object.entries(records)
      .map(([day, record]) => ({ ...record, day: Number(day) }))
      .sort((a, b) => b.day - a.day);
    forecast = cycleEstimate(records);
    const latest = entries[0];
    const hasEstimate = Boolean(forecast && forecast.last >= now);
    $("cycle-banner-title").textContent = t(
      hasEstimate ? "ui.next-cycle-start" : "ui.menstrual-cycle",
    );
    $("cycle-add").textContent = t(
      latest ? "ui.log-period-start" : "ui.cycle-first-start",
    );
    const dates = getDates();
    $("cycle-latest").textContent = latest
      ? t("ui.cycle-last-start", dates.formatDay(latest.day))
      : "";
    const estimate = $("cycle-forecast");
    if (forecast && hasEstimate) {
      const first =
        dates.year(forecast.first) === dates.year(forecast.last)
          ? dates.shortDate(forecast.first)
          : dates.formatDay(forecast.first);
      const last = dates.formatDay(forecast.last);
      const range =
        forecast.first === forecast.last
          ? t("ui.estimated-cycle-date", last)
          : t("ui.estimated-value-to-value", first, last);
      estimate.replaceChildren(
        element("strong", range, "cycle-estimate-range"),
        element(
          "span",
          t("ui.cycle-estimate-samples", localDigits(forecast.samples)),
          "cycle-estimate-context",
        ),
      );
      if (forecast.uncertain)
        estimate.append(
          element(
            "span",
            t("ui.cycle-estimate-uncertain"),
            "cycle-estimate-context",
          ),
        );
    } else {
      estimate.textContent = t(
        !latest
          ? "ui.no-cycles-logged-yet"
          : !forecast
            ? "ui.an-estimate-appears-after-you-log-three-start-dates"
            : "ui.log-a-new-start-date-to-update-the-estimate",
      );
    }
    const missingEnd = latest?.end == null && Boolean(latest);
    $("cycle-end-status").hidden = !missingEnd;
    $("cycle-log-end").hidden = !missingEnd || Boolean(view);
    $("cycle-log-symptoms").hidden = Boolean(view);
    $("cycle-calendar").hidden = $("cycle-records").hidden = !latest;
    const history = $("cycle-history");
    const rows = entries.map((entry) => historyRow(entry, view));
    paintFeature(history, <CycleHistory key={++historyPaint} rows={rows} />);
    series = {
      interval: entries
        .slice(0, -1)
        .map(({ day }, i) => ({ day, value: day - entries[i + 1]!.day })),
      duration: entries
        .filter(({ end }) => end != null)
        .map(({ day, end }) => ({ day, value: end! - day + 1 })),
    };
    if (latest) paintWeek();
    paintTrend();
  }

  for (const [control, step] of [
    [previousWeek, -7],
    [nextWeek, 7],
  ] as const) {
    control.addEventListener("click", () => {
      if (week === undefined) return;
      week += step;
      paintWeek();
      if (control.disabled)
        (control === previousWeek ? nextWeek : previousWeek).focus();
    });
  }
  for (const item of metrics)
    item.control.addEventListener("click", () => {
      metric = item.metric;
      paintTrend();
    });
  $("cycle-full-calendar").addEventListener("click", () => {
    const now = today();
    if (week !== undefined) openCalendar(weekStart(now) === week ? now : week);
  });
  $("cycle-log-end").addEventListener("click", () => {
    if (!getFamilyView() && entries[0]) edit(entries[0].day, { end: true });
  });

  return {
    render,
    reset() {
      week = undefined;
      metric = "interval";
      entries = [];
      forecast = undefined;
      series = { interval: [], duration: [] };
      for (const id of ["cycle-latest", "cycle-forecast", "cycle-week-label"])
        $(id).replaceChildren();
      for (const id of ["cycle-days", "cycle-bars", "cycle-history"])
        clearFeature($(id));
      for (const id of [
        "cycle-calendar",
        "cycle-end-status",
        "cycle-log-end",
        "cycle-records",
        "cycle-trend",
      ])
        $(id).hidden = true;
    },
  };
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
