import { useRef, useState } from "react";
import { t } from "../../../product-assets/public/medication/shared/i18n/locale.js";
import { integer } from "../../../product-assets/public/medication/shared/ui/input-values.js";
import { paintFeature } from "../renderer";

const presets = [
  ["10", "ui.10-minutes"],
  ["30", "ui.30-minutes"],
  ["60", "ui.60-minutes"],
  ["custom", "ui.custom-2"],
] as const;

interface SnoozeOptions {
  minutes: number;
  save(control: HTMLButtonElement, minutes: number): Promise<boolean>;
  invalid(): void;
}

export function renderMedicationSnooze(
  host: HTMLElement,
  options: SnoozeOptions,
) {
  paintFeature(
    host,
    <MedicationSnooze key={crypto.randomUUID()} {...options} />,
  );
}

function MedicationSnooze({ minutes, save, invalid }: SnoozeOptions) {
  const [preset, setPreset] = useState(
    presets.find(([value]) => Number(value) === minutes)?.[0] ?? "custom",
  );
  const [custom, setCustom] = useState(String(minutes));
  const submit = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);
  return (
    <form
      id="snooze-form"
      onSubmit={(event) => {
        event.preventDefault();
        const value = integer(preset === "custom" ? custom : preset);
        if (!(value >= 1 && value <= 1440)) {
          invalid();
          field.current?.focus();
        } else if (submit.current) void save(submit.current, value);
      }}
    >
      <p className="quiet">
        {t("ui.when-you-snooze-a-dose-medora-reminds-you-again-after-thi")}
      </p>
      <fieldset className="settings-choices">
        <legend>{t("ui.medicine-reminder-snooze")}</legend>
        {presets.map(([value, label]) => (
          <label key={value}>
            <input
              type="radio"
              name="snooze-preset"
              value={value}
              checked={preset === value}
              onChange={() => setPreset(value)}
            />
            <span>{t(label)}</span>
          </label>
        ))}
      </fieldset>
      <label id="snooze-custom-row" hidden={preset !== "custom"}>
        {t("ui.snooze-duration-minutes")}
        <input
          ref={field}
          id="snooze-minutes"
          dir="ltr"
          inputMode="numeric"
          maxLength={4}
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
        />
      </label>
      <button type="submit" className="block-action" ref={submit}>
        {t("ui.save-snooze-duration")}
      </button>
    </form>
  );
}
