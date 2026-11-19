import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { isoDay } from "../../product-assets/public/medication/domain/care-index.js";
import {
  localDigits,
  t,
} from "../../product-assets/public/medication/shared/i18n/locale.js";
import { dayMs } from "../../product-assets/public/medication/domain/wall-clock.js";
import {
  integer,
  localClock,
} from "../../product-assets/public/medication/shared/ui/input-values.js";
import type { WaterEntry } from "./WaterEntries";

type WaterValues = Pick<WaterEntry, "day" | "time" | "amount">;
export interface WaterTarget {
  name: string;
  day?: number;
  time?: string;
  save(values: WaterValues): Promise<unknown>;
}

interface Props {
  dialog: HTMLDialogElement;
  entry: WaterEntry | null | undefined;
  target: WaterTarget | null | undefined;
  focusAmount: boolean;
  actionDay: number;
  today(): number;
  formatDay(day: number): string;
  refreshFields(container: HTMLElement): void;
  save(values: WaterValues): Promise<unknown>;
}

const presets = [
  [150, "ui.150"],
  [250, "ui.250"],
  [500, "ui.500"],
] as const;

export function WaterLogForm({
  dialog,
  entry,
  target,
  focusAmount,
  actionDay,
  today,
  formatDay,
  refreshFields,
  save,
}: Props) {
  const [amount, setAmount] = useState(localDigits(entry?.amount ?? 250));
  const [initial] = useState(() => ({
    day: entry?.day ?? target?.day ?? actionDay,
    time: entry?.time ?? target?.time ?? localClock(),
  }));
  const [when, setWhen] = useState(initial);
  const [error, setError] = useState("");
  const [invalidAmount, setInvalidAmount] = useState(false);
  const [saving, setSaving] = useState(false);
  const amountInput = useRef<HTMLInputElement>(null);
  const dayInput = useRef<HTMLInputElement>(null);
  const timeInput = useRef<HTMLInputElement>(null);
  const options = useRef<HTMLDetailsElement>(null);

  useLayoutEffect(() => {
    options.current!.open = Boolean(entry);
    refreshFields(dialog);
    dialog.showModal();
    if (focusAmount) {
      amountInput.current!.focus();
      amountInput.current!.select();
    }
  }, [dialog, entry, focusAmount, refreshFields]);

  function readWhen() {
    return {
      day: Date.parse(dayInput.current!.value + "T00:00:00Z") / dayMs,
      time: timeInput.current!.value,
    };
  }

  function clearError() {
    setError("");
    setInvalidAmount(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const value = integer(amount);
    const { day, time } = readWhen();
    if (!(value >= 1 && value <= 10000)) {
      setError(t("ui.enter-an-amount-from-1-to-10-000-ml"));
      setInvalidAmount(true);
      amountInput.current!.focus();
      return;
    }
    if (!Number.isInteger(day) || day > today() || !time) {
      setError(
        t(
          day > today()
            ? "ui.water-can-only-be-logged-for-today-or-an-earlier-date"
            : "ui.choose-a-date-and-time-for-the-entry",
        ),
      );
      options.current!.open = true;
      return;
    }
    setSaving(true);
    try {
      const values = { day, time, amount: value };
      if (target) await target.save(values);
      else if (await save(values)) dialog.close();
      else setError(t("ui.could-not-save-try-again"));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("ui.could-not-save-try-again"),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      id="water-custom"
      className="sheet-form"
      noValidate
      onSubmit={submit}
      aria-busy={saving}
    >
      <div className="sheet-header program-water">
        <img
          className="glass-object add-sheet-icon"
          data-art="water"
          src="/design/optical-glass/water.webp"
          width={256}
          height={256}
          loading="lazy"
          alt=""
        />
        <h2 id="water-dialog-title">
          {t(entry ? "ui.edit-water-entry" : "ui.log-water")}
        </h2>
        <button
          className="icon-button"
          type="button"
          aria-label={t("ui.close")}
          onClick={() => dialog.close()}
        >
          <svg aria-hidden="true">
            <use href="#i-close" />
          </svg>
        </button>
      </div>
      <div className="sheet-body">
        <label className="water-amount-field">
          <span>{t("ui.water-amount")}</span>
          <span className="water-amount-value">
            <input
              id="water-amount"
              dir="ltr"
              inputMode="numeric"
              maxLength={5}
              required
              ref={amountInput}
              value={amount}
              aria-invalid={invalidAmount || undefined}
              aria-describedby={invalidAmount ? "water-error" : undefined}
              onChange={(event) => {
                setAmount(event.currentTarget.value);
                clearError();
              }}
            />
            <span>{t("ui.ml")}</span>
          </span>
        </label>
        <div
          id="water-presets"
          className="water-quick"
          role="group"
          aria-label={t("ui.quick-water-amounts")}
        >
          {presets.map(([preset, label]) => (
            <button
              key={preset}
              type="button"
              data-water-preset={preset}
              aria-pressed={integer(amount) === preset}
              onClick={() => {
                setAmount(localDigits(preset));
                clearError();
              }}
            >
              {t(label)}
            </button>
          ))}
        </div>
        <details id="water-options" className="editor-options" ref={options}>
          <summary>
            <span>{t("ui.date-and-time")}</span>
            <span id="water-when">
              {Number.isInteger(when.day) && when.time
                ? `${when.day === today() ? t("ui.today") : formatDay(when.day)} · ${localDigits(when.time)}`
                : ""}
            </span>
          </summary>
          <div
            className="water-log-when"
            onInput={() => {
              setWhen(readWhen());
              clearError();
            }}
          >
            <div className="picker-control" data-picker-host="">
              <label>
                {t("ui.date")}
                <input
                  id="water-log-day"
                  ref={dayInput}
                  type="date"
                  defaultValue={isoDay(initial.day)}
                  max={isoDay(today())}
                  required
                  hidden
                />
              </label>
              <button className="secondary picker-field" type="button" />
            </div>
            <div className="picker-control" data-picker-host="">
              <label>
                {t("ui.time")}
                <input
                  id="water-log-time"
                  ref={timeInput}
                  type="time"
                  defaultValue={initial.time}
                  required
                  hidden
                />
              </label>
              <button className="secondary picker-field" type="button" />
            </div>
          </div>
        </details>
        <p id="water-error" role="alert" className="field-error">
          {error}
        </p>
        <button type="submit" className="block-action" disabled={saving}>
          {target ? t("ui.save-for-value", target.name) : t("ui.save")}
        </button>
        <button
          type="button"
          className="text-button block-action"
          onClick={() => dialog.close()}
        >
          {t("ui.cancel")}
        </button>
      </div>
    </form>
  );
}
