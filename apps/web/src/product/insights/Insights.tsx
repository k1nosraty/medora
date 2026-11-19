import {
  weekIndex,
  t,
} from "../../../product-assets/public/medication/shared/i18n/locale.js";
import type { calendarFormat } from "../../../product-assets/public/medication/shared/ui/calendar-format.js";
import type { createCareIndex } from "../../../product-assets/public/medication/domain/care-index.js";
import type { RenderDose } from "../medication/Medication";
import type { installAppointments } from "../appointments/Appointments";
import type { installRoutines } from "../routines/Routines";
import type { CareState, FamilyView } from "../product";
import { clearMonthGrid } from "../MonthGrid";
import { Icon } from "../PlanCard";
import { clearFeature, disposeCards, paintFeature } from "../renderer";
import { CalendarShell, paintCalendar } from "./Calendar";
import { Reports, clearWaterChart, type Period } from "./Reports";

type Section = "calendar" | "reports";
interface FeatureCalls {
  renderDose: RenderDose;
  renderRoutine: ReturnType<typeof installRoutines>["card"];
  visitCard: ReturnType<typeof installAppointments>["visitCard"];
  openWater(): void;
  openWaterHistory(): void;
  openSleep(day: number): void;
  openSleepHistory(day: number): void;
  cycleOpenDay(day: number): void;
  openCycleHistory(): void;
}
type Dates = ReturnType<typeof calendarFormat>;
type Index = ReturnType<typeof createCareIndex>;
export interface CalendarInput extends FeatureCalls {
  dates: Dates;
  index: Index;
  state: CareState;
  view: FamilyView | null;
  day: number;
  today: number;
  choose(day: number, focus?: boolean): void;
}
interface Options extends FeatureCalls {
  root: HTMLElement;
  today(): number;
  getFamilyView(): FamilyView | null;
  getDates(): Dates;
  render(): void;
}
function InsightTabs({
  section,
  choose,
}: {
  section: Section;
  choose(section: Section): void;
}) {
  return (
    <div
      className="insights-tabs segmented glass-toolbar"
      role="group"
      aria-label={t("ui.calendar-and-reports")}
    >
      <button
        type="button"
        data-insight="calendar"
        aria-controls="calendar-panel"
        aria-pressed={section === "calendar"}
        onClick={() => choose("calendar")}
      >
        <Icon name="calendar" />
        {t("ui.calendar")}
      </button>
      <button
        type="button"
        data-insight="reports"
        aria-controls="reports-panel"
        aria-pressed={section === "reports"}
        onClick={() => choose("reports")}
      >
        <Icon name="reports" />
        {t("ui.reports-2")}
      </button>
    </div>
  );
}
export function installInsights({
  root,
  today,
  getFamilyView,
  getDates,
  render,
  ...features
}: Options) {
  let section: Section = "calendar";
  let selection = today();
  let period: Period = "month";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const get = (id: string) => root.querySelector<HTMLElement>("#" + id)!;
  function choose(day: number, focus = false) {
    selection = day;
    render();
    if (focus)
      get("calendar-days")
        .querySelector<HTMLElement>('[aria-pressed="true"]')
        ?.focus({ preventScroll: true });
  }
  function shift(delta: number) {
    const { monthStart } = getDates();
    const old = monthStart(selection);
    const start = monthStart(old + delta);
    choose(Math.min(monthStart(start + 32) - 1, start + selection - old));
  }
  paintFeature(
    root,
    <>
      <div id="insights-header">
        <div id="insights-tab-host" style={{ display: "contents" }} />
      </div>
      <CalendarShell
        hidden={false}
        shift={shift}
        reset={() => choose(today(), true)}
      />
      <div id="reports-panel" hidden />
    </>,
  );
  function select(next: Section) {
    section = next;
    get("calendar-panel").hidden = next !== "calendar";
    get("reports-panel").hidden = next !== "reports";
    paintFeature(
      get("insights-tab-host"),
      <InsightTabs
        section={section}
        choose={(value) => {
          select(value);
          render();
        }}
      />,
    );
  }
  select("calendar");
  const stop = () => clearTimeout(timer);
  function paint(state: CareState, index: Index) {
    stop();
    const dates = getDates();
    const last = today();
    const view = getFamilyView();
    if (section === "calendar") {
      paintCalendar({
        ...features,
        state,
        index,
        dates,
        day: selection,
        today: last,
        view,
        choose,
      });
      return;
    }
    let first =
      period === "week" ? last - weekIndex(last) : dates.monthStart(last);
    if (period === "year")
      while (dates.year(first - 1) === dates.year(last))
        first = dates.monthStart(first - 1);
    paintFeature(
      get("reports-panel"),
      <Reports
        first={first}
        last={last}
        period={period}
        dates={dates}
        state={state}
        index={index}
        view={view}
        change={(value) => {
          period = value;
          render();
        }}
      />,
    );
    timer = setTimeout(render, 60_000 - (Date.now() % 60_000));
  }
  function reset() {
    selection = today();
    clearMonthGrid(get("calendar-days"));
    if (get("report-chart")) clearWaterChart();
    clearFeature(get("reports-panel"));
    const agenda = get("calendar-entries");
    disposeCards(agenda);
    clearFeature(agenda);
  }
  return {
    paint,
    reset,
    stop,
    actionDay: () => (section === "calendar" ? selection : today()),
    openCalendar(day: number) {
      selection = day;
      select("calendar");
    },
  };
}
