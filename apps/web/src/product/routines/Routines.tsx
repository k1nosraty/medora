import { Fragment, type ReactNode } from "react";
import {
  listSeparator,
  localDigits,
  t,
} from "../../../product-assets/public/medication/shared/i18n/locale.js";
import {
  doseTime,
  timeText,
  type createCareIndex,
} from "../../../product-assets/public/medication/domain/care-index.js";
import { routineComplete } from "../../../product-assets/public/medication/domain/routine-plan.js";
import { fitDialogToViewport } from "../../../product-assets/public/medication/shared/ui/dom.js";
import { setPressed } from "../../../product-assets/public/medication/shared/ui/controls.js";
import type { CareState, FamilyView } from "../product";
import type { installDeletion } from "../DeleteConfirmation";
import { PlanDayCard, PlanOptions, Icon } from "../PlanCard";
import { clearFeature, mountCard, paintFeature } from "../renderer";
import { RoutineArtwork, RoutineEditor } from "./RoutineEditor";
import { RoutineLog } from "./RoutineLog";
import {
  colorOf,
  deleteRoutine,
  displayAmount,
  labelFor,
  pauseRoutine,
  saveProgress,
  saveRoutine,
  weekdayLabels,
  type Activity,
  type Progress,
  type RoutinePlan,
  type RoutineEntry,
  type RoutineTarget,
} from "./model";

type CardOptions = {
  manage?: boolean;
  readOnly?: boolean;
  dayCard?: boolean;
  featured?: boolean;
  summaryOnly?: boolean;
  calendar?: boolean;
  focusStatus?: string | undefined;
};
interface Dependencies {
  getState(): CareState | undefined;
  getFamilyView(): FamilyView | null;
  today(): number;
  formatDay(day: number, weekday?: boolean): string;
  mutate(
    change: (state: CareState) => void,
    success: string,
    scheduleChanged?: boolean,
    day?: number,
  ): Promise<boolean>;
  render(): void;
  refreshFields(host: HTMLElement): void;
  requestDeletion: ReturnType<typeof installDeletion>;
}

const field = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById("routine-" + id)! as T;
const normalizeSearch = (value: string) =>
  value
    .toLowerCase()
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\s‌-]+/g, "");
const failure = () => document.getElementById("status")?.textContent ?? "";

