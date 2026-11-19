import { useLayoutEffect, useRef, useState } from "react";
import { t } from "../../../../../web/public/medication/shared/i18n/locale.js";
import { searchKey } from "../../../../../web/public/medication/shared/ui/controls.js";
import { timeZoneCity } from "../../../../../web/public/medication/shared/ui/time-zone-picker.js";
import { appearanceColors } from "../../../../../web/public/medication/features/medicines/appearance-options.js";
import { Icon, PlanArtwork } from "../PlanCard";
import { clearFeature, paintFeature } from "../renderer";
import { categoryGroups, categoryLabel } from "./categories";
import {
  initialVisit,
  readVisit,
  reminderSummary,
  type Visit,
  type VisitCare,
  type VisitDraft,
  type VisitTarget,
} from "./model";

export function VisitArtwork({
  category,
  color,
}: {
  category: string;
  color?: string | undefined;
}) {
  const specialty = category !== "general";
  return (
    <PlanArtwork
      id={specialty ? "visit-" + category : "visit"}
      fallback="visit"
      color={color === "green" ? undefined : color}
      className={
        "category-art visit-illustration" +
        (specialty ? " visit-specialty" : "")
      }
    />
  );
}

const aliases: Record<string, string> = {
  ent: "ENT",
  psychiatry: "روانپزشک",
  radiology: "اشعه ایکس رادیوگرافی x-ray",
  dental: "دندانپزشک dentist",
};
const reminderChoices = [
  [60, "ui.one-hour-before"],
  [120, "ui.two-hours-before"],
  [1440, "ui.one-day-before"],
] as const;

