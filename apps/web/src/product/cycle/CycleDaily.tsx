import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  cycleEntries,
  cycleEstimate,
  cycleOn,
  cyclePatterns,
} from "@medora/domain/browser/cycle";
import { equalCareValues } from "@medora/domain/browser/care-contract";
import { cycleIsEnabled } from "@medora/domain/browser/profile";
import { CareInputError } from "../../../product-assets/public/medication/shared/ui/care-error.js";
import {
  localDigits,
  locale,
  t,
} from "../../../product-assets/public/medication/shared/i18n/locale.js";
import type { calendarFormat } from "../../../product-assets/public/medication/shared/ui/calendar-format.js";
import type { createCareIndex } from "@medora/domain/browser/care-index";
import { Icon, PlanArtwork, PlanOptions } from "../PlanCard";
import type { CareState } from "../productState";
import { paintFeature } from "../renderer";
import { describeCycleDay } from "../cycleLabels";
import type { MutateSettings } from "../settings/CyclePreferences";
import type { CyclePeriod } from "./PeriodEditor";

interface CycleOptions {
  state: CareState;
  personal: boolean;
  today: number;
  dates: ReturnType<typeof calendarFormat>;
  mutate: MutateSettings;
  open(day: number): void;
}

type QuickEntry = {
  key: number;
  day: number;
  after: CyclePeriod;
  before?: CyclePeriod;
  followup?: CareState["cycleFollowup"];
  message: string;
  dismissed?: boolean;
};

interface TodayOptions extends CycleOptions {
  day: number;
  visible: boolean;
  compact: boolean;
  editCycle(day: number): void;
  showHistory(): void;
  canUse(): boolean;
  getActionDay(): number;
  getToday(): number;
}

