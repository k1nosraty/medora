import { useLayoutEffect, useRef, useState } from "react";
import { t } from "../../../product-assets/public/medication/shared/i18n/locale.js";
import { isoDay } from "@medora/domain/browser/care-index";
import { dayNumber } from "../../../product-assets/public/medication/shared/ui/dates.js";
import { CareInputError } from "../../../product-assets/public/medication/shared/ui/care-error.js";
import { cycleIsEnabled } from "@medora/domain/browser/profile";
import { installCycleOverview } from "../CycleOverview";
import { clearFeature, paintFeature } from "../renderer";
import { Icon, PlanArtwork } from "../PlanCard";
import type { installDeletion } from "../DeleteConfirmation";
import type { CareState, FamilyView } from "../productState";

export interface CyclePeriod {
  end?: number | null;
  flow?: "light" | "medium" | "heavy" | "";
  note?: string;
  sharedNote?: string;
  recordedBy?: string;
}

interface PeriodDraft {
  end: number | null;
  flow: string;
  note: string;
}
export interface CycleTarget {
  name: string;
  day: number;
  save(entry: PeriodDraft & { day: number }): Promise<void>;
}

export function CycleDateField({
  id,
  label,
  maximum,
  required,
  endpoint,
  value,
  change,
}: {
  id: string;
  label: string;
  maximum?: string;
  required?: boolean;
  endpoint?: "start" | "end";
  value: string;
  change(value: string): void;
}) {
  return (
    <div className="picker-control" data-picker-host="">
      <label>
        {label}
        <input
          id={id}
          type="date"
          max={maximum}
          required={required}
          data-endpoint={endpoint}
          hidden
          value={value}
          onInput={(event) => change(event.currentTarget.value)}
        />
      </label>
      <button className="secondary picker-field" type="button" />
    </div>
  );
}

export function CycleSheetHeader({
  title,
  dialog,
}: {
  title: string;
  dialog: HTMLDialogElement;
}) {
  return (
    <div className="sheet-header program-cycle">
      <PlanArtwork id="cycle" className="add-sheet-icon" />
      <h2 id={dialog.getAttribute("aria-labelledby") ?? undefined}>{title}</h2>
      <button
        type="button"
        className="icon-button"
        data-close={dialog.id}
        aria-label={t("ui.close")}
        onClick={() => dialog.close()}
      >
        <Icon name="close" />
      </button>
    </div>
  );
}

export function readCycleDate(value: string): number {
  try {
    return dayNumber(value);
  } catch {
    return NaN;
  }
}

interface Options {
  getState(): CareState | undefined;
  getFamilyView(): FamilyView | null;
  getDates: Parameters<typeof installCycleOverview>[0]["getDates"];
  today(): number;
  mutate(
    change: (state: CareState) => void,
    success: string,
    scheduleChanged?: boolean,
  ): Promise<boolean>;
  requestDeletion: ReturnType<typeof installDeletion>;
  refreshFields(host: HTMLElement): void;
  add(): void;
  logDay(): void;
  openCalendar(day: number): void;
}

