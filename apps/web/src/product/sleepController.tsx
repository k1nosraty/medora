import { TodaySleep } from "./TodaySleep";
import { renderSleepChart, renderSleepHistory } from "./SleepHistory";
import { equalCareValues } from "../../product-assets/public/medication/domain/care-contract.js";
import { localZone } from "../../product-assets/public/medication/domain/care-plan.js";
import { isoDay } from "../../product-assets/public/medication/domain/care-index.js";
import {
  sleepConflicts,
  sleepDay,
  sleepIsEnabled,
  sleepMinutes,
  sleepReport,
  sleepWall,
  validSleepRecord,
} from "../../product-assets/public/medication/domain/sleep.js";
import {
  localDigits,
  locale,
  t,
  weekIndex,
} from "../../product-assets/public/medication/shared/i18n/locale.js";
import { CareInputError } from "../../product-assets/public/medication/shared/ui/care-error.js";
import { setPressed } from "../../product-assets/public/medication/shared/ui/controls.js";
import { sleepDuration } from "../../product-assets/public/medication/features/sleep/presentation.js";
import { SleepForm, type SleepRecord, type WakeDraft } from "./SleepForm";
import { paintFeature } from "./renderer";
import type { CareState } from "./product";
import type { installDeletion } from "./DeleteConfirmation";
import type { calendarFormat } from "../../product-assets/public/medication/shared/ui/calendar-format.js";

type Records = Record<string, SleepRecord>;
interface Options {
  getState(): CareState | undefined;
  getFamilyView(): object | null;
  getDates(): ReturnType<typeof calendarFormat>;
  mutate(change: (state: CareState) => void, success: string): Promise<boolean>;
  today(): number;
  actionDay(): number;
  requestDeletion: ReturnType<typeof installDeletion>;
  refreshFields(host: HTMLElement): void;
  render(): void;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id)! as T;

const number = new Intl.NumberFormat(locale).format;
const timeOf = (at: number, zone: string) =>
  localDigits(sleepWall(at, zone).time);
const pending = (rows?: Records) =>
  Object.entries(rows ?? {}).find(([, row]) => row.end === null);
const completed = (rows?: Records) =>
  Object.entries(rows ?? {})
    .filter(
      (entry): entry is [string, SleepRecord & { end: number }] =>
        entry[1].end !== null,
    )
    .sort((a, b) => b[1].end - a[1].end);

