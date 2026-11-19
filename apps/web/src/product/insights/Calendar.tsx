import {
  listSeparator,
  locale,
  t,
} from "../../../product-assets/public/medication/shared/i18n/locale.js";
import { cycleIsEnabled } from "@medora/domain/browser/profile";
import { cycleForecast } from "@medora/domain/browser/cycle";
import {
  sleepDay,
  sleepIsEnabled,
  sleepMinutes,
} from "@medora/domain/browser/sleep";
import { sleepDuration } from "../../../product-assets/public/medication/features/sleep/presentation.js";
import { clockMinute } from "@medora/domain/browser/care-plan";
import { renderMonthGrid } from "../MonthGrid";
import { Icon, PlanArtwork, PlanDayCard, PlanOptions } from "../PlanCard";
import { disposeCards, mountCard } from "../renderer";
import { describeCycleDay } from "../cycleLabels";
import type { CalendarInput } from "./Insights";
import type { CareState } from "../productState";

export function CalendarShell({
  shift,
  reset,
  hidden,
}: {
  shift(delta: number): void;
  reset(): void;
  hidden: boolean;
}) {
  const keys = [
    ["medications", "medicine", "ui.medicine"],
    ["water", "water", "ui.water"],
    ["appointments", "visit", "ui.appointment"],
    ["routines", "routine", "ui.routine"],
  ];
  return (
    <div id="calendar-panel" hidden={hidden}>
      <section
        className="feature calendar-card"
        aria-labelledby="calendar-month"
      >
        <div className="feature-head calendar-head">
          <button
            type="button"
            id="previous-month"
            data-date-arrow="previous"
            className="icon-button"
            aria-label={t("ui.previous-month")}
            onClick={() => shift(-1)}
          >
            <Icon name="expand" />
          </button>
          <div className="date-caption">
            <h2 id="calendar-month" aria-live="polite" />
            <button
              type="button"
              className="secondary date-reset"
              id="calendar-today"
              aria-label={t("ui.today-return-label")}
              hidden
              onClick={reset}
            >
              {t("ui.today")}
            </button>
          </div>
          <button
            type="button"
            id="next-month"
            data-date-arrow="next"
            className="icon-button reverse"
            aria-label={t("ui.next-month")}
            onClick={() => shift(32)}
          >
            <Icon name="expand" />
          </button>
        </div>
        <div
          id="calendar-days"
          className="calendar-grid"
          role="group"
          aria-labelledby="calendar-month"
        />
        <ul className="calendar-key" aria-label={t("ui.calendar-key")}>
          {keys.map(([scope, kind, label]) => (
            <li key={kind} data-family-scope={scope}>
              <span className="calendar-dots" aria-hidden="true">
                <i className={kind} />
              </span>
              {t(label)}
            </li>
          ))}
          <li id="calendar-sleep-key" hidden>
            <span className="calendar-dots" aria-hidden="true">
              <i className="sleep" />
            </span>
            {t("ui.sleep")}
          </li>
          <li id="calendar-cycle-key" hidden>
            <span className="calendar-cycle-dot" aria-hidden="true" />
            {t("ui.cycle")}
          </li>
        </ul>
      </section>
      <section id="calendar-activity" aria-labelledby="calendar-date">
        <header className="calendar-agenda-head">
          <div>
            <h2 id="calendar-date" aria-live="polite" />
            <p id="calendar-agenda-label" />
          </div>
        </header>
        <div id="calendar-entries" className="compact-card-list" />
      </section>
    </div>
  );
}

const number = new Intl.NumberFormat(locale).format;
const get = (id: string) => document.getElementById(id)!;
const cycleLabels = {
  forecast: "ui.estimated-cycle-start",
  recorded: "ui.logged-cycle",
  spotting: "ui.cycle-spotting",
};
function tracker(
  kind: "water" | "sleep" | "cycle",
  label: string,
  title: string,
  details: string[],
  options: string,
  history: () => void,
  action?: { label: string; open(): void },
) {
  const art =
    kind === "sleep" ? (
      <img
        className="glass-object"
        src="/medication/assets/illustrations/sleep.webp"
        width={256}
        height={256}
        alt=""
      />
    ) : (
      <PlanArtwork id={kind} />
    );
  return mountCard(
    {
      className:
        `program-${kind} calendar-tracker day-card` +
        (kind === "water" ? " water calendar-water" : ""),
      "data-agenda-key": kind,
      "data-card-kind": kind,
    },
    <PlanDayCard
      art={art}
      title={title}
      titleDirection="inherit"
      label={label}
      time={null}
      details={details.map((text, i) => (
        <p key={i} className="quiet">
          {text}
        </p>
      ))}
      actions={
        <>
          <PlanOptions label={options}>
            <button type="button" className="secondary" onClick={history}>
              {t("ui.history")}
            </button>
          </PlanOptions>
          {action && (
            <button type="button" className="secondary" onClick={action.open}>
              {action.label}
            </button>
          )}
        </>
      }
    />,
  );
}

