import { useSyncExternalStore } from "react";
import {
  localDigits,
  t,
} from "../../product-assets/public/medication/shared/i18n/locale.js";
import {
  reminderView,
  watchReminders,
} from "../../product-assets/public/medication/features/reminders/service.js";
import type { CareState, FamilyView } from "./product";
import { PlanArtwork } from "./PlanCard";
import { paintFeature } from "./renderer";
import type { Screen } from "./routes";

const shortcuts = [
  ["medications", "medicine", "ui.medicine", "bottle"],
  ["appointments", "visit", "ui.visit-shortcut", "visit-main"],
  ["routines", "routine", "ui.routine", "routine-main"],
  ["sleep", "sleep", "ui.sleep", "sleep"],
  ["cycle", "cycle", "ui.cycle", "cycle"],
] as const;

interface Options {
  state: CareState;
  view: FamilyView | null;
  cycleShortcut: boolean;
  cycleEnabled: boolean;
  cycleCompact: boolean;
  sleepEnabled: boolean;
  sleepCompact: boolean;
  counts: [number, number, number];
  formatDay(day: number): string;
  show(screen: Screen): void;
  openNotifications(): void;
}

const labels = [
  ["ui.1-dose", "ui.value-doses"],
  ["ui.1-appointment", "ui.value-appointments"],
  ["ui.1-routine", "ui.value-routines"],
] as const;

function Programs({
  visible,
  counts,
  show,
}: {
  visible: boolean[];
  counts: Options["counts"];
  show: Options["show"];
}) {
  return (
    <div className="program-grid">
      {shortcuts.map(([screen, css, caption, artwork], position) => {
        const counter = labels[position];
        const count = counts[position];
        const id =
          screen === "cycle"
            ? "program-cycle-compact"
            : screen === "sleep"
              ? "program-sleep"
              : undefined;
        return (
          <button
            key={screen}
            type="button"
            className={`program-card program-${css}`}
            id={id}
            data-destination={screen}
            hidden={!visible[position]}
            onClick={(event) => {
              event.stopPropagation();
              show(screen);
            }}
          >
            {screen === "sleep" ? (
              <img
                className="glass-object category-art"
                src="/medication/assets/illustrations/sleep.webp"
                width="256"
                height="256"
                alt=""
              />
            ) : (
              <PlanArtwork id={artwork} className="category-art" />
            )}
            <strong>{t(caption)}</strong>
            <small id={"program-" + screen + (id ? "-summary" : "")}>
              {counter && count !== undefined
                ? t(count === 1 ? counter[0] : counter[1], localDigits(count))
                : undefined}
            </small>
          </button>
        );
      })}
    </div>
  );
}

function TodayCompanion({
  state,
  formatDay,
}: {
  state: CareState;
  formatDay(day: number): string;
}) {
  const estimate = state.cycleCompanionEstimate;
  return (
    <>
      <h2>{t("ui.cycle")}</h2>
      <p id="cycle-companion-estimate">
        {estimate &&
          t(
            "ui.estimated-value-to-value",
            formatDay(estimate.first),
            formatDay(estimate.last),
          )}
      </p>
      <p id="cycle-companion-message" dir="auto">
        {state.cycleCompanionMessage}
      </p>
    </>
  );
}

function ReminderSetup({
  eligible,
  open,
}: {
  eligible: boolean;
  open(): void;
}) {
  const { enabled } = useSyncExternalStore(watchReminders, reminderView);
  return (
    <section
      id="today-reminders"
      className="feature mist"
      data-eligible={eligible ? "" : undefined}
      hidden={!eligible || enabled}
    >
      <h2>{t("ui.reminders")}</h2>
      <p className="quiet">
        {t("ui.set-up-this-device-to-get-reminders-when-medora-is-closed")}
      </p>
      <button
        type="button"
        className="secondary"
        data-open-notifications=""
        onClick={open}
      >
        {t("ui.notification-settings")}
      </button>
    </section>
  );
}

export function renderTodayShortcuts({
  state,
  view,
  cycleShortcut,
  cycleEnabled,
  cycleCompact,
  sleepEnabled,
  sleepCompact,
  counts,
  formatDay,
  show,
  openNotifications,
}: Options) {
  const programs = document.getElementById("today-programs")!;
  const visible = shortcuts.map(([screen]) =>
    screen === "cycle"
      ? cycleShortcut && cycleCompact
      : screen === "sleep"
        ? sleepEnabled && sleepCompact
        : view?.canView(screen) !== false,
  );
  const count = visible.filter(Boolean).length;
  programs.hidden = !count;
  programs.toggleAttribute("data-two-column", count > 3);
  programs.style.setProperty(
    "--program-columns",
    String(count > 3 ? 2 : Math.max(1, count)),
  );
  paintFeature(
    programs,
    <Programs visible={visible} counts={counts} show={show} />,
  );

  const companion = document.getElementById("cycle-companion-card")!;
  companion.hidden =
    !view || (!state.cycleCompanionEstimate && !state.cycleCompanionMessage);
  paintFeature(
    companion,
    <TodayCompanion state={state} formatDay={formatDay} />,
  );

  const hasPlans = [state.medicines, state.visits, state.routines].some(
    (plans) => Object.keys(plans ?? {}).length > 0,
  );
  const eligible =
    !view &&
    (hasPlans ||
      state.waterReminders?.enabled === true ||
      (sleepEnabled &&
        Boolean(state.sleepSettings?.bedtime || state.sleepSettings?.wake)) ||
      (cycleEnabled &&
        Number.isInteger(state.cycleOptions?.minute) &&
        !state.cycleLocalOnly));
  paintFeature(
    document.getElementById("today-reminders-react")!,
    <ReminderSetup eligible={eligible} open={openNotifications} />,
  );
}
