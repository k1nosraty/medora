import { timeText } from "../../../../../web/public/medication/domain/care-index.js";
import { clockMinute } from "../../../../../web/public/medication/domain/care-plan.js";
import {
  amountText,
  doseUnit,
} from "../../../../../web/public/medication/features/medicines/quantity.js";
import {
  localDigits,
  t,
} from "../../../../../web/public/medication/shared/i18n/locale.js";
import {
  dayNumber,
  today,
} from "../../../../../web/public/medication/shared/ui/dates.js";
import type { installPickers } from "../Pickers";
import {
  slotDraft,
  slotField,
  stageDraft,
  stageField,
  weekdayBits,
  weekdays,
  type InvalidMedicineField,
  type MedicineDraft,
  type StageDraft,
} from "./editorModel";

export type DraftChange = (patch: Partial<MedicineDraft>) => void;

export function FieldError({
  error,
  field,
}: {
  error: InvalidMedicineField | null;
  field: string;
}) {
  return error?.field === field ? (
    <p id="editor-inline-error" className="field-error">
      {error.message}
    </p>
  ) : null;
}
export function fieldAttributes(
  error: InvalidMedicineField | null,
  field: string,
) {
  return {
    id: field,
    "aria-invalid": error?.field === field || undefined,
    "aria-describedby":
      error?.field === field ? "editor-inline-error" : undefined,
  };
}
function PickerField({
  error,
  field,
  type,
  label,
  className,
  value,
  change,
  required,
}: {
  error: InvalidMedicineField | null;
  field: string;
  type: "date" | "time";
  label: string;
  className: string;
  value: string;
  change(value: string): void;
  required?: boolean;
}) {
  return (
    <>
      <div className="picker-control" data-picker-host="">
        <label>
          {label}
          <input
            type={type}
            className={className}
            value={value}
            dir={type === "time" ? "ltr" : undefined}
            required={required}
            hidden
            onInput={(event) => change(event.currentTarget.value)}
          />
        </label>
        <button
          type="button"
          className="secondary picker-field"
          {...fieldAttributes(error, field)}
        />
      </div>
      <FieldError error={error} field={field} />
    </>
  );
}

