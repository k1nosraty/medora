import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  locale,
  t,
} from "../../product-assets/public/medication/shared/i18n/locale.js";
import { CareInputError } from "../../product-assets/public/medication/shared/ui/care-error.js";
import { Icon } from "./PlanCard";
import type { WaterEntry } from "./WaterEntries";

const number = new Intl.NumberFormat(locale).format;
const percent = new Intl.NumberFormat(locale, { style: "percent" }).format;
type WaterState = {
  water?: WaterEntry[];
  waterReminders?: { enabled?: boolean };
};

function findQuickWater(state: WaterState, entry: WaterEntry) {
  return state.water?.find(
    (record) =>
      record.id === entry.id &&
      record.amount === entry.amount &&
      record.day === entry.day &&
      record.time === entry.time,
  );
}

export interface TodayWaterProps {
  host: HTMLElement;
  state: WaterState;
  day: number;
  today: number;
  total: number;
  goal: number;
  progress: number;
  visible: boolean;
  canRecord: boolean;
  family: boolean;
  addWater(amount: number, day: number): Promise<WaterEntry | null>;
  mutateWater(
    change: (state: WaterState) => void,
    success: string,
    day?: number,
  ): Promise<boolean>;
  open(control: HTMLButtonElement): void;
  logFamily(control: HTMLButtonElement): void;
  history(): void;
}

export function TodayWater({
  host,
  state,
  day,
  today,
  total,
  goal,
  progress,
  visible,
  canRecord,
  family,
  addWater,
  mutateWater,
  open,
  logFamily,
  history,
}: TodayWaterProps) {
  const [entry, setEntry] = useState<WaterEntry | null>(null);
  const [pending, setPending] = useState(false);
  const quick = useRef<HTMLButtonElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  const active = entry && findQuickWater(state, entry) ? entry : null;
  const future = day > today;
  const show = !family && active?.day === day;

  useLayoutEffect(() => {
    host.hidden = future || !visible;
    host.toggleAttribute("data-goal-reached", total >= goal);
  }, [host, future, visible, total, goal]);

  useEffect(() => {
    if (entry && !active) setEntry(null);
  }, [entry, active]);
  useEffect(() => {
    if (!entry) return;
    let timer: ReturnType<typeof setTimeout>;
    function expire() {
      if (feedback.current?.contains(document.activeElement))
        timer = setTimeout(expire, 2000);
      else setEntry(null);
    }
    timer = setTimeout(expire, 6000);
    return () => clearTimeout(timer);
  }, [entry]);

  async function log(control: HTMLButtonElement) {
    if (family) {
      logFamily(control);
      return;
    }
    if (lock.current || day !== today) return;
    lock.current = true;
    setPending(true);
    try {
      const saved = await addWater(250, day);
      if (saved) setEntry(saved);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  async function undo() {
    if (!active || lock.current) return;
    lock.current = true;
    try {
      if (
        await mutateWater(
          (current) => {
            if (!findQuickWater(current, active))
              throw new CareInputError(
                t("ui.this-entry-has-changed-or-been-removed"),
              );
            current.water = current.water!.filter(
              (item) => item.id !== active.id,
            );
          },
          t("ui.water-entry-undone"),
          active.day,
        )
      ) {
        setEntry(null);
        quick.current?.focus({ preventScroll: true });
      }
    } finally {
      lock.current = false;
    }
  }

  return (
    <>
      <span className="tracker-art today-water-art">
        <svg
          className="water-glass"
          viewBox="0 0 256 256"
          aria-hidden="true"
          data-level={Math.min(4, Math.floor(progress * 4))}
        >
          <use href="#art-water-progress" />
        </svg>
      </span>
      <div className="tracker-body">
        <div className="water-info">
          <h2 id="today-water-label">
            {t(
              day === today
                ? "ui.todays-water"
                : "ui.water-intake-for-this-day",
            )}
          </h2>
          <span id="today-water-percent" aria-hidden="true">
            {percent(progress)}
          </span>
          <div className="today-water-meter">
            <p className="amount-line">
              <strong id="today-water-total">{number(total)}</strong>{" "}
              {t("ui.of")}{" "}
              <span className="today-water-target">
                <span id="today-water-goal">{number(goal)}</span> {t("ui.ml")}
              </span>
            </p>
            <progress
              className="water-progress"
              id="today-water-progress"
              aria-label={t("ui.water-goal-progress")}
              max={1}
              value={progress}
            />
          </div>
        </div>
        <div className="tracker-actions">
          <button
            type="button"
            className="tracker-primary"
            data-open-water=""
            hidden={!canRecord}
            onClick={(event) => {
              event.stopPropagation();
              open(event.currentTarget);
            }}
          >
            {t("ui.log-water")}
          </button>
          <button
            type="button"
            className="secondary"
            id="today-water-quick"
            ref={quick}
            aria-label={t("ui.quick-log-250-ml-of-water")}
            hidden={day !== today || !canRecord}
            disabled={pending}
            onClick={(event) => {
              event.stopPropagation();
              void log(event.currentTarget);
            }}
          >
            <bdi>{t("ui.250-2")}</bdi> <small>{t("ui.ml")}</small>
          </button>
          <button
            id="open-water-history"
            type="button"
            className="secondary"
            data-destination="water"
            aria-label={t("ui.water-history")}
            hidden={future}
            onClick={(event) => {
              event.stopPropagation();
              history();
            }}
          >
            {t("ui.history")}
          </button>
        </div>
      </div>
      {createPortal(
        <div
          id="today-water-feedback"
          className="tracker-feedback program-water"
          hidden={!show}
          ref={feedback}
        >
          <span id="today-water-message">
            {active && t("ui.logged-value-ml", number(active.amount))}
          </span>
          <button
            type="button"
            className="secondary glass-secondary-action tracker-utility"
            id="today-water-undo"
            onClick={() => void undo()}
          >
            {t("ui.undo-log")}
          </button>
          <button
            type="button"
            className="icon-button"
            id="today-water-dismiss"
            aria-label={t("ui.close")}
            onClick={() => {
              setEntry(null);
              quick.current?.focus({ preventScroll: true });
            }}
          >
            <Icon name="close" />
          </button>
        </div>,
        document.getElementById("water-feedback-react")!,
      )}
    </>
  );
}