export function installSleep({
  getState,
  getFamilyView,
  getDates,
  mutate,
  today,
  actionDay,
  requestDeletion,
  refreshFields,
  render,
}: Options) {
  const dialog = $<HTMLDialogElement>("sleep-dialog");
  let formKey = 0;
  let period: "week" | "month" = "week";
  let selection: number | undefined;
  let chartDay: number | undefined;

  function save(
    row: SleepRecord,
    id?: string,
    expected?: SleepRecord,
    draft?: WakeDraft,
  ) {
    return mutate(
      (state) => {
        if (!sleepIsEnabled(state))
          throw new CareInputError(t("ui.sleep-disabled"));
        const rows = (state.sleepRecords ??= {});
        if (id && !equalCareValues(rows[id], expected))
          throw new CareInputError(t("ui.sleep-entry-changed"));
        if (!validSleepRecord(row) || (row.end ?? row.start) > Date.now())
          throw new CareInputError(t("ui.sleep-invalid-time"));
        if (sleepConflicts(rows, row, id))
          throw new CareInputError(t("ui.sleep-overlap"));
        rows[id ?? crypto.randomUUID()] = row;
        if (draft && equalCareValues(state.sleepDraftWake, draft))
          delete state.sleepDraftWake;
      },
      t(row.end === null ? "ui.sleep-start-saved" : "ui.sleep-saved"),
    );
  }

  function open(id?: string, draft?: WakeDraft, selectedDay?: number) {
    const state = getState();
    if (!state || dialog.open || getFamilyView() || !sleepIsEnabled(state))
      return;
    const original = id ? state.sleepRecords?.[id] : undefined;
    if (id && !original) return;
    const zone = original?.zone ?? draft?.zone ?? localZone() ?? "UTC";
    const day = Math.min(selectedDay ?? actionDay(), today());
    paintFeature(
      dialog,
      <SleepForm
        key={++formKey}
        dialog={dialog}
        day={isoDay(day)}
        record={original}
        draft={draft}
        zone={zone}
        refreshFields={refreshFields}
        save={(record) => save(record, id, original, draft)}
        saveError={() => $("status").textContent ?? ""}
      />,
    );
  }

  async function startSleep() {
    if (getFamilyView() || pending(getState()?.sleepRecords)) return false;
    return save({
      start: Date.now(),
      end: null,
      zone: localZone() ?? "UTC",
      kind: "main",
      quality: "",
    });
  }

  async function wakeSleep() {
    if (getFamilyView()) return false;
    const openRecord = pending(getState()?.sleepRecords);
    const now = Date.now();
    if (openRecord)
      return save({ ...openRecord[1], end: now }, openRecord[0], openRecord[1]);
    const draft = { at: now, zone: localZone() ?? "UTC" };
    if (
      await mutate((state) => {
        state.sleepDraftWake = draft;
      }, t("ui.sleep-wake-saved"))
    )
      open(undefined, draft);
    return false;
  }

  function manualSleep(past = false) {
    if (past && actionDay() < today()) {
      open(undefined, undefined, actionDay());
      return;
    }
    const state = getState();
    const active = pending(state?.sleepRecords);
    open(active?.[0], active ? undefined : state?.sleepDraftWake);
  }

  const startControl = $<HTMLButtonElement>("sleep-start-now");
  const wakeControl = $<HTMLButtonElement>("sleep-wake-now");
  startControl.addEventListener("click", async () => {
    startControl.disabled = true;
    try {
      if (await startSleep()) wakeControl.focus();
    } finally {
      startControl.disabled = false;
    }
  });
  wakeControl.addEventListener("click", async () => {
    wakeControl.disabled = true;
    try {
      await wakeSleep();
    } finally {
      wakeControl.disabled = false;
    }
  });
  $("sleep-manual").addEventListener("click", () => manualSleep());

  function paintToday(
    state: CareState,
    day: number,
    visible: boolean,
    compact: boolean,
    history: () => void,
  ) {
    const now = today();
    const active = day === now ? pending(state.sleepRecords) : null;
    const last = completed(state.sleepRecords).find(
      ([, row]) => sleepDay(row) === day,
    )?.[1];
    const summary = active
      ? t("ui.sleep-in-progress")
      : last
        ? sleepDuration(sleepMinutes(last))
        : "";
    const detail = active
      ? t("ui.sleep-since", timeOf(active[1].start, active[1].zone))
      : last
        ? t(
            "ui.sleep-times",
            timeOf(last.start, last.zone),
            timeOf(last.end, last.zone),
          )
        : "";
    const host = $("today-sleep");
    paintFeature(
      host,
      <TodaySleep
        host={host}
        day={day}
        today={now}
        visible={visible}
        compact={compact}
        personal={!getFamilyView()}
        active={Boolean(active)}
        summary={summary}
        detail={detail}
        draft={state.sleepDraftWake}
        start={startSleep}
        wake={wakeSleep}
        manual={() => manualSleep(true)}
        history={history}
      />,
    );
  }

  function range(state: CareState | undefined) {
    const cursor = selection ?? today();
    const dates = getDates();
    const first =
      period === "week" ? cursor - weekIndex(cursor) : dates.monthStart(cursor);
    const last =
      period === "week" ? first + 6 : dates.monthStart(first + 32) - 1;
    return { first, last, ...sleepReport(state?.sleepRecords, first, last) };
  }
  for (const mode of ["week", "month"] as const)
    $(`sleep-${mode}`).addEventListener("click", () => {
      period = mode;
      selection = undefined;
      chartDay = undefined;
      setPressed(
        [$("sleep-week"), $("sleep-month")],
        (control: HTMLElement) => control.id === `sleep-${period}`,
      );
      render();
    });
  for (const [direction, offset] of [
    ["previous", -1],
    ["next", 1],
  ] as const)
    $(`sleep-${direction}`).addEventListener("click", () => {
      const { first, last } = range(getState());
      selection = offset > 0 ? last + 1 : first - 1;
      chartDay = undefined;
      render();
    });

  function draw(state: CareState) {
    const rows = state.sleepRecords ?? {};
    const active = pending(rows);
    const latest = completed(rows)[0]?.[1];
    const status = $("sleep-banner-status");
    status.hidden = !active && !latest;
    status.textContent = active
      ? t("ui.sleep-in-progress")
      : latest
        ? sleepDuration(sleepMinutes(latest))
        : "";
    $("sleep-banner-detail").textContent = active
      ? t("ui.sleep-since", timeOf(active[1].start, active[1].zone))
      : latest
        ? t(
            "ui.sleep-times",
            timeOf(latest.start, latest.zone),
            timeOf(latest.end, latest.zone),
          )
        : t("ui.sleep-empty");
    $("sleep-actions").hidden = Boolean(getFamilyView());
    $("sleep-start-now").hidden = Boolean(active);
    const draft = !getFamilyView() ? state.sleepDraftWake : null;
    $("sleep-manual").textContent = t(
      draft && !active ? "ui.sleep-finish-draft" : "ui.sleep-manual",
    );
    const { first, last, nights, average, naps } = range(state);
    const dates = getDates();
    const chart = $("sleep-chart");
    chart.dataset.period = period;
    $("sleep-range").textContent = t(
      "ui.sleep-range",
      dates.shortDate(first),
      dates.shortDate(last),
    );
    $<HTMLButtonElement>("sleep-next").disabled = last >= today();
    const metrics = [];
    if (average !== null)
      metrics.push(
        t("ui.sleep-average", sleepDuration(average), number(nights.size)),
      );
    if (naps) metrics.push(t("ui.sleep-nap-total", sleepDuration(naps)));
    if (state.sleepSettings?.goal)
      metrics.push(
        t("ui.sleep-goal-value", sleepDuration(state.sleepSettings.goal)),
      );
    $("sleep-average").textContent = metrics.join(" · ") || t("ui.sleep-empty");
    const scale = Math.max(600, ...nights.values());
    const cells = Array.from({ length: last - first + 1 }, (_, index) => {
      const day = first + index,
        minutes = nights.get(day);
      return {
        day,
        number: dates.dayNumber(day),
        selected: day === chartDay,
        size: ((minutes ?? 0) / scale) * 100 + "%",
        label:
          dates.formatDay(day, true) +
          " · " +
          (minutes === undefined
            ? t("ui.sleep-no-record")
            : sleepDuration(minutes)),
        choose() {
          chartDay = chartDay === day ? undefined : day;
          render();
        },
      };
    });
    renderSleepChart(chart, cells);
    const entries = Object.entries(rows)
      .sort((a, b) => (b[1].end ?? b[1].start) - (a[1].end ?? a[1].start))
      .filter(([, row]) =>
        chartDay === undefined
          ? row.end === null ||
            (sleepDay(row) >= first && sleepDay(row) <= last)
          : sleepDay(row) === chartDay,
      );
    $("sleep-empty").hidden = Boolean(entries.length);
    const personal = !getFamilyView();
    renderSleepHistory(
      $("sleep-history"),
      entries.map(([id, row]) => ({
        id,
        title:
          row.end === null
            ? t("ui.sleep-in-progress")
            : t(row.kind === "main" ? "ui.sleep-main" : "ui.sleep-nap") +
              " · " +
              sleepDuration(sleepMinutes(row)),
        when:
          dates.formatDay(sleepDay(row), true) +
          " · " +
          (row.end === null
            ? timeOf(row.start, row.zone)
            : t(
                "ui.sleep-times",
                timeOf(row.start, row.zone),
                timeOf(row.end, row.zone),
              )),
        quality: row.quality ? t(`ui.sleep-${row.quality}`) : "",
        note: row.note ?? "",
        actions: personal
          ? {
              editLabel: t("ui.edit"),
              removeLabel: t("ui.delete"),
              edit: () => open(id),
              remove: () =>
                requestDeletion({
                  title: t("ui.sleep-delete"),
                  message: dates.formatDay(sleepDay(row)),
                  success: t("ui.sleep-deleted"),
                  change: (next) => {
                    if (!equalCareValues(next.sleepRecords?.[id], row))
                      throw new CareInputError(t("ui.sleep-entry-changed"));
                    delete next.sleepRecords?.[id];
                  },
                }),
            }
          : null,
      })),
    );
  }
  return {
    open,
    draw,
    paintToday,
    focusDay(day?: number) {
      selection = chartDay = day;
      render();
      $("sleep-history-title").scrollIntoView({ block: "nearest" });
    },
    reset() {
      period = "week";
      selection = chartDay = undefined;
      dialog.close();
    },
  };
}
