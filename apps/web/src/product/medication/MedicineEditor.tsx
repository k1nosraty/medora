import { useLayoutEffect, useRef, useState } from "react";
import { nextPlannedDose } from "../../../../../web/public/medication/features/medicines/next-dose.js";
import {
  amountText,
  doseUnit,
} from "../../../../../web/public/medication/features/medicines/quantity.js";
import {
  appearanceColors,
  medicineShapes,
} from "../../../../../web/public/medication/features/medicines/appearance-options.js";
import { timeText } from "../../../../../web/public/medication/domain/care-index.js";
import {
  listSeparator,
  localDigits,
  t,
} from "../../../../../web/public/medication/shared/i18n/locale.js";
import type { installPickers } from "../Pickers";
import { paintFeature } from "../renderer";
import { MedicineArt, medicineColor, medicineShape } from "./MedicineArt";
import {
  FieldError,
  fieldAttributes,
  MedicineSchedule,
  type DraftChange,
} from "./MedicineSchedule";
import {
  InvalidMedicineField,
  medicineDraft,
  validateDraft,
  weekdayBits,
  weekdays,
} from "./editorModel";
import type { MedicinePlan, MedicineTarget } from "./model";

type EditorProps = {
  dialog: HTMLDialogElement;
  appearance: HTMLDialogElement;
  medicine?: MedicinePlan | undefined;
  target?: MedicineTarget | undefined;
  pickers: ReturnType<typeof installPickers>;
  formatDay(day: number): string;
  save(plan: MedicinePlan): Promise<boolean>;
  remove(id: string): void;
  failure(): string;
};
const chapters = [
  {
    id: "editor-identity",
    label: "ui.name-form",
    title: "ui.which-medicine-are-you-taking",
  },
  {
    id: "editor-schedule",
    label: "ui.dose-schedule",
    title: "ui.when-and-how-much",
  },
  {
    id: "editor-confirm",
    label: "ui.review-save",
    title: "ui.review-your-schedule",
  },
] as const;

function draftSignature(draft: ReturnType<typeof medicineDraft>) {
  return JSON.stringify(draft, (key, value: unknown) =>
    key === "original" ? undefined : value,
  );
}

