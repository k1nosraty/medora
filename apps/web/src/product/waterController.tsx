import { CareInputError } from "../../product-assets/public/medication/shared/ui/care-error.js";
import {
  locale,
  t,
} from "../../product-assets/public/medication/shared/i18n/locale.js";
import { waterGoalReached } from "../../product-assets/public/medication/domain/care-plan.js";
import { changeReminderRevision } from "../../product-assets/public/medication/features/reminders/controller.js";
import { localClock } from "../../product-assets/public/medication/shared/ui/input-values.js";
import { renderEntries, type WaterEntry } from "./WaterEntries";
import { WaterLogForm, type WaterTarget } from "./WaterLogForm";
import { paintFeature } from "./renderer";

interface WaterState {
  water?: WaterEntry[];
  waterReminders?: { enabled?: boolean };
}

interface WaterView {
  has(scope: "water"): boolean;
  canRecord(scope: "water", day: number): boolean;
  authorName(entry: WaterEntry): string;
}

interface Options {
  getState(): WaterState;
  selectedDay(): number;
  today(): number;
  actionDay(): number;
  getFamilyView?: () => WaterView | null;
  mutate(
    change: (state: WaterState) => void,
    success: string,
    affectsSchedule: boolean,
    day?: number,
  ): Promise<boolean>;
  refreshFields(container: HTMLElement): void;
  formatDay(day: number): string;
  formatShortDate(day: number): string;
}

function $<T extends HTMLElement = HTMLElement>(id: string) {
  return document.getElementById(id)! as T;
}

const numbers = new Intl.NumberFormat(locale);
const percent = new Intl.NumberFormat(locale, { style: "percent" });
function clockText(value: string) {
  return value.replace(/\d/g, (digit) => numbers.format(Number(digit)));
}