function CategoryChooser({
  dialog,
  selected,
  choose,
}: {
  dialog: HTMLDialogElement;
  selected: string;
  choose(category: string): void;
}) {
  const [query, setQuery] = useState("");
  const terms = query.split(/\s+/).map(searchKey).filter(Boolean);
  const matches = (key: string, label: string) =>
    terms.every((term) =>
      searchKey(`${label} ${key} ${aliases[key] ?? ""}`).includes(term),
    );
  const filtered = categoryGroups.flatMap(({ options }) =>
    options.filter(([key, label]) => matches(key, label)),
  );
  function select(category: string) {
    choose(category);
    dialog.close();
  }
  const label = t("ui.search-specialties-or-services");
  return (
    <>
      <div className="sheet-header">
        <Icon name="search" />
        <h2 id="visit-category-title">{t("ui.choose-a-visit-type")}</h2>
        <button
          className="icon-button"
          type="button"
          data-close="visit-category-dialog"
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
            id="visit-category-search"
            type="search"
            autoComplete="off"
            aria-label={label}
            placeholder={label}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing)
                return;
              event.preventDefault();
              if (filtered.length === 1 && filtered[0]) select(filtered[0][0]);
            }}
          />
        </label>
        <p
          id="visit-category-empty"
          className="empty"
          role="status"
          hidden={filtered.length > 0}
        >
          {t("ui.no-specialty-or-service-matches-that-search")}
        </p>
        <div id="visit-category-results">
          {categoryGroups.map(({ label, options }) => (
            <div
              className="visit-category-group"
              key={options[0]?.[0]}
              hidden={!options.some(([key, text]) => matches(key, text))}
            >
              {label && <h3>{label}</h3>}
              {options.map(([key, text]) => (
                <button
                  key={key}
                  type="button"
                  className="secondary"
                  data-category={key}
                  aria-pressed={key === selected}
                  hidden={!matches(key, text)}
                  onClick={() => select(key)}
                >
                  <VisitArtwork category={key} />
                  {text}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function VisitEditor({
  dialog,
  categoryDialog,
  state,
  visit,
  target,
  selectedDay,
  formatDay,
  refreshFields,
  save,
  failure,
  remove,
}: {
  dialog: HTMLDialogElement;
  categoryDialog: HTMLDialogElement;
  state: VisitCare;
  visit: Visit | undefined;
  target: VisitTarget | undefined;
  selectedDay: number | undefined;
  formatDay(day: number): string;
  refreshFields(container: HTMLElement): void;
  save(plan: Visit, editing: boolean): Promise<boolean>;
  failure(): string;
  remove(id: string): void;
}) {
  const [draft, setDraft] = useState(() =>
    initialVisit(state, visit, target, selectedDay),
  );
  const [id] = useState(() => visit?.id ?? crypto.randomUUID());
  const [error, setError] = useState("");
  const [errorAnchor, setErrorAnchor] = useState<"name" | "when" | "footer">(
    "footer",
  );
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const name = useRef<HTMLInputElement>(null);
  const dayPicker = useRef<HTMLButtonElement>(null);
  const timePicker = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (form.current) refreshFields(form.current);
  });
  function patch<K extends keyof VisitDraft>(key: K, value: VisitDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError("");
  }
  function chooseCategory() {
    clearFeature(categoryDialog);
    paintFeature(
      categoryDialog,
      <CategoryChooser
        dialog={categoryDialog}
        selected={draft.category}
        choose={(value) => patch("category", value)}
      />,
    );
    categoryDialog.showModal();
    categoryDialog
      .querySelector<HTMLInputElement>("#visit-category-search")
      ?.focus({ preventScroll: true });
  }
  async function submit() {
    if (saving.current) return;
    const plan = readVisit(id, draft);
    if (!plan.name || !Number.isInteger(plan.day) || !plan.time) {
      setErrorAnchor(plan.name ? "when" : "name");
      setError(t("ui.enter-a-title-date-and-time"));
      (!plan.name
        ? name
        : !Number.isInteger(plan.day)
          ? dayPicker
          : timePicker
      ).current?.focus();
      return;
    }
    saving.current = true;
    setErrorAnchor("footer");
    setPending(true);
    try {
      if (target) await target.save(plan);
      else if (await save(plan, Boolean(visit))) dialog.close();
      else setError(failure() || t("ui.could-not-save-try-again"));
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : t("ui.could-not-save-try-again"),
      );
    } finally {
      saving.current = false;
      setPending(false);
    }
  }

  const errorNode = (
    <p id="visit-error" role="alert" className="field-error">
      {error}
    </p>
  );
  const title = target
    ? t("ui.add-for-value", target.name)
    : t(visit ? "ui.edit-appointment" : "ui.new-appointment");
  return (
    <form
      id="visit-editor"
      className="sheet-form"
      ref={form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="sheet-header program-visit">
        <PlanArtwork id="visit-main" className="add-sheet-icon" />
        <h2 id="visit-form-title">{title}</h2>
        <button
          className="icon-button"
          type="button"
          data-close="visit-dialog"
          aria-label={t("ui.close")}
          onClick={() => dialog.close()}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="sheet-body">
        <label className="editor-field">
          {t("ui.clinician-or-appointment-name")}
          <input
            id="visit-name"
            ref={name}
            maxLength={120}
            required
            value={draft.name}
            onChange={(event) => patch("name", event.target.value)}
          />
        </label>
        {errorAnchor === "name" && errorNode}
        <div className="visit-when">
          <div className="picker-control" data-picker-host="">
            <label className="editor-field">
              {t("ui.appointment-date")}
              <input
                id="visit-day"
                type="date"
                required
                hidden
                value={draft.day}
                onInput={(event) => patch("day", event.currentTarget.value)}
              />
            </label>
            <button
              className="secondary picker-field"
              type="button"
              ref={dayPicker}
            />
          </div>
          <div className="picker-control" data-picker-host="">
            <label className="editor-field">
              {t("ui.appointment-time")}
              <input
                id="visit-time"
                type="time"
                step="1"
                required
                hidden
                value={draft.time}
                onInput={(event) => patch("time", event.currentTarget.value)}
              />
            </label>
            <button
              className="secondary picker-field"
              type="button"
              ref={timePicker}
            />
          </div>
        </div>
        {errorAnchor === "when" && errorNode}
        <p id="visit-zone-summary" className="quiet">
          {t("ui.clinic-zone-appointment-value", timeZoneCity(draft.zone))}
        </p>
        <label className="editor-field">
          {t("ui.location")}
          <input
            id="visit-place"
            maxLength={160}
            value={draft.place}
            onChange={(event) => patch("place", event.target.value)}
          />
        </label>
        <details
          id="visit-appearance"
          className="editor-options appearance-options"
          data-ink={draft.color}
        >
          <summary>
            <span className="appearance-dot" aria-hidden="true" />
            {t("ui.visit-appearance-optional")}
          </summary>
          <div
            id="visit-appearance-preview"
            className="appearance-poster"
            aria-hidden="true"
          >
            <VisitArtwork category={draft.category} color={draft.color} />
          </div>
          <div className="appearance-type">
            <span id="visit-type-label">{t("ui.visit-type")}</span>
            <button
              id="visit-category-open"
              type="button"
              className="secondary appearance-type-picker"
              aria-haspopup="dialog"
              aria-labelledby="visit-type-label visit-category-selected"
              onClick={chooseCategory}
            >
              <span id="visit-category-selected">
                {categoryLabel(draft.category)}
              </span>
              <Icon name="search" />
            </button>
            <input id="visit-category" type="hidden" value={draft.category} />
          </div>
          <label
            className="editor-field"
            id="visit-category-name-field"
            hidden={draft.category !== "custom"}
          >
            {t("ui.custom-category-name-optional")}
            <input
              id="visit-category-name"
              dir="auto"
              maxLength={60}
              value={draft.categoryName}
              onChange={(event) => patch("categoryName", event.target.value)}
            />
          </label>
          <fieldset id="visit-colors" className="appearance-colors">
            <legend>{t("ui.visit-color")}</legend>
            <div className="visit-color-grid">
              {Object.entries(appearanceColors).map(([color, label]) => (
                <label key={color}>
                  <input
                    type="radio"
                    name="visit-color"
                    value={color}
                    data-ink={color}
                    checked={color === draft.color}
                    onChange={() => patch("color", color)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </details>
        <details
          id="visit-extra"
          className="editor-options"
          open={Boolean(visit?.note || visit?.contact)}
        >
          <summary>{t("ui.more-options")}</summary>
          <label className="editor-field">
            {t("ui.contact-information")}
            <input
              id="visit-contact"
              maxLength={160}
              value={draft.contact}
              onChange={(event) => patch("contact", event.target.value)}
            />
          </label>
          <label className="editor-field">
            {t("ui.notes")}
            <textarea
              id="visit-note"
              rows={2}
              maxLength={600}
              value={draft.note}
              onChange={(event) => patch("note", event.target.value)}
            />
          </label>
        </details>
        <details id="visit-reminder-options" className="editor-options">
          <summary>{t("ui.appointment-reminders-2")}</summary>
          <label className="feature-head editor-switch">
            {t("ui.remind-me-about-this-appointment")}
            <input
              id="visit-reminders-enabled"
              type="checkbox"
              role="switch"
              checked={!draft.remindersOff}
              onChange={(event) => patch("remindersOff", !event.target.checked)}
            />
          </label>
          <fieldset
            id="visit-reminder-offsets"
            className="reminder-options"
            hidden={draft.remindersOff}
          >
            <legend>{t("ui.early-reminders-optional")}</legend>
            {reminderChoices.map(([offset, label]) => (
              <label key={offset}>
                <input
                  name="visit-offset"
                  type="checkbox"
                  value={offset}
                  checked={draft.offsets.includes(offset)}
                  onChange={(event) =>
                    patch(
                      "offsets",
                      event.target.checked
                        ? [...draft.offsets, offset].sort((a, b) => a - b)
                        : draft.offsets.filter((value) => value !== offset),
                    )
                  }
                />
                {t(label)}
              </label>
            ))}
          </fieldset>
        </details>
        <p id="visit-reminder-summary" className="quiet" aria-live="polite">
          {reminderSummary(draft, visit, state, formatDay)}
        </p>
        {errorAnchor === "footer" && errorNode}
        <button type="submit" className="block-action" disabled={pending}>
          {target
            ? t("ui.save-for-value", target.name)
            : t("ui.save-appointment")}
        </button>
        <button
          type="button"
          className="text-button danger-link block-action"
          id="delete-edited-visit"
          hidden={!visit}
          onClick={() => visit && remove(visit.id)}
        >
          {t("ui.delete-appointment")}
        </button>
        <button
          type="button"
          className="text-button block-action"
          data-close="visit-dialog"
          onClick={() => dialog.close()}
        >
          {t("ui.cancel")}
        </button>
      </div>
    </form>
  );
}