export function installRoutines({
  getState,
  getFamilyView,
  today,
  formatDay,
  mutate,
  render,
  refreshFields,
  requestDeletion,
}: Dependencies) {
  const editor = field<HTMLDialogElement>("editor");
  const log = field<HTMLDialogElement>("log-dialog");
  const category = field<HTMLDialogElement>("category-dialog");
  const fitEditor = fitDialogToViewport(editor);
  const fitLog = fitDialogToViewport(log);
  const fitCategory = fitDialogToViewport(category);
  for (const dialog of [editor, log, category])
    dialog.addEventListener("close", () => {
      if (!dialog.open) clearFeature(dialog);
    });

  function openEditor(plan?: RoutinePlan, target?: RoutineTarget) {
    if (editor.open || (getFamilyView() && !target)) return;
    editor.toggleAttribute("data-family-editor", Boolean(target));
    paintFeature(
      editor,
      <RoutineEditor
        dialog={editor}
        categoryDialog={category}
        fitCategory={fitCategory}
        day={today()}
        remindersEnabled={Boolean(getState()?.reminders?.enabled)}
        plan={plan}
        target={target}
        refreshFields={refreshFields}
        save={(plan, previous) =>
          mutate(
            (state) => saveRoutine(state, plan, previous),
            t("ui.routine-saved"),
            plan.reminder || Boolean(previous?.reminder),
            today(),
          )
        }
        pause={(plan) =>
          mutate(
            (state) => pauseRoutine(state, plan),
            t(plan.paused ? "ui.routine-resumed" : "ui.routine-paused"),
            plan.reminder,
            today(),
          )
        }
        remove={(plan) =>
          requestDeletion({
            title: t("ui.delete-routine"),
            message: t("ui.delete-value-its-history-will-be-kept", plan.name),
            change: (state) => deleteRoutine(state, plan),
            success: t("ui.routine-deleted"),
            parent: editor.id,
          })
        }
        failure={failure}
      />,
    );
    editor.showModal();
    fitEditor();
  }

  function focusLogAction(id: string) {
    const row = document.querySelector(
      `[data-screen]:not([hidden]) [data-routine-id="${CSS.escape(id)}"]`,
    );
    (
      row?.querySelector<HTMLElement>(
        ".plan-panel-actions > button, .day-card-actions > button",
      ) ?? row?.querySelector<HTMLElement>(".day-card-more > summary")
    )?.focus({ preventScroll: true });
  }
  const saveLog = (activity: Activity, result: Progress) =>
    mutate(
      (state) => saveProgress(state, activity, result, today()),
      t("ui.routine-progress-saved"),
      activity.day === today() && Boolean(activity.plan?.reminder),
      activity.day,
    );
  function openLog(activity: Activity) {
    if (log.open || getFamilyView()) return;
    const { entry, day, readOnly } = activity;
    const flags = {
      dayCard: true,
      readOnly: Boolean(readOnly),
      summaryOnly: true,
    };
    paintFeature(
      log,
      <RoutineLog
        activity={activity}
        dialog={log}
        banner={
          <article {...cardAttributes(entry, day, flags)}>
            {contents(entry, day, flags)}
          </article>
        }
        save={(result) => saveLog(activity, result)}
        failure={failure}
        onSaved={() => focusLogAction(entry.id)}
      />,
    );
    log.showModal();
    fitLog();
    if (!readOnly) {
      if (entry.mode === "quantity") field("amount").focus();
      else if (entry.mode === "done") field("log-save").focus();
    }
  }
  function openReminder(entry: RoutineEntry | undefined, day: number) {
    if (!entry) {
      document.getElementById("status")!.textContent = t(
        "ui.this-routine-occurrence-is-no-longer-available",
      );
      return;
    }
    const state = getState();
    const plan = state?.routines?.[entry.id];
    openLog({
      entry,
      day,
      plan,
      recorded: state?.routineLogs?.[day]?.[entry.id],
      readOnly: day > today() || !plan || Boolean(routineComplete(entry)),
    });
  }

  function cardAttributes(
    entry: RoutineEntry,
    day: number,
    flags: CardOptions,
  ) {
    const { dayCard, featured, readOnly, summaryOnly, manage } = flags;
    const state = getState();
    const plan = state?.routines?.[entry.id];
    return {
      className: dayCard ? "day-card" : "routine-row plan-panel-row",
      "data-ink": colorOf(
        (!readOnly && day === today() ? plan?.color : undefined) ?? entry.color,
      ),
      "data-card-kind": dayCard ? "routine" : undefined,
      "data-featured": featured ? "" : undefined,
      "data-routine-id": summaryOnly ? undefined : entry.id,
      "data-focus-scope": "routine:" + entry.id,
      "data-complete":
        !getFamilyView() &&
        !manage &&
        !readOnly &&
        !summaryOnly &&
        plan &&
        day <= today()
          ? String(Boolean(routineComplete(entry)))
          : undefined,
    };
  }

  function contents(entry: RoutineEntry, day: number, flags: CardOptions) {
    const {
      dayCard,
      featured,
      readOnly,
      summaryOnly,
      manage,
      calendar,
      focusStatus,
    } = flags;
    const state = getState();
    const plan = state?.routines?.[entry.id];
    const recorded = state?.routineLogs?.[day]?.[entry.id];
    const view = getFamilyView();
    const completed = Boolean(routineComplete(entry));
    const art = (
      <RoutineArtwork
        category={entry.category}
        color={cardAttributes(entry, day, flags)["data-ink"]}
      />
    );
    const clock = entry.minute == null ? "" : timeText(entry.minute);
    const detail = [labelFor(entry.category)];
    if (manage) {
      detail.push(
        entry.paused
          ? t("ui.paused")
          : entry.mask === 127 && entry.interval === 1
            ? t("ui.every-day")
            : weekdayLabels
                .filter((_, index) => (entry.mask ?? 0) & (1 << index))
                .join(listSeparator),
      );
      if (!entry.paused && (entry.interval ?? 1) > 1)
        detail.push(t("ui.every-value-weeks", localDigits(entry.interval)));
      if (!entry.paused && entry.start !== undefined && entry.start > today())
        detail.push(t("ui.from-value", formatDay(entry.start)));
    } else if (entry.mode === "quantity")
      detail.push(
        t(
          "ui.value-of-value",
          localDigits(entry.amount ?? 0),
          displayAmount(entry, entry.target ?? 0),
        ),
      );
    else if (entry.mode === "steps")
      detail.push(
        t(
          "ui.value-of-value-steps",
          localDigits(entry.checked?.length ?? 0),
          localDigits(entry.steps?.length ?? 0),
        ),
      );
    if (!dayCard && clock) detail.push(localDigits(clock));

    let action: ReactNode;
    let outsideBadge = false;
    let inlineBadge = false;
    const menu = t("ui.routine-options");
    const edit = (plan: RoutinePlan | undefined) =>
      plan && (
        <button
          type="button"
          className="secondary"
          aria-label={t("ui.edit-routine-value", entry.name)}
          onClick={() => openEditor(plan)}
        >
          {t("ui.edit")}
        </button>
      );
    if (!summaryOnly && view) {
      if (!manage && !readOnly && !completed && view.canRecord("routine", day))
        action = (
          <button
            type="button"
            className="secondary care-record-action"
            onClick={() =>
              view.record({
                kind: "routine",
                day,
                id: entry.id,
                title: entry.name,
                routine: entry,
              })
            }
          >
            {featured && <Icon name="check" />}
            {t(entry.mode === "done" ? "ثبت انجام" : "ثبت پیشرفت")}
          </button>
        );
    } else if (!summaryOnly) {
      if (manage) action = <PlanOptions label={menu}>{edit(plan)}</PlanOptions>;
      else {
        const activity = { entry, day, plan, recorded };
        const writable = !readOnly && day <= today() && Boolean(plan);
        const logLabel =
          entry.mode === "done"
            ? t(
                completed
                  ? dayCard
                    ? "برگشت ثبت"
                    : "انجام شد"
                  : dayCard
                    ? "انجام دادم"
                    : "ثبت انجام",
              )
            : t(completed ? "ui.edit-progress" : "ui.log-progress");
        const label =
          entry.mode === "done"
            ? t(
                completed
                  ? "برگشت ثبت {0}"
                  : dayCard
                    ? "انجام دادم، {0}"
                    : "ثبت انجام {0}",
                entry.name,
              )
            : t("ui.log-progress-for-value", entry.name);
        const logAction = writable && (
          <button
            type="button"
            className={"secondary" + (!completed ? " care-record-action" : "")}
            aria-pressed={entry.mode === "done" ? completed : undefined}
            aria-label={label}
            onClick={async () => {
              if (entry.mode !== "done") openLog(activity);
              else if (await saveLog(activity, !completed))
                focusLogAction(entry.id);
            }}
          >
            {featured && !completed && <Icon name="check" />}
            {logLabel}
          </button>
        );
        if (plan && (dayCard || !readOnly)) {
          const options = (
            <PlanOptions label={menu}>
              {!featured && completed && logAction}
              {edit(plan)}
            </PlanOptions>
          );
          action = featured ? (
            <>
              {logAction}
              {options}
            </>
          ) : (
            <>
              {options}
              {!completed && logAction}
            </>
          );
        }
        inlineBadge = !dayCard && completed && writable;
        outsideBadge = !dayCard && completed && !writable;
      }
    }
    const details = (
      <>
        <small>{detail.join(" · ")}</small>
        {dayCard && completed ? (
          <small className="routine-row-state">{t("ui.done")}</small>
        ) : (
          calendar && (
            <p className="badge">
              {t(
                recorded
                  ? "نیمه‌تمام"
                  : day < today() ||
                      (day === today() &&
                        entry.minute !== null &&
                        doseTime(day, entry.minute) <= Date.now())
                    ? "بدون ثبت"
                    : "برنامه‌ریزی‌شده",
              )}
            </p>
          )
        )}
        {!summaryOnly && view && (entry.notes || entry.sharedNotes) && (
          <p>{entry.notes || entry.sharedNotes}</p>
        )}
        {!summaryOnly && view && entry.recordedBy && (
          <small className="family-stamp">
            {t("ui.recorded-by-value", view.authorName(entry))}
          </small>
        )}
        {inlineBadge && (
          <span className="routine-row-state">{t("ui.done")}</span>
        )}
      </>
    );
    if (dayCard)
      return (
        <PlanDayCard
          label={t("ui.routine")}
          title={entry.name}
          titleId={summaryOnly ? "routine-log-title" : undefined}
          untimed={!featured}
          time={clock ? localDigits(clock) : null}
          dateTime={clock || undefined}
          art={art}
          details={details}
          actions={action}
          focusStatus={focusStatus}
        />
      );
    return (
      <>
        <span className="plan-panel-art">{art}</span>
        <div className="routine-row-copy plan-panel-copy">
          <strong dir="auto">{entry.name}</strong>
          {details}
        </div>
        {outsideBadge && (
          <span className="routine-row-state">{t("ui.done")}</span>
        )}
        {action && <div className="plan-panel-actions">{action}</div>}
      </>
    );
  }
  function card(entry: RoutineEntry, day: number, options: CardOptions = {}) {
    return mountCard(
      cardAttributes(entry, day, options),
      contents(entry, day, options),
    );
  }

  let filter = "today";
  let historyLimit = 14;
  const controls = [
    ...document.querySelectorAll<HTMLButtonElement>("[data-routine-filter]"),
  ];
  const searchField = field<HTMLInputElement>("search");
  const more = field<HTMLButtonElement>("more");
  for (const control of controls)
    control.addEventListener("click", () => {
      filter = control.dataset.routineFilter ?? "today";
      searchField.value = "";
      setPressed(controls, (item: HTMLButtonElement) => item === control);
      render();
    });
  searchField.addEventListener("input", () => {
    historyLimit = 14;
    render();
  });
  more.addEventListener("click", () => {
    historyLimit += 14;
    render();
  });

  function renderPanel(
    state: CareState,
    index: ReturnType<typeof createCareIndex>,
    day: number,
  ) {
    const plans = Object.values(state.routines ?? {});
    const entries: RoutineEntry[] = index.routinesOn(day);
    const logs = state.routineLogs ?? {};
    field("progress").textContent = entries.length
      ? t(
          "ui.value-of-value-routines-done",
          localDigits(entries.filter(routineComplete).length),
          localDigits(entries.length),
        )
      : t("ui.no-routines-for-this-day");
    controls.find(
      (control) => control.dataset.routineFilter === "today",
    )!.textContent = t(day === today() ? "ui.today" : "ui.this-day");
    field("search-wrap").hidden =
      filter === "today" ||
      (filter === "all" ? !plans.length : !Object.keys(logs).length);
    more.hidden = true;
    const search = normalizeSearch(searchField.value);
    const matches = (entry: { name: string; category: string }) =>
      normalizeSearch(entry.name + " " + labelFor(entry.category)).includes(
        search,
      );
    const card = (entry: RoutineEntry, date: number, flags: CardOptions) => (
      <article key={entry.id} {...cardAttributes(entry, date, flags)}>
        {contents(entry, date, flags)}
      </article>
    );
    const noPlans = t(
      getFamilyView()
        ? "روتینی ثبت نشده است."
        : "اولین روتین خودتان را بسازید.",
    );
    let rows: ReactNode[];
    let empty: string;
    if (filter === "all") {
      rows = plans
        .filter(matches)
        .sort((a, b) => Number(a.paused) - Number(b.paused))
        .map((entry) => card(entry, day, { manage: true }));
      empty = plans.length ? t("ui.no-matching-routines") : noPlans;
    } else if (filter === "history") {
      const history = Object.entries(logs)
        .map(([day, rows]) => ({
          day: Number(day),
          rows: Object.entries(rows).filter(([, entry]) => matches(entry)),
        }))
        .filter(({ rows }) => rows.length)
        .sort((a, b) => b.day - a.day);
      more.hidden = history.length <= historyLimit;
      rows = history.slice(0, historyLimit).map(({ day, rows }) => (
        <Fragment key={day}>
          <h3 className="routine-day-heading">{formatDay(day, true)}</h3>
          {rows.map(([id, entry]) =>
            card({ ...entry, id }, day, { readOnly: true }),
          )}
        </Fragment>
      ));
      empty = t(
        search
          ? "روتینی با این نام پیدا نشد."
          : "هنوز پیشرفت روتینی ثبت نشده است.",
      );
    } else {
      rows = entries.map((entry) => card(entry, day, {}));
      empty = plans.length ? t("ui.no-routines-for-this-day") : noPlans;
    }
    paintFeature(
      field("list"),
      rows.length ? rows : <p className="empty">{empty}</p>,
    );
  }
  return { openEditor, openReminder, renderPanel, card };
}