export function installWater({
  getState,
  selectedDay,
  today,
  actionDay,
  getFamilyView = () => null,
  mutate,
  refreshFields,
  formatDay,
  formatShortDate,
}: Options) {
  const dialog = $<HTMLDialogElement>("water-dialog");
  let formKey = 0;
  let quickWaterEntry: WaterEntry | null = null;
  let quickWaterTimer: ReturnType<typeof setTimeout> | undefined;

  function dismissQuickFeedback() {
    clearTimeout(quickWaterTimer);
    quickWaterEntry = null;
    $("today-water-feedback").hidden = true;
  }

  function expireQuickFeedback() {
    if ($("today-water-feedback").contains(document.activeElement)) {
      quickWaterTimer = setTimeout(expireQuickFeedback, 2000);
    } else dismissQuickFeedback();
  }

  function mutateWater(
    change: (state: WaterState) => void,
    success: string,
    day?: number,
  ) {
    const currentDay = today();
    return mutate(
      (state) => {
        const affectsReminders =
          state.waterReminders?.enabled &&
          (day === undefined || day === currentDay);
        const reached = affectsReminders && waterGoalReached(state, currentDay);
        change(state);
        if (affectsReminders && reached !== waterGoalReached(state, currentDay))
          changeReminderRevision(state);
      },
      success,
      false,
      day,
    );
  }

  async function addWater(
    amount: number,
    day = selectedDay(),
    time = localClock(),
    id: string | null = null,
  ) {
    if (day > today()) return null;
    const entry: WaterEntry = {
      id: id ?? crypto.randomUUID(),
      day,
      time,
      amount,
    };
    const saved = await mutateWater(
      (state) => {
        const list = (state.water ??= []);
        const index = list.findIndex((item) => item.id === entry.id);
        if (index >= 0) list[index] = { ...list[index], ...entry };
        else if (id)
          throw new CareInputError(t("ui.this-water-entry-has-been-deleted"));
        else list.push(entry);
      },
      t("ui.water-logged"),
      id ? undefined : day,
    );
    return saved ? entry : null;
  }
  function findQuickWater(state: WaterState, entry: WaterEntry) {
    return state.water?.find(
      (record) =>
        record.id === entry.id &&
        record.amount === entry.amount &&
        record.day === entry.day &&
        record.time === entry.time,
    );
  }
  function renderQuickWaterFeedback(state: WaterState, day: number) {
    if (quickWaterEntry && !findQuickWater(state, quickWaterEntry))
      quickWaterEntry = null;
    $("today-water-feedback").hidden = quickWaterEntry?.day !== day;
  }
  const quickWaterButton = $<HTMLButtonElement>("today-water-quick");
  async function quickAddWater() {
    if (quickWaterButton.disabled || selectedDay() !== today()) return;
    quickWaterButton.disabled = true;
    try {
      const entry = await addWater(250);
      if (!entry) return;
      quickWaterEntry = entry;
      $("today-water-message").textContent = t(
        "ui.logged-value-ml",
        numbers.format(entry.amount),
      );
      renderQuickWaterFeedback(getState(), selectedDay());
      clearTimeout(quickWaterTimer);
      quickWaterTimer = setTimeout(expireQuickFeedback, 6000);
    } finally {
      quickWaterButton.disabled = false;
    }
  }
  $("today-water-dismiss").addEventListener("click", () => {
    dismissQuickFeedback();
    renderQuickWaterFeedback(getState(), selectedDay());
    quickWaterButton.focus({ preventScroll: true });
  });
  $("today-water-undo").addEventListener("click", async () => {
    const entry = quickWaterEntry;
    if (!entry) return;
    if (
      await mutateWater(
        (state) => {
          const record = findQuickWater(state, entry);
          if (!record)
            throw new CareInputError(
              t("ui.this-entry-has-changed-or-been-removed"),
            );
          state.water = state.water!.filter((item) => item.id !== entry.id);
        },
        t("ui.water-entry-undone"),
        entry.day,
      )
    )
      quickWaterButton.focus({ preventScroll: true });
  });

  function openWater(
    entry?: WaterEntry | null,
    target?: WaterTarget | null,
    { focusAmount = false } = {},
  ) {
    dialog.toggleAttribute("data-family-editor", Boolean(target));
    paintFeature(
      dialog,
      <WaterLogForm
        key={++formKey}
        dialog={dialog}
        entry={entry}
        target={target}
        focusAmount={focusAmount}
        actionDay={actionDay()}
        today={today}
        formatDay={formatDay}
        refreshFields={refreshFields}
        save={({ amount, day, time }) => addWater(amount, day, time, entry?.id)}
      />,
    );
  }

  function fillGlass(container: string, progress: number) {
    $(container).querySelector<HTMLElement>(".water-glass")!.dataset.level =
      String(Math.min(4, Math.floor(progress * 4)));
  }

  function renderTodayWater(
    state: WaterState,
    day: number,
    total: number,
    goal: number,
    progress: number,
  ) {
    const future = day > today();
    const view = getFamilyView();
    $("today-water").hidden = future || view?.has("water") === false;
    $("today-water").querySelector<HTMLElement>("[data-open-water]")!.hidden =
      view?.canRecord("water", day) === false;
    $("future-schedule").hidden = !future;
    $("open-water-history").hidden = future;
    $("today-water-label").textContent =
      day === today()
        ? t("ui.todays-water")
        : t("ui.water-intake-for-this-day");
    $("today-water-total").textContent = numbers.format(total);
    $("today-water-goal").textContent = numbers.format(goal);
    $<HTMLProgressElement>("today-water-progress").value = progress;
    $("today-water-percent").textContent = percent.format(progress);
    $("today-water").toggleAttribute("data-goal-reached", total >= goal);
    quickWaterButton.hidden =
      day !== today() || view?.canRecord("water", day) === false;
    if (view) $("today-water-feedback").hidden = true;
    else renderQuickWaterFeedback(state, day);
    fillGlass("today-water", progress);
  }

  function renderWater(
    day: number,
    index: { waterOn(day: number): Iterable<WaterEntry> },
    total: number,
    goal: number,
    progress: number,
  ) {
    const view = getFamilyView();
    $("water-custom-action").hidden = $("water-entry").hidden =
      day > today() || view?.canRecord("water", day) === false;
    $<HTMLProgressElement>("water-progress").value = progress;
    $("water-date").textContent =
      day === today() ? t("ui.today") : formatShortDate(day);
    $("water-total").textContent = numbers.format(total);
    $("water-goal-label").textContent = numbers.format(goal);
    $("water-remaining").textContent =
      total >= goal
        ? t("ui.water-goal-reached")
        : t("ui.value-ml-to-reach-your-goal", numbers.format(goal - total));
    fillGlass("water-summary", progress);
    const entries = [...index.waterOn(day)]
      .reverse()
      .sort((a, b) => b.time.localeCompare(a.time));
    renderEntries($("water-entries"), {
      entries,
      view,
      label: (entry) =>
        t(
          "ui.value-ml-value",
          numbers.format(entry.amount),
          clockText(entry.time),
        ),
      edit: (entry) => openWater(entry),
      remove: (entry) => {
        if (confirm(t("ui.delete-this-water-entry")))
          void mutateWater(
            (data) => {
              data.water = data.water!.filter((item) => item.id !== entry.id);
            },
            t("ui.water-entry-deleted"),
            entry.day,
          );
      },
    });
  }

  return { openWater, addWater, quickAddWater, renderTodayWater, renderWater };
}