export function MedicineEditor({
  dialog,
  appearance,
  medicine,
  target,
  pickers,
  formatDay,
  save,
  remove,
  failure,
}: EditorProps) {
  const [draft, setDraft] = useState(() => medicineDraft(medicine, target));
  const [initialDraft] = useState(() => draftSignature(draft));
  const [id] = useState(() => medicine?.id ?? crypto.randomUUID());
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState<InvalidMedicineField | null>(
    null,
  );
  const [review, setReview] = useState<ReturnType<typeof validateDraft>>();
  const [submitting, setSubmitting] = useState(false);
  const pending = useRef(false);
  const focusTo = useRef<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const inventory = useRef<HTMLDetailsElement>(null);
  const appearanceSession = useRef(0);
  const tracked = medicine?.stock != null;

  function dismiss() {
    return (
      !pending.current &&
      (initialDraft === draftSignature(draft) ||
        confirm(t("ui.discard-medicine-draft")))
    );
  }
  useLayoutEffect(() => {
    const cancel = (event: Event) => {
      if (!dismiss()) event.preventDefault();
    };
    dialog.addEventListener("cancel", cancel);
    return () => dialog.removeEventListener("cancel", cancel);
  });
  useLayoutEffect(() => {
    if (!form.current) return;
    pickers.refresh(form.current);
    if (focusTo.current) {
      const field = document.getElementById(focusTo.current);
      const details = field?.closest("details");
      if (details) details.open = true;
      field?.focus({ preventScroll: true });
      focusTo.current = null;
    }
  });

  const change: DraftChange = (patch) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError("");
    setFieldError(null);
  };
  function go(next: number) {
    focusTo.current = chapters[next]!.id;
    dialog.scrollTop = 0;
    setError("");
    setFieldError(null);
    setStep(next);
  }
  function chooseAppearance() {
    const defaultUnit = (icon: string) =>
      icon === "sachet"
        ? t("ui.sachet")
        : icon === "powder"
          ? ""
          : t("ui.tablet");
    paintFeature(
      appearance,
      <Appearance
        key={++appearanceSession.current}
        dialog={appearance}
        icon={draft.icon}
        color={draft.color}
        select={(icon, color) =>
          change({
            icon,
            color,
            ...(!medicine && draft.unit === defaultUnit(draft.icon)
              ? { unit: defaultUnit(icon) }
              : {}),
          })
        }
      />,
    );
    appearance.showModal();
  }

  async function submit() {
    if (pending.current) return;
    setError("");
    setFieldError(null);
    try {
      if (step === 0) {
        if (!draft.name.trim()) {
          document.getElementById("name")?.focus();
          throw new Error(t("ui.enter-the-medicine-name"));
        }
        go(1);
        return;
      }
      const plan = validateDraft(draft, tracked, id);
      if (step === 1) {
        setReview(plan);
        go(2);
        return;
      }
      pending.current = true;
      setSubmitting(true);
      try {
        if (target) await target.save(plan);
        else if (await save(plan)) dialog.close();
        else setError(failure() || t("ui.could-not-save-try-again"));
      } finally {
        pending.current = false;
        setSubmitting(false);
      }
    } catch (problem) {
      if (problem instanceof InvalidMedicineField) {
        focusTo.current = problem.field;
        setFieldError(problem);
        if (step === 2) setStep(1);
      }
      setError(
        problem instanceof Error
          ? problem.message
          : t("ui.could-not-save-try-again"),
      );
    }
  }
  return (
    <form
      id="editor"
      className="sheet-form"
      data-step={step}
      data-phased={String(draft.phased)}
      ref={form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="sheet-header program-medicine">
        <img
          className="glass-object add-sheet-icon"
          data-art="bottle"
          src={
            document.body.dataset.finish === "matte"
              ? "/design/matte-3d/bottle.webp"
              : "/design/optical-glass/bottle.webp"
          }
          width={256}
          height={256}
          loading="lazy"
          alt=""
        />
        <h2 id="editor-title">
          {target
            ? t("ui.add-for-value", target.name)
            : medicine
              ? t("ui.edit-medicine")
              : t("ui.new-medicine")}
        </h2>
        <button
          className="icon-button"
          type="button"
          id="editor-close"
          aria-label={t("ui.close")}
          onClick={() => {
            if (dismiss()) dialog.close();
          }}
        >
          <svg aria-hidden="true">
            <use href="#i-close" />
          </svg>
        </button>
      </div>
      <div className="sheet-body">
        <ol
          id="editor-steps"
          className="wizard-steps"
          aria-label={t("ui.medicine-setup-steps")}
        >
          {chapters.map(({ label }, index) => (
            <li
              key={label}
              data-complete={String(index < step)}
              aria-current={index === step ? "step" : undefined}
            >
              <span>{localDigits(index + 1)}</span>
              {t(label)}
            </li>
          ))}
        </ol>
        <section
          data-editor-step="0"
          aria-labelledby="editor-identity"
          hidden={step !== 0}
        >
          <h3 id="editor-identity" tabIndex={-1}>
            {t(chapters[0].title)}
          </h3>
          <label className="editor-field">
            {t("ui.medicine-or-supplement-name")}
            <input
              id="name"
              maxLength={120}
              required
              aria-describedby="editor-status"
              value={draft.name}
              onChange={(event) => change({ name: event.target.value })}
            />
          </label>
          <button
            type="button"
            id="medicine-appearance"
            className="medicine appearance-tile"
            data-ink={draft.color}
            aria-label={t(
              "ui.appearance-optional-value-value",
              medicineShapes[medicineShape(draft.icon)],
              appearanceColors[medicineColor(draft.color)],
            )}
            onClick={chooseAppearance}
          >
            <span id="medicine-appearance-icon">
              <MedicineArt shape={draft.icon} color={draft.color} />
            </span>
            <span>{t("ui.appearance-optional")}</span>
            <svg aria-hidden="true">
              <use href="#i-expand" />
            </svg>
          </button>
          <input type="hidden" id="medicine-icon" value={draft.icon} />
          <input type="hidden" id="medicine-color" value={draft.color} />
        </section>
        <section
          data-editor-step="1"
          aria-labelledby="editor-schedule"
          hidden={step !== 1}
        >
          <h3 id="editor-schedule" tabIndex={-1}>
            {t(chapters[1].title)}
          </h3>
          <MedicineSchedule
            draft={draft}
            change={change}
            error={fieldError}
            formatDay={formatDay}
            pickers={pickers}
            focus={(field) => {
              focusTo.current = field;
            }}
            openInventory={() => {
              if (inventory.current) inventory.current.open = true;
              document.getElementById("unit")?.focus();
            }}
          />
          <details
            id="dose-instructions"
            className="editor-options"
            open={Boolean(medicine?.instructions)}
          >
            <summary>{t("ui.instructions-optional")}</summary>
            <label className="editor-field">
              {t("ui.dose-instructions")}
              <textarea
                id="instructions"
                rows={2}
                maxLength={600}
                value={draft.instructions}
                onChange={(event) =>
                  change({ instructions: event.target.value })
                }
              />
            </label>
          </details>
          <details
            id="inventory-options"
            className="editor-options"
            ref={inventory}
          >
            <summary>{t("ui.stock-and-dose-units")}</summary>
            <div className="fields">
              <label>
                {t("ui.dose-unit")}
                <input
                  {...fieldAttributes(fieldError, "unit")}
                  value={draft.unit}
                  maxLength={30}
                  required
                  readOnly={tracked}
                  onChange={(event) => change({ unit: event.target.value })}
                />
              </label>
              <FieldError error={fieldError} field="unit" />
              <label>
                {t("ui.initial-stock-optional")}
                <input
                  {...fieldAttributes(fieldError, "stock")}
                  dir="ltr"
                  inputMode="decimal"
                  maxLength={11}
                  value={draft.stock}
                  readOnly={tracked}
                  onChange={(event) => change({ stock: event.target.value })}
                />
              </label>
              <FieldError error={fieldError} field="stock" />
              <label
                id="threshold-field"
                hidden={!tracked && !draft.stock.trim()}
              >
                {t("ui.low-stock-alert-threshold")}
                <input
                  {...fieldAttributes(fieldError, "threshold")}
                  dir="ltr"
                  inputMode="decimal"
                  maxLength={11}
                  value={draft.threshold}
                  onChange={(event) =>
                    change({ threshold: event.target.value })
                  }
                />
              </label>
              <FieldError error={fieldError} field="threshold" />
            </div>
          </details>
        </section>
        <section
          data-editor-step="2"
          aria-labelledby="editor-confirm"
          hidden={step !== 2}
        >
          <h3 id="editor-confirm" tabIndex={-1}>
            {t(chapters[2].title)}
          </h3>
          <div id="editor-review">
            {review && (
              <Review
                plan={review}
                formatDay={formatDay}
                tracked={tracked}
                effectiveFrom={medicine?.effectiveFrom ?? 0}
              />
            )}
          </div>
        </section>
        <div className="editor-footer">
          <p id="editor-status" className="field-error" role="status">
            {error}
          </p>
          <div className="wizard-actions">
            <button type="submit" id="editor-next" disabled={submitting}>
              {step === 2
                ? target
                  ? t("ui.save-for-value", target.name)
                  : t("ui.save-medicine")
                : t("ui.continue")}
            </button>
            <button
              type="button"
              id="editor-back"
              className="secondary"
              hidden={step === 0}
              disabled={submitting}
              onClick={() => go(step - 1)}
            >
              {t("ui.previous-step")}
            </button>
          </div>
        </div>
        <button
          type="button"
          id="delete-edited-medication"
          className="text-button danger-link block-action"
          hidden={!medicine}
          disabled={submitting}
          onClick={() => {
            if (medicine) remove(medicine.id);
          }}
        >
          {t("ui.delete-medicine")}
        </button>
      </div>
    </form>
  );
}

