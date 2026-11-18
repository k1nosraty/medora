import { useLayoutEffect, useState, type FormEvent } from "react";
import { t } from "../../../../web/public/medication/shared/i18n/locale.js";
import {
  sleepInstant,
  sleepMinutes,
  sleepWall,
  validSleepRecord,
} from "../../../../web/public/medication/domain/sleep.js";
import { sleepDuration } from "../../../../web/public/medication/features/sleep/presentation.js";

export interface SleepRecord {
  start: number;
  end: number | null;
  zone: string;
  kind: "main" | "nap";
  quality: "" | "good" | "fair" | "poor";
  note?: string;
}

export interface WakeDraft {
  at: number;
  zone: string;
}

interface Props {
  dialog: HTMLDialogElement;
  day: string;
  zone: string;
  record: SleepRecord | undefined;
  draft: WakeDraft | undefined;
  refreshFields(host: HTMLElement): void;
  save(record: SleepRecord): Promise<boolean>;
  saveError(): string;
}

type Endpoint = { day: string; time: string };

function readEndpoint(data: FormData, prefix: "start" | "end"): Endpoint {
  return {
    day: String(data.get(prefix + "-day") ?? ""),
    time: String(data.get(prefix + "-time") ?? ""),
  };
}

function rangeFrom(data: FormData, zone: string, record?: SleepRecord) {
  const endpoint = (part: "start" | "end") => {
    const { day, time } = readEndpoint(data, part);
    const previous = record?.[part];
    if (previous != null) {
      // Reusing an unchanged wall time preserves the original offset in a DST fold.
      const wall = sleepWall(previous, zone);
      if (day === wall.day && time === wall.time) return previous;
    }
    return sleepInstant(day, time, zone);
  };
  return { start: endpoint("start"), end: endpoint("end") };
}

function EndpointFields({
  name,
  value,
  max,
}: {
  name: "start" | "end";
  value: Endpoint;
  max: string;
}) {
  const start = name === "start";
  const time = t(start ? "ui.sleep-start-time" : "ui.sleep-wake-time");
  return (
    <fieldset className="sleep-endpoint">
      <legend>
        {t(start ? "ui.sleep-quick-start" : "ui.sleep-wake-time")}
      </legend>
      <div className="picker-control" data-picker-host="">
        <label>
          {t(start ? "ui.start-date" : "ui.sleep-wake-day")}
          <input
            id={"sleep-" + name + "-day"}
            name={name + "-day"}
            type="date"
            defaultValue={value.day}
            max={max}
            required
            hidden
          />
        </label>
        <button className="secondary picker-field" type="button" />
      </div>
      <div className="picker-control" data-picker-host="">
        <label>
          {time}
          <input
            id={"sleep-" + name + "-time"}
            name={name + "-time"}
            type="time"
            defaultValue={value.time}
            required
            hidden
          />
        </label>
        <button className="secondary picker-field" type="button" />
      </div>
    </fieldset>
  );
}

export function SleepForm({
  dialog,
  day,
  zone,
  record,
  draft,
  refreshFields,
  save,
  saveError,
}: Props) {
  const [duration, setDuration] = useState(
    record?.end != null ? sleepDuration(sleepMinutes(record)) : "",
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const blank = { day, time: "" };
  const end =
    record?.end != null
      ? sleepWall(record.end, zone)
      : draft
        ? sleepWall(draft.at, zone)
        : blank;
  const start = record
    ? sleepWall(record.start, zone)
    : { day: draft ? end.day : day, time: "" };
  const max = sleepWall(Date.now(), zone).day;

  useLayoutEffect(() => {
    refreshFields(dialog);
    dialog.showModal();
    if (draft)
      dialog
        .querySelector<HTMLElement>('[data-for="sleep-start-time"]')
        ?.focus();
  }, [dialog, draft, refreshFields]);

  function preview(form: HTMLFormElement) {
    const range = rangeFrom(new FormData(form), zone, record);
    setDuration(
      range.start < range.end ? sleepDuration(sleepMinutes(range)) : "",
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const kind = data.get("kind");
    const quality = data.get("quality");
    const range = rangeFrom(data, zone, record);
    if (
      (kind !== "main" && kind !== "nap") ||
      (quality !== "" &&
        quality !== "good" &&
        quality !== "fair" &&
        quality !== "poor")
    ) {
      setError(t("ui.sleep-invalid-time"));
      return;
    }
    const row: SleepRecord = {
      ...record,
      ...range,
      zone,
      kind,
      quality,
      note: String(data.get("note") ?? "").trim(),
    };
    if (!validSleepRecord(row) || range.end > Date.now()) {
      setError(t("ui.sleep-invalid-time"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (await save(row)) {
        if (form.isConnected) dialog.close();
      } else setError(saveError() || t("ui.could-not-save-try-again"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      id="sleep-form"
      className="sheet-form"
      noValidate
      onInput={(event) => preview(event.currentTarget)}
      onChange={(event) => preview(event.currentTarget)}
      onSubmit={(event) => void submit(event)}
      aria-busy={saving}
    >
      <div className="sheet-header program-sleep">
        <img
          className="glass-object add-sheet-icon"
          src="/medication/assets/illustrations/sleep.webp"
          width={256}
          height={256}
          alt=""
        />
        <h2 id="sleep-title">{t("ui.sleep-log")}</h2>
        <button
          type="button"
          className="icon-button"
          data-close="sleep-dialog"
          aria-label={t("ui.close")}
          onClick={() => dialog.close()}
        >
          <svg aria-hidden="true">
            <use href="#i-close" />
          </svg>
        </button>
      </div>
      <div className="sheet-body">
        <EndpointFields name="start" value={start} max={max} />
        <EndpointFields name="end" value={end} max={max} />
        <p id="sleep-duration-preview" className="quiet" aria-live="polite">
          {duration}
        </p>
        <div className="sleep-fields">
          <label>
            {t("ui.sleep-kind")}
            <select
              id="sleep-kind"
              name="kind"
              defaultValue={record?.kind ?? "main"}
            >
              <option value="main">{t("ui.sleep-main")}</option>
              <option value="nap">{t("ui.sleep-nap")}</option>
            </select>
          </label>
          <label>
            {t("ui.sleep-quality")}
            <select
              id="sleep-quality"
              name="quality"
              defaultValue={record?.quality ?? ""}
            >
              <option value="">{t("ui.not-selected")}</option>
              {(["good", "fair", "poor"] as const).map((quality) => (
                <option key={quality} value={quality}>
                  {t("ui.sleep-" + quality)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          {t("ui.sleep-note")}
          <textarea
            id="sleep-note"
            name="note"
            maxLength={500}
            rows={2}
            defaultValue={record?.note ?? ""}
          />
        </label>
        <p id="sleep-error" className="field-error" role="alert">
          {error}
        </p>
        <button className="block-action" type="submit" disabled={saving}>
          {t("ui.save")}
        </button>
      </div>
    </form>
  );
}