function CycleToday({
  state,
  personal,
  today,
  day,
  visible,
  compact,
  dates,
  mutate,
  open,
  editCycle,
  showHistory,
  canUse,
  getActionDay,
  getToday,
}: TodayOptions) {
  const [entry, setEntry] = useState<QuickEntry>();
  const lock = useRef(false);
  const active = personal ? cycleOn(state.cycleRecords, day, today) : undefined;
  const estimate = personal ? cycleEstimate(state.cycleRecords) : undefined;
  const quick = day === today && personal;
  const wide = visible && !compact;
  useLayoutEffect(() => {
    document.getElementById("cycle-today-card")!.hidden = !wide;
  }, [wide]);
  const actual =
    entry && equalCareValues(state.cycleRecords?.[entry.key], entry.after)
      ? entry
      : undefined;
  const undoable = wide && quick && actual?.day === day;
  const editable =
    wide &&
    personal &&
    day <= today &&
    Boolean(active || state.cycleDays?.[day]);
  const details = active
    ? [t("ui.cycle-today-period-day", localDigits(day - active.start + 1))]
    : [];
  const daily = personal ? state.cycleDays?.[day] : undefined;
  if (daily) details.push(...describeCycleDay(daily));
  if (!details.length && quick && estimate && day <= estimate.last) {
    details.push(
      estimate.first === estimate.last
        ? t("ui.estimated-cycle-date", dates.shortDate(estimate.first))
        : t(
            "ui.estimated-value-to-value",
            dates.shortDate(estimate.first),
            dates.shortDate(estimate.last),
          ),
    );
  }

  async function save(ending = false) {
    if (!canUse() || lock.current) return;
    lock.current = true;
    const date = getToday();
    let saved: QuickEntry | undefined;
    try {
      if (
        await mutate(
          (current) => {
            if (!cycleIsEnabled(current))
              throw new CareInputError(t("ui.cycle-is-turned-off"));
            const rows = (current.cycleRecords ??= {});
            const period = cycleOn(rows, date);
            if (ending) {
              const before = period && rows[period.start];
              if (!period || !before || before.end !== null)
                throw new CareInputError(t("ui.cycle-entry-changed"));
              const after = (rows[period.start] = { ...before, end: date });
              saved = {
                key: period.start,
                day: date,
                before,
                after,
                message: t("ui.cycle-today-end-logged"),
              };
            } else {
              if (period)
                throw new CareInputError(t("ui.cycle-possible-overlap"));
              const after: CyclePeriod = (rows[date] = { end: null, flow: "" });
              saved = {
                key: date,
                day: date,
                after,
                followup: current.cycleFollowup,
                message: t("ui.cycle-start-logged"),
              };
              delete current.cycleFollowup;
            }
          },
          "",
          true,
        )
      )
        setEntry(saved);
    } finally {
      lock.current = false;
    }
  }

  async function undo() {
    if (
      !actual ||
      lock.current ||
      !canUse() ||
      actual.day !== getToday() ||
      getActionDay() !== actual.day
    )
      return;
    lock.current = true;
    try {
      const saved = await mutate(
        (current) => {
          const rows = current.cycleRecords;
          if (
            !rows ||
            !cycleIsEnabled(current) ||
            !equalCareValues(rows[actual.key], actual.after)
          )
            throw new CareInputError(t("ui.cycle-entry-changed"));
          if (actual.before) rows[actual.key] = actual.before;
          else {
            delete rows[actual.key];
            if (actual.followup && !current.cycleFollowup)
              current.cycleFollowup = actual.followup;
          }
        },
        t("ui.cycle-log-undone"),
        true,
      );
      if (saved) {
        setEntry(undefined);
        document
          .getElementById(
            actual.before ? "cycle-today-end" : "cycle-today-start",
          )
          ?.focus({ preventScroll: true });
      }
    } finally {
      lock.current = false;
    }
  }

  function follow(later: boolean) {
    if (!canUse() || !estimate) return;
    void mutate((current) => {
      current.cycleFollowup = {
        until: later ? getToday() + 1 : null,
        estimate: estimate.last,
      };
    }, t("ui.cycle-follow-saved"));
  }

  const followup = state.cycleFollowup;
  const followVisible =
    quick &&
    estimate &&
    day > estimate.last &&
    !active &&
    !(
      followup?.estimate === estimate.last &&
      (followup.until === null || day < followup.until)
    );
  const feedbackHost = document.getElementById("cycle-feedback-react")!;
  const compactLabel = document.getElementById("program-cycle-summary")!;
  return (
    <>
      {editable || undoable ? (
        <PlanOptions label={t("ui.cycle-record-options")}>
          <button
            type="button"
            className="secondary"
            hidden={!editable}
            onClick={() => (active ? editCycle(active.start) : open(day))}
          >
            {t("ui.edit")}
          </button>
          <button
            type="button"
            className="secondary"
            hidden={!undoable}
            onClick={() => void undo()}
          >
            {t("ui.undo-log")}
          </button>
        </PlanOptions>
      ) : (
        <details className="day-card-more" name="day-card-options" hidden />
      )}
      <span className="tracker-art cycle-today-art" aria-hidden="true">
        <PlanArtwork id="cycle" />
      </span>
      <div className="tracker-body">
        <h2 id="cycle-today-label">{t("ui.cycle")}</h2>
        <p id="cycle-today-detail">
          {details.slice(0, 2).join(" · ") || (quick ? t("ui.not-logged") : "")}
        </p>
        <div id="cycle-today-actions" className="tracker-actions">
          <button
            type="button"
            className="tracker-primary"
            id="cycle-today-start"
            hidden={!quick || Boolean(active)}
            onClick={() => void save()}
          >
            {t("ui.cycle-start-now")}
          </button>
          <button
            type="button"
            className="tracker-primary"
            id="cycle-today-end"
            hidden={!quick || !active}
            disabled={active?.end !== null}
            onClick={() => void save(true)}
          >
            {t(
              active?.end !== null
                ? "ui.cycle-today-end-logged"
                : "ui.cycle-end-now",
            )}
          </button>
          <button
            type="button"
            className="secondary"
            id="cycle-today-symptoms"
            data-cycle-log=""
            hidden={!quick}
            onClick={() => open(Math.min(day, today))}
          >
            {t("ui.cycle-day-log")}
          </button>
          <button
            type="button"
            className="secondary"
            id="program-cycle"
            aria-label={t("ui.cycle-history")}
            onClick={showHistory}
          >
            {t("ui.history")}
          </button>
        </div>
      </div>
      <div id="cycle-follow-up" hidden={!followVisible}>
        <p>{t("ui.cycle-follow-question")}</p>
        <div className="sleep-periods">
          <button
            type="button"
            className="secondary"
            id="cycle-follow-yes"
            onClick={() => void save()}
          >
            {t("ui.cycle-start-now")}
          </button>
          <button
            type="button"
            className="secondary"
            id="cycle-follow-no"
            onClick={() => follow(false)}
          >
            {t("ui.cycle-follow-no")}
          </button>
          <button
            type="button"
            className="text-button"
            id="cycle-follow-later"
            onClick={() => follow(true)}
          >
            {t("ui.cycle-follow-later")}
          </button>
        </div>
      </div>
      {createPortal(compact && visible ? (details[0] ?? "") : "", compactLabel)}
      {createPortal(
        <div
          id="today-cycle-feedback"
          className="tracker-feedback program-cycle"
          hidden={!undoable || actual?.dismissed}
        >
          <span id="today-cycle-message" role="status">
            {actual?.message}
          </span>
          <button
            type="button"
            className="secondary glass-secondary-action tracker-utility"
            id="today-cycle-undo"
            onClick={() => void undo()}
          >
            {t("ui.undo-log")}
          </button>
          <button
            type="button"
            className="icon-button"
            id="today-cycle-dismiss"
            aria-label={t("ui.close")}
            onClick={() => {
              if (actual) setEntry({ ...actual, dismissed: true });
              document
                .getElementById("cycle-today-symptoms")
                ?.focus({ preventScroll: true });
            }}
          >
            <Icon name="close" />
          </button>
        </div>,
        feedbackHost,
      )}
    </>
  );
}

