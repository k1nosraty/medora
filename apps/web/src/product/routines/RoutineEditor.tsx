import { useLayoutEffect, useRef, useState } from "react";
import {
  language,
  t,
} from "../../../product-assets/public/medication/shared/i18n/locale.js";
import { appearanceColors } from "../../../product-assets/public/medication/features/medicines/appearance-options.js";
import { routineCategories } from "../../../product-assets/public/medication/features/routines/catalog.js";
import { searchKey } from "../../../product-assets/public/medication/shared/ui/controls.js";
import { Icon, PlanArtwork } from "../PlanCard";
import { clearFeature, paintFeature } from "../renderer";
import {
  categoryOf,
  colorOf,
  initialDraft,
  labelFor,
  planFromDraft,
  RoutineInputError,
  weekdayLabels,
  type RoutineDraft,
  type RoutineMode,
  type RoutinePlan,
  type RoutineTarget,
} from "./model";

export function RoutineArtwork({
  category,
  color,
}: {
  category: string;
  color?: string | undefined;
}) {
  const key = categoryOf(category);
  return (
    <PlanArtwork
      id={key === "custom" ? "routine" : "routine-" + key}
      fallback="routine"
      color={color === colorOf(undefined) ? undefined : color}
      className="category-art routine-illustration"
    />
  );
}