export function paintCalendar({
  state,
  index,
  dates,
  day,
  today,
  view,
  choose,
  renderDose,
  renderRoutine,
  visitCard,
  openWaterHistory,
  openSleepHistory,
  openSleep,
  cycleOpenDay,
  openCycleHistory,
  openWater,
}: CalendarInput) {
  const { monthStart, formatDay, month, dayNumber } = dates;
  const start = monthStart(day);
  const end = monthStart(start + 32) - 1;
  const cycleEnabled = cycleIsEnabled(state);
  const records = cycleEnabled ? (state.cycleRecords ?? {}) : {};
  const days = cycleEnabled ? (state.cycleDays ?? {}) : {};
  const periods = Object.entries(records).map(
    ([first, record]) => [Number(first), record.end ?? Number(first)] as const,
  );
  const forecast = cycleEnabled ? cycleForecast(records) : null;
  function cycleMark(date: number): keyof typeof cycleLabels | undefined {
    const flow = days[date]?.flow;
    if (flow === "spotting") return "spotting";
    if (
      ["light", "medium", "heavy"].includes(flow ?? "") ||
      (flow !== "none" &&
        periods.some(([first, last]) => date >= first && date <= last))
    )
      return "recorded";
    if (
      forecast &&
      date >= Math.max(forecast.first, today) &&
      date <= forecast.last
    )
      return "forecast";
  }
  const sleepEnabled = sleepIsEnabled(state);
  const sleepDays = new Map<
    number,
    NonNullable<CareState["sleepRecords"]>[string][]
  >();
  if (sleepEnabled)
    for (const row of Object.values(state.sleepRecords ?? {})) {
      if (row.end === null) continue;
      const day = sleepDay(row);
      if (day >= start && day <= end)
        sleepDays.set(day, [...(sleepDays.get(day) ?? []), row]);
    }
  get("calendar-sleep-key").hidden = !sleepEnabled;
  get("calendar-cycle-key").hidden = !cycleEnabled;
  get("calendar-month").textContent = month(start);
  renderMonthGrid(get("calendar-days"), {
    start,
    end,
    selected: day,
    today,
    formatDay,
    formatNumber: dayNumber,
    onSelect: choose,
    describe(date: number) {
      const dots: string[] = [];
      const captions: string[] = [];
      const markers = [
        [index.waterOn(date).length, "water", "ui.log-water"],
        [index.dosesOn(date).length, "medicine", "ui.medication-dose"],
        [sleepDays.has(date), "sleep", "ui.sleep"],
        [index.visitsOn(date).length, "visit", "ui.medical-appointment"],
        [index.calendarRoutinesOn(date).length, "routine", "ui.routine"],
      ] as const;
      for (const [active, kind, label] of markers)
        if (active) {
          dots.push(kind);
          captions.push(t(label));
        }
      const cycle = cycleMark(date);
      if (cycle) captions.push(t(cycleLabels[cycle]));
      else if (days[date]) dots.push("cycle");
      return {
        dots,
        cycle,
        caption: captions.length
          ? listSeparator + captions.join(listSeparator)
          : "",
      };
    },
  });
  const trackers: HTMLElement[] = [];
  const canPersonal = !view && day <= today;
  const canWater = day <= today && (!view || view.canRecord("water", day));
  const water = index.waterOn(day);
  if (water.length || canWater) {
    const count =
      water.length === 0
        ? t("ui.no-water-logged-for-this-day")
        : water.length === 1
          ? t("ui.1-water-entry")
          : t("ui.value-water-entries", number(water.length));
    trackers.push(
      tracker(
        "water",
        t("ui.water"),
        t("ui.value-ml", number(index.waterTotal(day))),
        [count],
        t("ui.water-log-options"),
        openWaterHistory,
        canWater ? { label: t("ui.log-water"), open: openWater } : undefined,
      ),
    );
  }
  const entries = sleepDays.get(day) ?? [];
  if (sleepEnabled && (entries.length || canPersonal)) {
    const total = entries.reduce((sum, row) => sum + sleepMinutes(row), 0);
    const details = entries.map((row) => {
      const label = t(row.kind === "nap" ? "ui.sleep-nap" : "ui.sleep-main");
      return entries.length === 1
        ? label
        : label + listSeparator + sleepDuration(sleepMinutes(row));
    });
    trackers.push(
      tracker(
        "sleep",
        t("ui.sleep"),
        entries.length ? sleepDuration(total) : t("ui.not-logged"),
        details,
        t("ui.sleep-history"),
        () => openSleepHistory(day),
        canPersonal
          ? { label: t("ui.sleep-log"), open: () => openSleep(day) }
          : undefined,
      ),
    );
  }
  const mark = cycleMark(day);
  const daily = days[day];
  if (cycleEnabled && (daily || mark || canPersonal)) {
    trackers.push(
      tracker(
        "cycle",
        t("ui.cycle"),
        t(
          mark
            ? cycleLabels[mark]
            : daily
              ? "ui.cycle-recorded-day"
              : "ui.not-logged",
        ),
        daily ? [describeCycleDay(daily).join(" · ")] : [],
        t("ui.cycle-record-options"),
        openCycleHistory,
        canPersonal
          ? { label: t("ui.cycle-day-log"), open: () => cycleOpenDay(day) }
          : undefined,
      ),
    );
  }
  const agenda: { key: string; minute: number; render(): HTMLElement }[] = [
    ...index.dosesOn(day).map((dose: Parameters<typeof renderDose>[1]) => ({
      key: `dose:${dose.medicineId}:${dose.minute}`,
      minute: dose.minute,
      render: () =>
        renderDose(state.medicines[dose.medicineId], dose, "calendar"),
    })),
    ...index.visitsOn(day).map((local: Parameters<typeof visitCard>[0]) => ({
      key: `visit:${local.visit.id}`,
      minute: clockMinute(local.time),
      render: () => visitCard(local, index.zone, true, "calendar"),
    })),
    ...index
      .calendarRoutinesOn(day)
      .map(
        (
          entry: Parameters<typeof renderRoutine>[0] & { historical?: boolean },
        ) => ({
          key: `routine:${entry.id}`,
          minute: entry.minute ?? Infinity,
          render: () =>
            renderRoutine(entry, day, {
              dayCard: true,
              calendar: true,
              readOnly: day >= today && Boolean(entry.historical),
            }),
        }),
      ),
  ].sort((a, b) => a.minute - b.minute);
  get("calendar-date").textContent = formatDay(day, true);
  get("calendar-agenda-label").textContent = t(
    day > today ? "برنامهٔ این روز" : "برنامه و سابقهٔ این روز",
  );
  get("calendar-today").hidden = day === today;
  const list = get("calendar-entries");
  const focused = list.contains(document.activeElement)
    ? (document.activeElement instanceof HTMLElement
        ? document.activeElement.closest<HTMLElement>("[data-agenda-key]")
        : undefined
      )?.dataset.agendaKey
    : undefined;
  const nodes: HTMLElement[] = [
    ...trackers,
    ...agenda.map((entry) => {
      const card = entry.render();
      card.dataset.agendaKey = entry.key;
      return card;
    }),
  ];
  for (const card of nodes)
    card.dataset.focusScope = "agenda:" + card.dataset.agendaKey;
  if (!nodes.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = t(
      day > today
        ? "برای این روز برنامه‌ای ندارید."
        : "برای این روز برنامه یا سابقه‌ای ندارید.",
    );
    nodes.push(empty);
  }
  disposeCards(list);
  list.replaceChildren(...nodes);
  if (focused)
    (
      nodes
        .find((card) => card.dataset.agendaKey === focused)
        ?.querySelector<HTMLElement>(
          ".day-card-actions > button, .day-card-more > summary",
        ) ??
      get("calendar-days").querySelector<HTMLElement>('[aria-pressed="true"]')
    )?.focus({ preventScroll: true });
}