function PeriodEditor({
  dialog,
  day,
  record,
  target,
  today,
  refreshFields,
  save,
}: {
  dialog: HTMLDialogElement;
  day: number;
  record: CyclePeriod | undefined;
  target: CycleTarget | undefined;
  today(): number;
  refreshFields: Options["refreshFields"];
  save(day: number, entry: PeriodDraft): Promise<boolean>;
}) {
  const [start, setStart] = useState(() => isoDay(day));
  const [end, setEnd] = useState(() =>
    record?.end == null ? "" : isoDay(record.end),
  );
  const [flow, setFlow] = useState<string>(record?.flow ?? "");
  const [note, setNote] = useState(record?.note ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  useLayoutEffect(() => {
    if (form.current) refreshFields(form.current);
  });
  async function submit() {
    if (busy.current) return;
    const first = readCycleDate(start);
    const last = end ? readCycleDate(end) : null;
    if (
      !Number.isInteger(first) ||
      first > today() ||
      (last !== null &&
        (!Number.isInteger(last) || last < first || last > today()))
    ) {
      setError(t("ui.check-the-cycle-start-and-end-dates"));
      return;
    }
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const entry = { end: last, flow, note: note.trim() };
      if (target) await target.save({ day: first, ...entry });
      else if (await save(first, entry)) dialog.close();
      else
        setError(
          document.getElementById("status")?.textContent ||
            t("ui.could-not-save-try-again"),
        );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("ui.could-not-save-try-again"),
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  const maximum = isoDay(today());
  return (
    <form
      id="cycle-form"
      className="sheet-form"
      ref={form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <CycleSheetHeader dialog={dialog} title={t("ui.log-cycle")} />
      <div className="sheet-body">
        <CycleDateField
          id="cycle-start"
          label={t("ui.start-date")}
          value={start}
          maximum={maximum}
          required
          change={setStart}
        />
        <CycleDateField
          id="cycle-end"
          label={t("ui.end-date-optional")}
          value={end}
          maximum={maximum}
          change={setEnd}
        />
        <label>
          {t("ui.flow-optional")}
          <select
            id="cycle-flow"
            value={flow}
            onChange={(event) => setFlow(event.target.value)}
          >
            <option value="">{t("ui.not-selected")}</option>
            {(["light", "medium", "heavy"] as const).map((value) => (
              <option key={value} value={value}>
                {t(`ui.cycle-flow-${value}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("ui.symptoms-or-notes-optional")}
          <textarea
            id="cycle-note"
            maxLength={500}
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <p id="cycle-error" className="field-error" role="alert">
          {error}
        </p>
        <button className="block-action" type="submit" disabled={pending}>
          {target ? t("ui.save-for-value", target.name) : t("ui.save")}
        </button>
      </div>
    </form>
  );
}

function get(id: string) {
  return document.getElementById(id)!;
}

export function installCycle({
  getState,
  getFamilyView,
  getDates,
  today,
  mutate,
  requestDeletion,
  refreshFields,
  add,
  logDay,
  openCalendar,
}: Options) {
  const dialog = get("cycle-dialog");
  if (!(dialog instanceof HTMLDialogElement))
    throw new Error("Cycle editor host missing");
  const editor = dialog;
  dialog.addEventListener("close", () => {
    if (!editor.open) clearFeature(editor);
  });

  function open(previous?: number, target?: CycleTarget) {
    const state = getState();
    if (!cycleIsEnabled(state)) return;
    const record =
      previous === undefined ? undefined : state?.cycleRecords?.[previous];
    editor.toggleAttribute("data-family-editor", Boolean(target));
    clearFeature(editor);
    paintFeature(
      editor,
      <PeriodEditor
        dialog={editor}
        day={previous ?? target?.day ?? today()}
        record={record}
        target={target}
        today={today}
        refreshFields={refreshFields}
        save={(day, entry) =>
          mutate(
            (current) => {
              if (!cycleIsEnabled(current))
                throw new CareInputError(t("ui.cycle-is-turned-off"));
              const records = (current.cycleRecords ??= {});
              if (day !== previous && Object.hasOwn(records, day))
                throw new CareInputError(
                  t("ui.a-cycle-is-already-logged-for-that-date"),
                );
              if (previous !== undefined && !Object.hasOwn(records, previous))
                throw new CareInputError(
                  t("ui.this-entry-is-no-longer-available"),
                );
              if (
                Object.entries(records).some(
                  ([key, row]) =>
                    Number(key) !== previous &&
                    Number(key) <= (entry.end ?? day) &&
                    day <= (row.end ?? Number(key)),
                )
              ) {
                throw new CareInputError(t("ui.cycle-possible-overlap"));
              }
              const old =
                previous === undefined ? undefined : records[previous];
              if (previous !== undefined) delete records[previous];
              const flow =
                entry.flow === "light" ||
                entry.flow === "medium" ||
                entry.flow === "heavy"
                  ? entry.flow
                  : "";
              records[day] = { ...old, ...entry, flow };
            },
            t("ui.cycle-saved"),
            true,
          )
        }
      />,
    );
    if (!editor.open) editor.showModal();
  }
  const overview = installCycleOverview({
    today,
    getDates,
    getFamilyView,
    openCalendar,
    add,
    logDay,
    edit(day, { end: focusEnd } = { end: false }) {
      open(day);
      if (focusEnd && editor.open)
        editor.querySelector<HTMLElement>('[data-for="cycle-end"]')?.focus();
    },
    remove(day) {
      requestDeletion({
        title: t("ui.delete-this-cycle-entry"),
        message: getDates().formatDay(day),
        success: t("ui.cycle-entry-deleted"),
        scheduleChanged: true,
        change: (state) => {
          if (!cycleIsEnabled(state))
            throw new CareInputError(t("ui.cycle-is-turned-off"));
          delete state.cycleRecords?.[day];
        },
      });
    },
  });
  return {
    open,
    render: (state: CareState) => overview.render(state.cycleRecords ?? {}),
    reset: overview.reset,
  };
}