export function MedicineSchedule({
  draft,
  change,
  error,
  formatDay,
  pickers,
  focus,
  openInventory,
}: {
  draft: MedicineDraft;
  change: DraftChange;
  error: InvalidMedicineField | null;
  formatDay(day: number): string;
  pickers: ReturnType<typeof installPickers>;
  focus(id: string): void;
  openInventory(): void;
}) {
  const { dates, phased, phases } = draft;
  function patchStage(index: number, patch: Partial<StageDraft>) {
    change({
      phases: phases.map((stage, i) =>
        i === index ? { ...stage, ...patch } : stage,
      ),
    });
  }
  function mode(phased: boolean) {
    const first = phases[0]!;
    const restoreExactMode = phased && first.repeat === "dates";
    change({
      phased,
      restoreExactMode,
      phases: [
        {
          ...first,
          repeat: restoreExactMode
            ? "daily"
            : !phased && draft.restoreExactMode
              ? "dates"
              : first.repeat,
        },
        ...phases.slice(1),
      ],
    });
  }
  function addStage() {
    const last = phases.at(-1)!;
    const weekly = last.repeat === "weekly";
    const value = Number(last.interval);
    const interval =
      weekly && Number.isInteger(value) && value >= 1 && value <= 52
        ? value
        : 1;
    const start = last.end
      ? dayNumber(last.end) + 1
      : (last.start ? dayNumber(last.start) : today()) + interval * 7;
    const stage = stageDraft({
      start: Number.isInteger(start) ? start : today(),
      end: null,
      interval,
      mask: weekly ? last.mask : 127,
      slots: last.slots.map((slot) => ({
        minute: slot.time ? clockMinute(slot.time) : 480,
        amount: null,
      })),
    });
    focus(stageField(stage, "start"));
    change({ phases: [...phases, stage] });
  }
  const warning =
    phased && draft.restoreExactMode
      ? t("ui.selected-dates-apply-only-to-a-fixed-schedule")
      : !phased && phases.length > 1
        ? t("ui.saving-as-a-fixed-schedule-keeps-only-the-first-stage")
        : "";
  return (
    <>
      <fieldset className="plan-mode glass-toolbar">
        <legend className="visually-hidden">
          {t("ui.medication-schedule-type")}
        </legend>
        <label>
          <input
            type="radio"
            name="plan-mode"
            id="regular-mode"
            checked={!phased}
            onChange={() => mode(false)}
          />
          <span>{t("ui.fixed-schedule")}</span>
        </label>
        <label>
          <input
            type="radio"
            name="plan-mode"
            id="phased-mode"
            checked={phased}
            onChange={() => mode(true)}
          />
          <span>{t("ui.multi-stage")}</span>
        </label>
      </fieldset>
      <p className="quiet phase-only">
        {t("ui.leave-an-end-date-blank-to-end-that-stage-when-the-next-o")}
      </p>
      <p className="field-error" id="phase-mode-warning" hidden={!warning}>
        {warning}
      </p>
      <div id="phases">
        {phases.map((stage, index) => {
          const exact = stage.repeat === "dates";
          const patch = (update: Partial<StageDraft>) =>
            patchStage(index, update);
          const field = (name: string) => stageField(stage, name);
          const repeat = (value: string) => {
            if (value !== "daily" && value !== "weekly" && value !== "dates")
              return;
            const start = stage.start ? dayNumber(stage.start) : today();
            const weekday = (((start + 3) % 7) + 7) % 7;
            patch({
              repeat: value,
              ...(value === "weekly" && !stage.weeklySelected
                ? { weeklySelected: true, mask: 1 << weekday }
                : {}),
            });
          };
          function addSlot() {
            const times = stage.slots.map((slot) => slot.time);
            let minute = (clockMinute(times.at(-1) || "00:00") + 240) % 1440;
            while (times.includes(timeText(minute)))
              minute = (minute + 1) % 1440;
            const slot = slotDraft(timeText(minute));
            focus(slotField(slot, "time"));
            patch({ slots: [...stage.slots, slot] });
          }
          return (
            <fieldset
              key={stage.key}
              className="phase"
              data-weekly={String(stage.weeklySelected)}
            >
              <legend>{t("ui.stage-value", localDigits(index + 1))}</legend>
              <label className="plan-repeat">
                {t("ui.repeat")}
                <select
                  className="repeat"
                  value={stage.repeat}
                  onChange={(event) => repeat(event.target.value)}
                >
                  <option value="daily">{t("ui.every-day")}</option>
                  <option value="weekly">{t("ui.days-of-the-week")}</option>
                  <option value="dates" hidden={phased} disabled={phased}>
                    {t("ui.selected-dates")}
                  </option>
                </select>
              </label>
              <div className="fields plan-dates" hidden={exact}>
                <PickerField
                  error={error}
                  field={field("start")}
                  className="start"
                  type="date"
                  label={t("ui.start-date-2")}
                  value={stage.start}
                  required
                  change={(start) => patch({ start })}
                />
                <PickerField
                  error={error}
                  field={field("end")}
                  className="end"
                  type="date"
                  label={t("ui.end-date-optional-2")}
                  value={stage.end}
                  change={(end) => patch({ end })}
                />
              </div>
              <div className="weekly-plan" hidden={stage.repeat !== "weekly"}>
                <label>
                  {t("ui.repeat-interval-weeks")}
                  <input
                    className="interval"
                    type="number"
                    inputMode="numeric"
                    dir="ltr"
                    min={1}
                    max={52}
                    value={stage.interval}
                    required
                    {...fieldAttributes(error, field("interval"))}
                    onChange={(event) =>
                      patch({ interval: event.target.value })
                    }
                  />
                </label>
                <FieldError error={error} field={field("interval")} />
                <div
                  className="weekdays"
                  role="group"
                  aria-label={t("ui.days-to-take-medicine")}
                >
                  {weekdays.map((weekday, i) => {
                    const bit = 1 << weekdayBits[i]!;
                    return (
                      <label key={bit}>
                        <input
                          type="checkbox"
                          value={bit}
                          checked={Boolean(stage.mask & bit)}
                          {...(i === 0
                            ? fieldAttributes(error, field("weekday"))
                            : {})}
                          onChange={() => patch({ mask: stage.mask ^ bit })}
                        />
                        {weekday}
                      </label>
                    );
                  })}
                  <FieldError error={error} field={field("weekday")} />
                </div>
              </div>
              <div className="exact-plan" hidden={!exact}>
                <p className="quiet">
                  {t(
                    "ui.the-times-and-doses-below-apply-to-each-selected-date",
                  )}
                </p>
                <div className="exact-days">
                  {dates.map((day) => (
                    <button
                      key={day}
                      type="button"
                      className="secondary"
                      aria-label={t("ui.remove-date-value", formatDay(day))}
                      onClick={() => {
                        focus(field("dates"));
                        change({
                          dates: dates.filter((value) => value !== day),
                        });
                      }}
                    >
                      {formatDay(day)} ×
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="secondary add-exact-day"
                  {...fieldAttributes(error, field("dates"))}
                  onClick={() =>
                    pickers.chooseDate(dates.at(-1) ?? today(), (day) =>
                      change({
                        dates: [...new Set([...dates, day])].sort(
                          (a, b) => a - b,
                        ),
                      }),
                    )
                  }
                >
                  {t("ui.add-a-date")}
                </button>
                <FieldError error={error} field={field("dates")} />
              </div>
              <div className="doses-heading">
                <h4>{t("ui.doses")}</h4>
                <button
                  type="button"
                  className="text-button dose-unit-link"
                  onClick={openInventory}
                >
                  {draft.unit.trim()
                    ? t("ui.unit-value", doseUnit(draft.unit.trim(), 1000))
                    : t("ui.choose-a-unit")}
                </button>
              </div>
              <div className="slots">
                {stage.slots.map((slot, i) => {
                  const update = (patchSlot: Partial<typeof slot>) =>
                    patch({
                      slots: stage.slots.map((item) =>
                        item.key === slot.key
                          ? { ...item, ...patchSlot }
                          : item,
                      ),
                    });
                  return (
                    <div key={slot.key} className="slot">
                      <div className="slot-heading">
                        <strong>
                          {t("ui.dose-value", localDigits(i + 1))}
                        </strong>
                        <button
                          type="button"
                          className="remove-slot text-button danger-link"
                          hidden={stage.slots.length === 1}
                          onClick={() => {
                            focus(field("add-slot"));
                            patch({
                              slots: stage.slots.filter(
                                (item) => item.key !== slot.key,
                              ),
                            });
                          }}
                        >
                          {t("ui.remove-dose")}
                        </button>
                      </div>
                      <div className="slot-fields">
                        <PickerField
                          error={error}
                          field={slotField(slot, "time")}
                          className="time"
                          type="time"
                          label={t("ui.dose-time")}
                          value={slot.time}
                          required
                          change={(time) => update({ time })}
                        />
                        <div className="dose-field">
                          <label>
                            {t("ui.dose-optional")}
                            <input
                              className="amount"
                              inputMode="decimal"
                              dir="ltr"
                              maxLength={15}
                              value={slot.amount}
                              {...fieldAttributes(
                                error,
                                slotField(slot, "amount"),
                              )}
                              placeholder={t("ui.e-g-0-5")}
                              onChange={(event) =>
                                update({ amount: event.target.value })
                              }
                            />
                          </label>
                          <FieldError
                            error={error}
                            field={slotField(slot, "amount")}
                          />
                          <div
                            className="dose-quick-values"
                            role="group"
                            aria-label={t("ui.quick-dose-amounts")}
                          >
                            <Preset
                              amount={250}
                              label={t("ui.a-quarter-unit")}
                              choose={update}
                            >
                              ¼
                            </Preset>
                            <Preset
                              amount={500}
                              label={t("ui.half-a-unit")}
                              choose={update}
                            >
                              ½
                            </Preset>
                            <Preset
                              amount={1000}
                              label={t("ui.one-unit")}
                              choose={update}
                            >
                              {t("ui.1")}
                            </Preset>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="buttons">
                <button
                  id={field("add-slot")}
                  type="button"
                  className="add-slot secondary"
                  disabled={stage.slots.length >= 12}
                  onClick={addSlot}
                >
                  {t("ui.add-a-dose")}
                </button>
                <button
                  type="button"
                  className="remove-phase secondary phase-only"
                  hidden={phases.length === 1}
                  onClick={() => {
                    focus("add-phase");
                    change({ phases: phases.filter((item) => item !== stage) });
                  }}
                >
                  {t("ui.remove-stage")}
                </button>
              </div>
            </fieldset>
          );
        })}
      </div>
      <button
        id="add-phase"
        type="button"
        className="secondary phase-only block-action"
        disabled={phases.length >= 50}
        onClick={addStage}
      >
        {t("ui.add-stage")}
      </button>
    </>
  );
}

function Preset({
  amount,
  label,
  choose,
  children,
}: {
  amount: number;
  label: string;
  choose(patch: { amount: string }): void;
  children: string;
}) {
  return (
    <button
      type="button"
      className="secondary"
      data-dose-value={amount}
      aria-label={`${children} · ${label}`}
      onClick={() => choose({ amount: amountText(amount) })}
    >
      {children}
    </button>
  );
}