function Review({
  plan,
  formatDay,
  tracked,
  effectiveFrom,
}: {
  plan: ReturnType<typeof validateDraft>;
  formatDay(day: number): string;
  tracked: boolean;
  effectiveFrom: number;
}) {
  const { name, phases, dates, stock, unit, threshold, phased, instructions } =
    plan;
  const next = nextPlannedDose(phases, dates, effectiveFrom);
  return (
    <>
      <h4 dir="auto">{name}</h4>
      <p className="review-upcoming">
        {next
          ? t(
              "ui.next-scheduled-dose-value-at-value",
              formatDay(next.day),
              localDigits(timeText(next.slot.minuteOfDay)),
            )
          : t("ui.this-schedule-has-no-upcoming-doses")}
      </p>
      <ol>
        {phases.map((phase, index) => {
          const days = weekdays.filter(
            (_, i) => phase.mask & (1 << weekdayBits[i]!),
          );
          const repeat = dates.length
            ? dates.map((day) => formatDay(day)).join(listSeparator)
            : phase.interval > 1
              ? t("ui.every-value-weeks", localDigits(phase.interval))
              : t(days.length === 7 ? "ui.every-day" : "ui.every-week");
          return (
            <li key={phase.start}>
              {phased && <h5>{t("ui.stage-value", localDigits(index + 1))}</h5>}
              {!dates.length && (
                <p>
                  {phase.end === null
                    ? t("ui.from-value", formatDay(phase.start))
                    : t(
                        "ui.value-to-value",
                        formatDay(phase.start),
                        formatDay(phase.end - 1),
                      )}
                </p>
              )}
              <strong>{repeat}</strong>
              {!dates.length && days.length < 7 && (
                <p>{days.join(listSeparator)}</p>
              )}
              {phase.slots.map((slot) => (
                <p key={slot.minute}>
                  <bdi>{localDigits(timeText(slot.minute))}</bdi>
                  {slot.amount !== null &&
                    ` · ${amountText(slot.amount)} ${doseUnit(unit, slot.amount)}`}
                </p>
              ))}
            </li>
          );
        })}
      </ol>
      {instructions && <p>{instructions}</p>}
      {tracked ? (
        <p>
          {t(
            "ui.low-stock-alert-at-value-value",
            amountText(threshold),
            doseUnit(unit, threshold),
          )}
        </p>
      ) : (
        stock !== null && (
          <p>
            {t(
              "ui.initial-stock-value-value-alert-at-value-value",
              amountText(stock),
              doseUnit(unit, stock),
              amountText(threshold),
              doseUnit(unit, threshold),
            )}
          </p>
        )
      )}
    </>
  );
}