function RoutineCategories({
  dialog,
  category,
  choose,
}: {
  dialog: HTMLDialogElement;
  category: string;
  choose(key: string): void;
}) {
  const [query, setQuery] = useState("");
  const terms = query.split(/\s+/).map(searchKey).filter(Boolean);
  const groups = Object.entries(routineCategories).map(
    ([label, categories]) => ({
      label: t(label),
      choices: Object.entries(categories).map(([id, text]) => ({
        id,
        text: t(text),
        hidden: !terms.every((term) =>
          searchKey(t(label) + " " + t(text)).includes(term),
        ),
      })),
    }),
  );
  const matches = groups
    .flatMap((group) => group.choices)
    .filter((choice) => !choice.hidden);
  function select(key: string) {
    choose(key);
    dialog.close();
  }
  const search = t("ui.search-routine-types-or-sports");
  return (
    <>
      <div className="sheet-header">
        <svg aria-hidden="true">
          <use href="/medication/assets/icons/routines.svg#custom" />
        </svg>
        <h2 id="routine-category-title">{t("ui.routine-type")}</h2>
        <button
          type="button"
          className="icon-button"
          data-close="routine-category-dialog"
          aria-label={t("ui.close")}
          onClick={() => dialog.close()}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="sheet-body">
        <label className="choice-search cabinet-search">
          <Icon name="search" />
          <input
            id="routine-category-search"
            type="search"
            aria-label={search}
            placeholder={search}
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing)
                return;
              event.preventDefault();
              const choice = matches[0];
              if (matches.length === 1 && choice) select(choice.id);
            }}
          />
        </label>
        <div id="routine-categories">
          {groups.map((group) => (
            <section
              key={group.label}
              className="routine-category-group"
              hidden={group.choices.every((choice) => choice.hidden)}
            >
              <h3>{group.label}</h3>
              <div className="routine-category-grid">
                {group.choices.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    className="secondary"
                    data-category={choice.id}
                    aria-pressed={choice.id === category}
                    hidden={choice.hidden}
                    onClick={() => select(choice.id)}
                  >
                    <RoutineArtwork category={choice.id} />
                    <span>{choice.text}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
        <p
          id="routine-no-categories"
          className="empty"
          role="status"
          hidden={matches.length > 0}
        >
          {t("ui.no-matching-routine-types")}
        </p>
      </div>
    </>
  );
}

const dayOrder =
  language === "fa" ? [5, 6, 0, 1, 2, 3, 4] : [6, 0, 1, 2, 3, 4, 5];
const intervalOptions = [
  "ui.every-week",
  "ui.every-two-weeks",
  "ui.every-three-weeks",
  "ui.every-four-weeks",
];
const modes: [RoutineMode, string][] = [
  ["done", "ui.done"],
  ["quantity", "ui.quantity-goal"],
  ["steps", "ui.checklist"],
];
export function RoutineEditor({
  dialog,
  categoryDialog,
  fitCategory,
  remindersEnabled,
  day,
  plan,
  target,
  refreshFields,
  save,
  pause,
  remove,
  failure,
}: {
  dialog: HTMLDialogElement;
  categoryDialog: HTMLDialogElement;
  fitCategory(): void;
  remindersEnabled: boolean;
  day: number;
  plan: RoutinePlan | undefined;
  target: RoutineTarget | undefined;
  refreshFields(host: HTMLElement): void;
  save(plan: RoutinePlan, previous?: RoutinePlan): Promise<boolean>;
  pause(plan: RoutinePlan): Promise<boolean>;
  remove(plan: RoutinePlan): void;
  failure(): string;
}) {
  const [draft, setDraft] = useState(() => initialDraft(day, plan, target));
  const [id] = useState(() => plan?.id ?? crypto.randomUUID());
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const details = useRef<HTMLDetailsElement>(null);

  useLayoutEffect(() => {
    if (form.current) refreshFields(form.current);
  });
  function set<K extends keyof RoutineDraft>(key: K, value: RoutineDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError("");
  }
  function openCategory() {
    clearFeature(categoryDialog);
    paintFeature(
      categoryDialog,
      <RoutineCategories
        dialog={categoryDialog}
        category={draft.category}
        choose={(value) => set("category", value)}
      />,
    );
    categoryDialog.showModal();
    categoryDialog.scrollTop = 0;
    fitCategory();
    categoryDialog
      .querySelector<HTMLInputElement>("#routine-category-search")
      ?.focus({ preventScroll: true });
  }
  async function perform(action: () => Promise<boolean | void>) {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    try {
      const result = await action();
      if (result) dialog.close();
      else if (result === false)
        setError(failure() || t("ui.could-not-save-try-again"));
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : t("ui.could-not-save-try-again"),
      );
      if (problem instanceof RoutineInputError && problem.field) {
        if (problem.field !== "routine-name" && details.current)
          details.current.open = true;
        const field =
          form.current?.querySelector<HTMLElement>(
            '[data-for="' + problem.field + '"]',
          ) ?? document.getElementById(problem.field);
        field?.focus();
      }
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  const title = target
    ? t("ui.add-for-value", target.name)
    : t(plan ? "ui.edit-routine" : "ui.new-routine");
  return (
    <form
      className="sheet-form"
      id="routine-form"
      ref={form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void perform(async () => {
          const updated = planFromDraft(draft, id, plan);
          if (target) {
            await target.save(updated);
            return;
          }
          return save(updated, plan);
        });
      }}
    >
      <div className="sheet-header program-routine">
        <PlanArtwork id="routine-main" className="add-sheet-icon" />
        <h2 id="routine-editor-title">{title}</h2>
        <button
          type="button"
          className="icon-button"
          data-close="routine-editor"
          aria-label={t("ui.close")}
          onClick={() => dialog.close()}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="sheet-body routine-fields">
        <label className="editor-field">
          {t("ui.routine-name")}
          <input
            id="routine-name"
            dir="auto"
            maxLength={80}
            required
            placeholder={t("ui.e-g-morning-stretch")}
            value={draft.name}
            onChange={(event) => set("name", event.target.value)}
          />
        </label>
        <details
          id="routine-appearance"
          className="editor-options appearance-options"
          data-ink={draft.color}
        >
          <summary>
            <span className="appearance-dot" aria-hidden="true" />
            {t("ui.routine-appearance-optional")}
          </summary>
          <div
            id="routine-preview"
            className="appearance-poster"
            aria-hidden="true"
          >
            <RoutineArtwork category={draft.category} color={draft.color} />
          </div>
          <div className="appearance-type">
            <span id="routine-type-label">{t("ui.routine-type")}</span>
            <button
              id="routine-category-open"
              type="button"
              className="secondary appearance-type-picker"
              aria-haspopup="dialog"
              aria-labelledby="routine-type-label routine-category-label"
              onClick={openCategory}
            >
              <span id="routine-category-label">
                {labelFor(draft.category)}
              </span>
              <Icon name="search" />
            </button>
          </div>
          <fieldset id="routine-colors" className="appearance-colors">
            <legend>{t("ui.routine-color")}</legend>
            <div className="visit-color-grid">
              {Object.entries(appearanceColors).map(([color, label]) => (
                <label key={color}>
                  <input
                    type="radio"
                    name="routine-color"
                    data-ink={color}
                    value={color}
                    checked={color === draft.color}
                    onChange={() => set("color", color)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </details>
        <fieldset className="routine-schedule">
          <legend>{t("ui.repeat-2")}</legend>
          <select
            id="routine-repeat"
            aria-label={t("ui.repeat-2")}
            value={draft.weekly ? "weekly" : "daily"}
            onChange={(event) => set("weekly", event.target.value === "weekly")}
          >
            <option value="daily">{t("ui.every-day")}</option>
            <option value="weekly">{t("ui.selected-days")}</option>
          </select>
          <div
            id="routine-weekly"
            className="routine-fields"
            hidden={!draft.weekly}
          >
            <div
              id="routine-weekdays"
              className="weekdays"
              role="group"
              aria-label={t("ui.repeat-days")}
            >
              {dayOrder.map((day) => (
                <label key={day}>
                  <input
                    type="checkbox"
                    value={1 << day}
                    checked={Boolean(draft.mask & (1 << day))}
                    onChange={() => set("mask", draft.mask ^ (1 << day))}
                  />
                  {weekdayLabels[day]}
                </label>
              ))}
            </div>
            <label>
              {t("ui.repeat-interval")}
              <select
                id="routine-interval"
                value={draft.interval}
                onChange={(event) =>
                  set("interval", Number(event.target.value))
                }
              >
                {intervalOptions.map((label, i) => (
                  <option key={label} value={i + 1}>
                    {t(label)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>
        <details
          className="editor-options"
          id="routine-options"
          ref={details}
          open={Boolean(
            plan &&
            (plan.start !== day ||
              plan.minute !== null ||
              plan.mode !== "done" ||
              plan.notes),
          )}
        >
          <summary>{t("ui.goal-time-and-details")}</summary>
          <div className="routine-fields">
            <div className="routine-time-fields">
              <div className="picker-control" data-picker-host="">
                <label>
                  {t("ui.start-date")}
                  <input
                    id="routine-start"
                    type="date"
                    required
                    hidden
                    value={draft.start}
                    onInput={(event) => set("start", event.currentTarget.value)}
                  />
                </label>
                <button className="secondary picker-field" type="button" />
              </div>
              <div className="picker-control" data-picker-host="">
                <label>
                  {t("ui.routine-time")}
                  <input
                    id="routine-time"
                    type="time"
                    hidden
                    value={draft.time}
                    onInput={(event) => set("time", event.currentTarget.value)}
                  />
                </label>
                <button className="secondary picker-field" type="button" />
              </div>
            </div>
            <label className="routine-check">
              <input
                id="routine-reminder"
                type="checkbox"
                checked={draft.reminder}
                onChange={(event) => {
                  const reminder = event.target.checked;
                  setDraft((current) => ({
                    ...current,
                    reminder,
                    time: reminder && !current.time ? "08:00" : current.time,
                  }));
                  setError("");
                }}
              />
              {t("ui.notify-me-at-the-routine-time")}
            </label>
            <p
              id="routine-reminder-help"
              className="quiet"
              hidden={!draft.reminder || remindersEnabled}
            >
              {t("ui.enable-this-devices-notifications-in-settings-to-receive")}
            </p>
            <label>
              {t("ui.tracking-method")}
              <select
                id="routine-mode"
                value={draft.mode}
                onChange={(event) => {
                  const mode = modes.find(
                    ([mode]) => mode === event.target.value,
                  )?.[0];
                  if (mode) set("mode", mode);
                }}
              >
                {modes.map(([mode, label]) => (
                  <option key={mode} value={mode}>
                    {t(label)}
                  </option>
                ))}
              </select>
            </label>
            <div
              id="routine-target-fields"
              className="routine-time-fields"
              hidden={draft.mode !== "quantity"}
            >
              <label>
                {t("ui.target-amount")}
                <input
                  id="routine-target"
                  inputMode="numeric"
                  dir="ltr"
                  maxLength={5}
                  placeholder={t("ui.20")}
                  value={draft.amount}
                  onChange={(event) => set("amount", event.target.value)}
                />
              </label>
              <label>
                {t("ui.unit")}
                <input
                  id="routine-unit"
                  dir="auto"
                  maxLength={24}
                  placeholder={t("ui.minutes-pages-or-reps")}
                  value={draft.unit}
                  onChange={(event) => set("unit", event.target.value)}
                />
              </label>
            </div>
            <label id="routine-steps-field" hidden={draft.mode !== "steps"}>
              {t("ui.steps-one-per-line")}
              <textarea
                id="routine-steps"
                rows={3}
                dir="auto"
                maxLength={840}
                placeholder={"شست‌وشو\nمرطوب‌کننده\nضدآفتاب"}
                value={draft.steps}
                onChange={(event) => set("steps", event.target.value)}
              />
            </label>
            <label>
              {t("ui.note-optional")}
              <textarea
                id="routine-notes"
                rows={2}
                dir="auto"
                maxLength={320}
                value={draft.notes}
                onChange={(event) => set("notes", event.target.value)}
              />
            </label>
          </div>
        </details>
        <p id="routine-editor-status" role="alert" className="field-error">
          {error}
        </p>
        <button
          id="routine-save"
          type="submit"
          className="block-action"
          disabled={pending}
        >
          {target ? t("ui.save-for-value", target.name) : t("ui.save-routine")}
        </button>
        <div id="routine-management" hidden={!plan}>
          <button
            id="routine-pause"
            type="button"
            className="secondary"
            disabled={pending}
            onClick={() => plan && void perform(() => pause(plan))}
          >
            {t(plan?.paused ? "ui.resume-routine" : "ui.pause-routine")}
          </button>
          <button
            id="routine-delete"
            type="button"
            className="secondary danger"
            disabled={pending}
            onClick={() => plan && remove(plan)}
          >
            {t("ui.delete-routine")}
          </button>
        </div>
      </div>
    </form>
  );
}
