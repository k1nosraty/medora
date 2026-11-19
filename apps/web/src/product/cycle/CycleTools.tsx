import { useLayoutEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { isoDay } from "@medora/domain/browser/care-index";
import {
  cyclePrintReport,
  mergeCyclePeriods,
} from "../../../product-assets/public/medication/features/cycle/tools.js";
import { t } from "../../../product-assets/public/medication/shared/i18n/locale.js";
import { CareInputError } from "../../../product-assets/public/medication/shared/ui/care-error.js";
import { paintFeature } from "../renderer";
import type { CareState } from "../productState";
import { CycleDateField, readCycleDate } from "./PeriodEditor";

interface Options {
  getState(): CareState | undefined;
  canUse(): boolean;
  today(): number;
  refreshFields(container: HTMLElement): void;
  mutate(
    change: (state: CareState) => void,
    success: string,
    scheduleChanged: boolean,
  ): Promise<boolean>;
}

const emptyRow = { start: "", end: "" };
const datesError = () => t("ui.check-the-cycle-start-and-end-dates");

function BulkEntry({ canUse, today, mutate, refreshFields }: Options) {
  const [rows, setRows] = useState<(typeof emptyRow)[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  useLayoutEffect(() => {
    if (form.current) refreshFields(form.current);
  });

  async function save() {
    if (!canUse() || submitting.current) return;
    const additions = rows
      .filter(({ start, end }) => start || end)
      .map(({ start, end }) => ({
        start: readCycleDate(start),
        end: end ? readCycleDate(end) : null,
      }));
    const maximum = today();
    if (
      !additions.length ||
      additions.some(
        ({ start, end }) =>
          !Number.isInteger(start) ||
          start > maximum ||
          (end !== null &&
            (!Number.isInteger(end) || end < start || end > maximum)),
      )
    ) {
      setError(datesError());
      return;
    }
    submitting.current = true;
    setPending(true);
    setError("");
    try {
      if (
        await mutate(
          (state) => {
            const records = mergeCyclePeriods(
              state.cycleRecords ?? {},
              additions,
            );
            if (!records)
              throw new CareInputError(t("ui.cycle-possible-overlap"));
            state.cycleRecords = records;
          },
          t("ui.cycle-saved"),
          true,
        )
      )
        setRows([emptyRow]);
      else
        setError(
          document.getElementById("status")?.textContent ||
            t("ui.could-not-save-try-again"),
        );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <details
      onToggle={(event) => {
        if (event.currentTarget.open)
          setRows((original) => (original.length ? original : [emptyRow]));
      }}
    >
      <summary>{t("ui.cycle-bulk")}</summary>
      <form
        id="cycle-bulk-form"
        className="settings-form"
        noValidate
        ref={form}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div id="cycle-bulk-rows">
          {rows.map((row, index) => (
            <div className="sleep-fields" key={index}>
              {(["start", "end"] as const).map((endpoint) => (
                <CycleDateField
                  key={endpoint}
                  endpoint={endpoint}
                  id={`cycle-bulk-${index}-${endpoint}`}
                  label={t(
                    endpoint === "start"
                      ? "ui.start-date"
                      : "ui.end-date-optional",
                  )}
                  maximum={isoDay(today())}
                  value={row[endpoint]}
                  change={(value) =>
                    setRows((original) =>
                      original.map((entry, position) =>
                        position === index
                          ? { ...entry, [endpoint]: value }
                          : entry,
                      ),
                    )
                  }
                />
              ))}
            </div>
          ))}
        </div>
        <button
          type="button"
          id="cycle-bulk-add"
          className="secondary"
          disabled={pending}
          onClick={() =>
            setRows((original) =>
              original.length < 24 ? [...original, emptyRow] : original,
            )
          }
        >
          {t("ui.cycle-bulk-add")}
        </button>
        <p id="cycle-bulk-error" className="field-error" role="alert">
          {error}
        </p>
        <button type="submit" className="block-action" disabled={pending}>
          {t("ui.save")}
        </button>
      </form>
    </details>
  );
}

function PrintCycle({
  getState,
  canUse,
  today,
  refreshFields,
  printView,
}: Options & { printView: HTMLElement }) {
  const [first, setFirst] = useState(() => isoDay(today() - 90));
  const [last, setLast] = useState(() => isoDay(today()));
  const [symptoms, setSymptoms] = useState(true);
  const [medicines, setMedicines] = useState(false);
  const [notes, setNotes] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<ReturnType<typeof cyclePrintReport>>();
  const form = useRef<HTMLFormElement>(null);
  useLayoutEffect(() => {
    if (form.current) refreshFields(form.current);
  });

  function print() {
    const state = getState();
    if (!state || !canUse() || report) return;
    const start = readCycleDate(first),
      end = readCycleDate(last);
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start > end ||
      end > today()
    ) {
      setError(datesError());
      return;
    }
    setError("");
    const next = cyclePrintReport(state, start, end, {
      symptoms,
      medicines,
      notes,
    });
    flushSync(() => setReport(next));
    document.body.dataset.cyclePrint = "";
    function clear() {
      delete document.body.dataset.cyclePrint;
      flushSync(() => setReport(undefined));
    }
    window.addEventListener("afterprint", clear, { once: true });
    try {
      window.print();
    } catch {
      window.removeEventListener("afterprint", clear);
      clear();
      setError(t("ui.could-not-save-try-again"));
    }
  }

  return (
    <details>
      <summary>{t("ui.cycle-visit-report")}</summary>
      <form
        id="cycle-print-form"
        className="settings-form"
        noValidate
        ref={form}
        onSubmit={(event) => {
          event.preventDefault();
          print();
        }}
      >
        <div className="sleep-fields">
          <CycleDateField
            id="cycle-print-first"
            label={t("ui.start-date")}
            value={first}
            change={setFirst}
            required
          />
          <CycleDateField
            id="cycle-print-last"
            label={t("ui.end-date-optional")}
            value={last}
            change={setLast}
            required
          />
        </div>
        <label className="cycle-choice">
          <input
            type="checkbox"
            id="cycle-print-symptoms"
            checked={symptoms}
            onChange={(event) => setSymptoms(event.currentTarget.checked)}
          />{" "}
          {t("ui.cycle-symptoms")}
        </label>
        <label className="cycle-choice">
          <input
            type="checkbox"
            id="cycle-print-meds"
            checked={medicines}
            onChange={(event) => setMedicines(event.currentTarget.checked)}
          />{" "}
          {t("ui.medicines")}
        </label>
        <label className="cycle-choice">
          <input
            type="checkbox"
            id="cycle-print-notes"
            checked={notes}
            onChange={(event) => setNotes(event.currentTarget.checked)}
          />{" "}
          {t("ui.sleep-note")}
        </label>
        <p id="cycle-print-error" className="field-error" role="alert">
          {error}
        </p>
        <button type="submit" className="block-action">
          {t("ui.cycle-print-pdf")}
        </button>
      </form>
      {report &&
        createPortal(
          <>
            <h1>{report.title}</h1>
            {report.lines.map((line, index) => (
              <p key={index}>{line}</p>
            ))}
          </>,
          printView,
        )}
    </details>
  );
}

export function installCycleTools(
  host: HTMLElement,
  printView: HTMLElement,
  options: Options,
) {
  printView.dir = "rtl";
  printView.lang = "fa";
  paintFeature(
    host,
    <>
      <BulkEntry {...options} />
      <PrintCycle {...options} printView={printView} />
    </>,
  );
}