function Appearance({
  dialog,
  icon,
  color,
  select,
}: {
  dialog: HTMLDialogElement;
  icon: string;
  color: string;
  select(icon: string, color: string): void;
}) {
  const [shape, setShape] = useState(medicineShape(icon));
  const [ink, setInk] = useState(medicineColor(color));
  return (
    <div className="sheet-body">
      <h2 id="appearance-title">{t("ui.appearance-optional")}</h2>
      <h3 id="medicine-icons-title">{t("ui.medicine-form")}</h3>
      <div
        id="medicine-icons"
        className="appearance-grid"
        role="group"
        aria-labelledby="medicine-icons-title"
      >
        {Object.keys(medicineShapes).map((id) => {
          const key = medicineShape(id);
          return (
            <button
              type="button"
              key={key}
              className="secondary"
              data-choice={key}
              aria-pressed={shape === key}
              onClick={() => setShape(key)}
            >
              <MedicineArt shape={key} color={ink} />
              <span>{medicineShapes[key]}</span>
            </button>
          );
        })}
      </div>
      <h3 id="medicine-colors-title">{t("ui.medicine-color")}</h3>
      <div
        id="medicine-colors"
        className="appearance-grid"
        role="group"
        aria-labelledby="medicine-colors-title"
      >
        {Object.keys(appearanceColors).map((id) => {
          const key = medicineColor(id);
          return (
            <button
              type="button"
              key={key}
              className="secondary"
              data-choice={key}
              aria-pressed={ink === key}
              onClick={() => setInk(key)}
            >
              <span className="appearance-swatch" data-ink={key} />
              <span>{appearanceColors[key]}</span>
            </button>
          );
        })}
      </div>
      <div id="appearance-preview" className="feature medicine" data-ink={ink}>
        <span id="appearance-preview-icon">
          <MedicineArt shape={shape} color={ink} banner />
        </span>
        {t("ui.preview")}
      </div>
      <button
        type="button"
        id="appearance-confirm"
        className="block-action"
        onClick={() => {
          select(shape, ink);
          dialog.close();
        }}
      >
        {t("ui.select")}
      </button>
      <button
        type="button"
        className="text-button block-action"
        data-close="appearance-dialog"
        onClick={() => dialog.close()}
      >
        {t("ui.cancel")}
      </button>
    </div>
  );
}
