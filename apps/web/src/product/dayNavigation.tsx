import type { Mode, Screen } from "./routes";
import {
  shortWeek,
  t,
  weekIndex,
} from "../../product-assets/public/medication/shared/i18n/locale.js";
import { DayWeek, type WeekDay } from "./DayWeek";
import { paintFeature } from "./renderer";
import { Icon } from "./PlanCard";
import { isoDay as iso } from "../../product-assets/public/medication/domain/care-index.js";

interface DayNavigationOptions {
  root: HTMLElement;
  getDates: () => {
    month: (day: number) => string;
    formatDay: (day: number, full?: boolean) => string;
    dayNumber: (day: number) => string;
  };
  render: () => void;
  selectedDay: () => number;
  today: () => number;
  onDayChange: (screen: Screen) => void;
  openDate(): void;
}

export function installDayNavigation({
  root,
  getDates,
  render,
  selectedDay,
  today,
  onDayChange,
  openDate,
}: DayNavigationOptions) {
  const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
    root.querySelector<T>("#" + id)!;
  const dayControls = $("day-controls");
  const selectedDates = new Map<Screen, number>();
  const date = $<HTMLInputElement>("day");
  let screen: Screen = "today";
  let weekSlide: Animation | undefined;

  function chooseDay(day: number, restoreFocus?: string) {
    if (
      ["today", "medications", "appointments", "routines", "water"].includes(
        screen,
      )
    ) {
      if (day === today()) selectedDates.delete(screen);
      else selectedDates.set(screen, day);
    }
    date.value = iso(day);
    history.replaceState(
      { ...history.state, medoraDay: day },
      "",
      location.href,
    );
    onDayChange(screen);
    render();
    if (restoreFocus)
      (
        $(restoreFocus).querySelector<HTMLElement>('[aria-pressed="true"]') ??
        $("pick-day")
      ).focus({ preventScroll: true });
  }
  function shift(delta: -1 | 1) {
    if (screen === "water" && selectedDay() + delta > today()) return;
    const dayWeek = $("day-week");
    const animate =
      screen === "today" &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches &&
      getComputedStyle(dayWeek).gridTemplateColumns.split(" ").length === 7;
    const outgoing = animate
      ? dayWeek.children[delta > 0 ? 0 : 6]?.cloneNode(true)
      : null;
    chooseDay(selectedDay() + delta);
    if (!(outgoing instanceof HTMLElement)) return;
    outgoing.inert = true;
    outgoing.setAttribute("aria-hidden", "true");
    outgoing.classList.add("day-week-ghost");
    outgoing.dataset.edge = delta > 0 ? "start" : "end";
    dayWeek.append(outgoing);
    const direction = document.documentElement.dir === "rtl" ? -1 : 1;
    weekSlide = dayWeek.animate(
      [
        { transform: `translateX(${(direction * delta * 100) / 7}%)` },
        { transform: "none" },
      ],
      { duration: 210, easing: "ease-out" },
    );
    weekSlide.onfinish = () => outgoing.remove();
  }

  function activate(destination: Screen, mode: Mode, waterDay: number) {
    if (destination === "water" && mode === "push")
      selectedDates.set("water", Math.min(waterDay, today()));
    const host = root.querySelector(`[data-day-host="${destination}"]`);
    if (host) {
      const saved =
        mode === "pop" && Number.isInteger(history.state?.medoraDay)
          ? history.state.medoraDay
          : undefined;
      date.value = iso(
        saved ??
          selectedDates.get(destination) ??
          (mode === "replace" ? selectedDay() : today()),
      );
      host.append(dayControls);
    }
    screen = destination;
    dayControls.hidden = !host;
    dayControls.classList.toggle("single-date", screen !== "today");
    dayControls.classList.toggle("compact-day", screen !== "today");
    $("today-dates").hidden = screen !== "today";
  }

  function paint(day: number) {
    if (dayControls.hidden) return;
    const dates = getDates();
    weekSlide?.cancel();
    $("day-week")?.querySelector(".day-week-ghost")?.remove();
    const current = today();
    const days =
      screen === "today"
        ? Array.from({ length: 7 }, (_, offset): WeekDay => {
            const value = day - 3 + offset;
            const number = dates.dayNumber(value);
            const weekday = shortWeek[weekIndex(value)]!;
            return {
              value,
              number,
              weekday,
              label:
                number + " " + weekday + ", " + dates.formatDay(value, true),
              selected: value === day,
              today: value === current,
            };
          })
        : [];
    const label =
      screen === "today"
        ? dates.month(day)
        : day === current
          ? t("ui.today")
          : dates.formatDay(day);
    paintFeature(
      $("day-tools-react"),
      <>
        <div className="day-toolbar">
          <button
            id="pick-day"
            className="date-field"
            type="button"
            aria-label={
              label +
              ", " +
              t("ui.choose-date-value", dates.formatDay(day, true))
            }
            onClick={openDate}
          >
            <span id="day-label" aria-live="polite">
              {label}
            </span>
            <Icon name="expand" />
          </button>
          <button
            type="button"
            id="today-reset"
            className="secondary date-reset"
            aria-label={t("ui.today-return-label")}
            hidden={day === current}
            onClick={() => chooseDay(current, "day-week")}
          >
            {t("ui.today")}
          </button>
        </div>
        <button
          type="button"
          className="secondary day-arrow icon-button"
          id="previous-day"
          data-date-arrow="previous"
          aria-label={t("ui.previous-day")}
          onClick={() => shift(-1)}
        >
          <Icon name="expand" />
        </button>
        <div className="day-week-window">
          <div
            id="day-week"
            className="day-week"
            aria-label={t("ui.days-of-the-week")}
          >
            <DayWeek
              days={days}
              choose={(value) => chooseDay(value, "day-week")}
            />
          </div>
        </div>
        <button
          type="button"
          className="secondary day-arrow icon-button reverse"
          id="next-day"
          data-date-arrow="next"
          aria-label={t("ui.next-day")}
          disabled={screen === "water" && day >= current}
          onClick={() => shift(1)}
        >
          <Icon name="expand" />
        </button>
      </>,
    );
  }

  return {
    activate,
    chooseDay,
    paint,
    reset: () => {
      selectedDates.clear();
      date.value = iso(today());
      const state = { ...history.state };
      delete state.medoraDay;
      history.replaceState(state, "", location.href);
    },
  };
}
