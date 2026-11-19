import { useLayoutEffect, useRef, useState } from "react";
import { t } from "../../../product-assets/public/medication/shared/i18n/locale.js";
import { isoDay } from "@medora/domain/browser/care-index";
import { cycleSymptoms } from "@medora/domain/browser/cycle";
import { equalCareValues } from "@medora/domain/browser/care-contract";
import { cycleIsEnabled } from "@medora/domain/browser/profile";
import { CareInputError } from "../../../product-assets/public/medication/shared/ui/care-error.js";
import { describeCycleDay, type CycleDayLabel } from "../cycleLabels";
import { clearFeature, paintFeature } from "../renderer";
import type { CareState } from "../productState";
import type { installDeletion } from "../DeleteConfirmation";
import {
  CycleDateField,
  CycleSheetHeader,
  readCycleDate,
} from "./PeriodEditor";

interface DayEditorProps {
  dialog: HTMLDialogElement;
  previousDay: number;
  previous: CycleDayLabel | undefined;
  order: string[];
  today(): number;
  refreshFields(host: HTMLElement): void;
  save(day: number, row: CycleDayLabel): Promise<boolean>;
  remove(): void;
}
const flows = [
  ["", "ui.not-selected"],
  ["none", "ui.cycle-no-flow"],
  ["spotting", "ui.cycle-spotting"],
  ["light", "ui.cycle-flow-light"],
  ["medium", "ui.cycle-flow-medium"],
  ["heavy", "ui.cycle-flow-heavy"],
] as const;

function DayEditor({
  dialog,
  previousDay,
  previous,
  order,
  today,
  refreshFields,
  save,
  remove,
}: DayEditorProps) {
  const [date, setDate] = useState(() => isoDay(previousDay));
  const [flow, setFlow] = useState(previous?.flow ?? "");
  const [symptoms, setSymptoms] = useState(previous?.symptoms ?? {});
  const [tags, setTags] = useState(previous?.tags ?? "");
  const [note, setNote] = useState(previous?.note ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  useLayoutEffect(() => {
    if (form.current) refreshFields(form.current);
  });

  async function submit() {
    if (busy.current) return;
    const day = readCycleDate(date);
    const row = { flow, symptoms, tags: tags.trim(), note: note.trim() };
    if (
      !Number.isInteger(day) ||
      day > today() ||
      !describeCycleDay(row).length
    ) {
      setError(t("ui.cycle-days-required"));
      return;
    }
    busy.current = true;
    setPending(true);
    setError("");
    try {
      if (await save(day, row)) dialog.close();
      else
        setError(
          document.getElementById("status")?.textContent ||
            t("ui.could-not-save-try-again"),
        );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <form
      id="cycle-day-form"
      className="sheet-form"
      noValidate
      ref={form}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <CycleSheetHeader title={t("ui.cycle-day-log")} dialog={dialog} />
      <div className="sheet-body">
        <CycleDateField
          id="cycle-day-date"
          label={t("ui.date")}
          maximum={isoDay(today())}
          value={date}
          change={setDate}
          required
        />
        <label>
          {t("ui.flow-optional")}
          <select
            id="cycle-day-flow"
            value={flow}
            onChange={(event) => setFlow(event.target.value)}
          >
            {flows.map(([value, label]) => (
              <option key={value} value={value}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>{t("ui.cycle-symptoms")}</legend>
          <div id="cycle-symptom-controls" className="cycle-symptom-controls">
            {order.map((key) => (
              <label key={key}>
                {t(`ui.cycle-${key}`)}
                <select
                  value={symptoms[key] ?? ""}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setSymptoms((current) => {
                      const updated = { ...current };
                      if (value) updated[key] = value;
                      else delete updated[key];
                      return updated;
                    });
                  }}
                >
                  <option value="">{t("ui.not-selected")}</option>
                  {[1, 2, 3].map((value) => (
                    <option key={value} value={value}>
                      {t(`ui.cycle-strength-${value}`)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </fieldset>
        <label>
          {t("ui.cycle-tags")}
          <input
            id="cycle-day-tags"
            type="text"
            maxLength={180}
            value={tags}
            onChange={(event) => setTags(event.target.value)}
          />
        </label>
        <label>
          {t("ui.sleep-note")}
          <textarea
            id="cycle-day-note"
            maxLength={500}
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <p id="cycle-day-error" className="field-error" role="alert">
          {error}
        </p>
        <button className="block-action" type="submit" disabled={pending}>
          {t("ui.save")}
        </button>
        <button
          id="cycle-day-delete"
          className="text-button danger-link"
          type="button"
          hidden={!previous}
          disabled={pending}
          onClick={remove}
        >
          {t("ui.delete")}
        </button>
      </div>
    </form>
  );
}

interface Options {
  getState(): CareState | undefined;
  canOpen(): boolean;
  today(): number;
  formatDay(day: number): string;
  refreshFields(host: HTMLElement): void;
  mutate(change: (state: CareState) => void, success: string): Promise<boolean>;
  requestDeletion: ReturnType<typeof installDeletion>;
}
export function installCycleDayEditor({
  getState,
  canOpen,
  today,
  formatDay,
  refreshFields,
  mutate,
  requestDeletion,
}: Options) {
  const dialog =
    document.querySelector<HTMLDialogElement>("#cycle-day-dialog")!;
  dialog.addEventListener("close", () => {
    if (!dialog.open) clearFeature(dialog);
  });
  return (previousDay: number) => {
    if (!canOpen() || previousDay > today() || dialog.open) return;
    const rows = getState()?.cycleDays ?? {};
    const previous = rows[previousDay];
    const usage = new Map<string, number>();
    for (const row of Object.values(rows))
      for (const [key, value] of Object.entries(row.symptoms ?? {})) {
        if (value) usage.set(key, (usage.get(key) ?? 0) + 1);
      }
    const order = [...cycleSymptoms].sort(
      (a, b) => (usage.get(b) ?? 0) - (usage.get(a) ?? 0),
    );
    paintFeature(
      dialog,
      <DayEditor
        dialog={dialog}
        previousDay={previousDay}
        previous={previous}
        order={order}
        today={today}
        refreshFields={refreshFields}
        save={(day, row) =>
          mutate((state) => {
            if (!cycleIsEnabled(state))
              throw new CareInputError(t("ui.cycle-is-turned-off"));
            const records = (state.cycleDays ??= {});
            if (!equalCareValues(records[previousDay], previous))
              throw new CareInputError(t("ui.cycle-entry-changed"));
            if (day !== previousDay && Object.hasOwn(records, day))
              throw new CareInputError(
                t("ui.a-cycle-is-already-logged-for-that-date"),
              );
            if (day !== previousDay) delete records[previousDay];
            records[day] = { ...previous, ...row };
          }, t("ui.cycle-days-saved"))
        }
        remove={() => {
          dialog.close();
          requestDeletion({
            title: t("ui.delete-this-cycle-entry"),
            message: formatDay(previousDay),
            success: t("ui.cycle-entry-deleted"),
            change: (state) => {
              const records = state.cycleDays;
              if (!records || !equalCareValues(records[previousDay], previous))
                throw new CareInputError(t("ui.cycle-entry-changed"));
              delete records[previousDay];
            },
          });
        }}
      />,
    );
    dialog.showModal();
  };
}