const offsets = [-2, -1, 0, 1, 2];
const signed = new Intl.NumberFormat(locale, { signDisplay: "always" }).format;

function DailyRecords({
  state,
  today,
  personal,
  dates,
  index,
  open,
}: CycleOptions & { index: ReturnType<typeof createCareIndex> }) {
  const { logged, total, symptoms, spotting, longest } = personal
    ? cyclePatterns(state.cycleRecords, state.cycleDays)
    : { logged: 0, total: 0, symptoms: [], spotting: 0, longest: 0 };
  const summaries = symptoms.map(([key, count]) =>
    t(
      "ui.cycle-days-symptoms-by-period",
      t(`ui.cycle-${key}`),
      localDigits(count),
      localDigits(logged),
    ),
  );
  if (longest) summaries.push(t("ui.cycle-longest", localDigits(longest)));
  if (spotting)
    summaries.push(t("ui.cycle-spotting-total", localDigits(spotting)));
  const daily = state.cycleDays ?? {};
  const periods = cycleEntries(state.cycleRecords);
  const nearest = periods.slice(0, 12);
  const medicineDates = Object.values(state.doses ?? {})
    .filter(
      (dose) =>
        dose.status === "taken" &&
        nearest.some(
          (row) =>
            dose.day >= row.start - 2 && dose.day <= (row.end ?? row.start) + 2,
        ),
    )
    .map((dose) => dose.day);
  const entries = [
    ...new Set([...Object.keys(daily).map(Number), ...medicineDates]),
  ].sort((a, b) => b - a);
  return (
    <>
      <h2>{t("ui.cycle-daily-records")}</h2>
      <p id="cycle-patterns" className="quiet">
        {personal && total
          ? t(
              "ui.cycle-trend-coverage",
              localDigits(logged),
              localDigits(total),
            )
          : ""}
      </p>
      <div id="cycle-symptom-map">
        {personal && total > 0 && Object.keys(daily).length > 0 && (
          <table>
            <caption>{t("ui.cycle-map-title")}</caption>
            <thead>
              <tr>
                <th>{t("ui.start-date")}</th>
                {offsets.map((offset) => (
                  <th key={offset} scope="col">
                    {offset ? signed(offset) : t("ui.cycle-map-start")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods.slice(0, 6).map(({ start }) => (
                <tr key={start}>
                  <th scope="row">{dates.shortDate(start)}</th>
                  {offsets.map((offset) => {
                    const day = start + offset;
                    const row = daily[day];
                    return (
                      <td key={offset}>
                        <button
                          type="button"
                          className="secondary"
                          data-logged={Boolean(row)}
                          disabled={day > today}
                          aria-label={
                            dates.formatDay(day) +
                            " · " +
                            (row
                              ? describeCycleDay(row).join("، ")
                              : t("ui.sleep-no-record"))
                          }
                          onClick={() => open(day)}
                        >
                          {row
                            ? localDigits(
                                Object.keys(row.symptoms ?? {}).length,
                              )
                            : "·"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <ul id="cycle-pattern-list">
        {personal && summaries.map((line) => <li key={line}>{line}</li>)}
      </ul>
      <div id="cycle-daily-records">
        {personal &&
          entries.map((day) => {
            const row = daily[day];
            const doses = index
              .dosesOn(day)
              .filter((dose: { status?: string }) => dose.status === "taken")
              .map(
                (dose: { medicineId: string; name?: string }) =>
                  state.medicines[dose.medicineId]?.name ?? dose.name,
              )
              .filter(Boolean);
            return (
              <article className="cycle-record" key={day}>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => open(day)}
                >
                  {dates.formatDay(day, true)}
                </button>
                <p>
                  {row
                    ? describeCycleDay(row).join(" · ")
                    : t("ui.cycle-history-empty")}
                </p>
                {doses.length > 0 && (
                  <p className="quiet">
                    {t("ui.cycle-dose-taken-day") +
                      " · " +
                      [...new Set(doses)].join("، ")}
                  </p>
                )}
              </article>
            );
          })}
      </div>
    </>
  );
}

function Preparation({ state, today, personal, mutate }: CycleOptions) {
  const estimate = personal ? cycleEstimate(state.cycleRecords) : undefined;
  const list = personal ? (state.cycleChecklist ?? []) : [];
  const checked =
    state.cyclePreparation?.estimate === estimate?.first
      ? (state.cyclePreparation?.items ?? [])
      : [];
  return (
    <details
      id="cycle-preparation"
      hidden={
        !list.length ||
        !estimate ||
        today < estimate.first - 3 ||
        today > estimate.last
      }
    >
      <summary>{t("ui.cycle-checklist")}</summary>
      <div id="cycle-preparation-list">
        {list.map((item) => (
          <label key={item}>
            <input
              type="checkbox"
              checked={checked.includes(item)}
              onChange={(event) => {
                if (!estimate) return;
                const selected = event.currentTarget.checked;
                void mutate((current) => {
                  const previous = current.cyclePreparation;
                  const items =
                    previous?.estimate === estimate.first ? previous.items : [];
                  current.cyclePreparation = {
                    estimate: estimate.first,
                    items: selected
                      ? [...new Set([...items, item])]
                      : items.filter((value) => value !== item),
                  };
                }, t("ui.cycle-days-saved"));
              }}
            />{" "}
            {item}
          </label>
        ))}
      </div>
    </details>
  );
}

export function renderCycleToday(options: TodayOptions) {
  paintFeature(
    document.getElementById("cycle-today-card")!,
    <CycleToday {...options} />,
  );
}

export function renderCycleDaily(
  options: CycleOptions & {
    index: ReturnType<typeof createCareIndex>;
    openSettings(): void;
  },
) {
  const tracking = document.getElementById("cycle-tracking")!;
  tracking.hidden = !options.personal;
  paintFeature(tracking, <DailyRecords {...options} />);
  paintFeature(
    document.getElementById("cycle-preparation-react")!,
    <Preparation {...options} />,
  );
  paintFeature(
    document.getElementById("cycle-settings-link-react")!,
    <button
      type="button"
      id="cycle-open-settings"
      className="secondary"
      onClick={options.openSettings}
    >
      {t("ui.cycle-tracking-settings")}
    </button>,
  );
  document.getElementById("cycle-personal-tools")!.hidden = !options.personal;
}
