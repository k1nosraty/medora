import { useRef, useState } from "react";
import {
  doseId,
  timeText,
} from "../../../product-assets/public/medication/domain/care-index.js";
import { saveMedicinePlan } from "../../../product-assets/public/medication/domain/medicine-command.js";
import { isLowStock } from "../../../product-assets/public/medication/domain/medication-rules.js";
import { nextPlannedDose } from "../../../product-assets/public/medication/features/medicines/next-dose.js";
import {
  amountText,
  doseUnit,
  quantity,
} from "../../../product-assets/public/medication/features/medicines/quantity.js";
import {
  locale,
  localDigits,
  t,
} from "../../../product-assets/public/medication/shared/i18n/locale.js";
import { CareInputError } from "../../../product-assets/public/medication/shared/ui/care-error.js";
import type { installDeletion } from "../DeleteConfirmation";
import type { installPickers } from "../Pickers";
import type { CareState, FamilyView } from "../product";
import { clearFeature, paintFeature } from "../renderer";
import { DoseContents, doseCardAttributes, type DoseVariant } from "./DoseCard";
import { MedicineArt, medicineColor } from "./MedicineArt";
import { MedicineEditor } from "./MedicineEditor";
import {
  deleteSchedule,
  doseStates,
  recordDose,
  refillStock,
  setPaused,
  type Dose,
  type MedicinePlan,
  type MedicineTarget,
} from "./model";

interface MedicationDependencies {
  getState(): CareState | undefined;
  getFamilyView(): FamilyView | null;
  today(): number;
  mutate(
    change: (state: CareState) => void,
    success: string,
    scheduleChanged?: boolean,
    day?: number,
  ): Promise<boolean>;
  requestDeletion: ReturnType<typeof installDeletion>;
  pickers: ReturnType<typeof installPickers>;
  formatDay(day: number): string;
}

export function installMedication({
  getState,
  getFamilyView,
  today,
  mutate,
  requestDeletion,
  pickers,
  formatDay,
}: MedicationDependencies) {
  const cabinet = document.getElementById("medicine-cabinet")!;
  const summary = document.getElementById("med-day-count")!;
  const doses = document.getElementById("med-day-doses")!;
  const editor =
    document.querySelector<HTMLDialogElement>("#medication-dialog")!;
  const details =
    document.querySelector<HTMLDialogElement>("#medicine-details")!;
  const appearance =
    document.querySelector<HTMLDialogElement>("#appearance-dialog")!;
  const failure = () => document.getElementById("status")?.textContent ?? "";
  let editSession = 0;

  function remove(id: string, parent?: string) {
    const medicine = getState()?.medicines[id];
    if (!medicine || getFamilyView()) return;
    requestDeletion({
      title: t("ui.delete-medicine"),
      message: t(
        "ui.delete-the-schedule-for-value-your-intake-history-will-be",
        medicine.name,
      ),
      success: t("ui.medication-schedule-deleted"),
      ...(parent ? { parent } : {}),
      change(state) {
        deleteSchedule(state, id, Date.now());
      },
    });
  }
  function openEditor(medicine?: MedicinePlan, target?: MedicineTarget) {
    if (editor.open || (getFamilyView() && !target)) return;
    editor.toggleAttribute("data-family-editor", Boolean(target));
    paintFeature(
      editor,
      <MedicineEditor
        key={++editSession}
        dialog={editor}
        appearance={appearance}
        medicine={medicine}
        target={target}
        pickers={pickers}
        formatDay={formatDay}
        failure={failure}
        save={(plan) =>
          mutate(
            (state) => {
              if (
                !saveMedicinePlan(
                  state,
                  plan,
                  medicine ? medicine.revision : null,
                  Date.now(),
                )
              )
                throw new CareInputError(
                  t(
                    "ui.this-schedule-changed-in-another-window-reopen-it-to-edit",
                  ),
                );
            },
            t("ui.medication-schedule-saved"),
            true,
          )
        }
        remove={(id) => remove(id, editor.id)}
      />,
    );
    editor.showModal();
    document.getElementById("editor-identity")?.focus({ preventScroll: true });
  }
  for (const dialog of [editor, details, appearance]) {
    dialog.addEventListener("close", () => {
      if (!dialog.open) clearFeature(dialog);
    });
  }
  function closeContext() {
    if (appearance.open) appearance.close();
    if (details.open) details.close();
    if (editor.open) editor.close();
  }

  function openDetails(medicine: MedicinePlan) {
    const view = getFamilyView();
    const history =
      !view || view.has("doses")
        ? Object.values(getState()?.doses ?? {})
            .filter((dose) => dose.medicineId === medicine.id && dose.status)
            .sort((a, b) => b.day - a.day || b.minute - a.minute)
        : undefined;
    paintFeature(
      details,
      <Details
        medicine={medicine}
        history={history}
        formatDay={formatDay}
        close={() => details.close()}
        edit={
          view
            ? undefined
            : () => {
                details.close();
                openEditor(medicine);
              }
        }
        remove={view ? undefined : () => remove(medicine.id, details.id)}
      />,
    );
    details.showModal();
  }

  function doseProps(
    medicine: MedicinePlan | undefined,
    dose: Dose,
    variant: DoseVariant,
    focusStatus?: string,
  ) {
    return {
      medicine,
      dose,
      variant,
      focusStatus,
      view: getFamilyView(),
      today: today(),
      snoozeMinutes: getState()?.medicationSnoozeMinutes ?? 10,
      save: (status: Parameters<typeof recordDose>[2], amount: number | null) =>
        mutate(
          (state) =>
            recordDose(state, dose, status, amount, today(), Date.now()),
          t(status === "snoozed" ? "ui.dose-snoozed" : "ui.dose-status-saved"),
          true,
          dose.day,
        ),
      failure,
    };
  }
  function todayDose(
    medicine: MedicinePlan | undefined,
    dose: Dose,
    featured: boolean,
    focusStatus?: string,
  ) {
    return (
      <article
        {...doseCardAttributes(medicine, dose, featured)}
        data-react-dose=""
        data-day-state={
          dose.status === "taken" || dose.status === "skipped"
            ? "done"
            : undefined
        }
      >
        <DoseContents
          {...doseProps(
            medicine,
            dose,
            featured ? "featured" : "day",
            focusStatus,
          )}
        />
      </article>
    );
  }

  function renderDose(
    medicine: MedicinePlan | undefined,
    dose: Dose,
    variant: DoseVariant,
    focusStatus?: string,
  ) {
    const host = document.createElement("article");
    const attributes = doseCardAttributes(
      medicine,
      dose,
      variant === "featured",
    );
    host.className = attributes.className;
    for (const [name, value] of Object.entries(attributes)) {
      if (name !== "className" && value !== undefined)
        host.setAttribute(name, value);
    }
    host.dataset.reactDose = "";
    paintFeature(
      host,
      <DoseContents {...doseProps(medicine, dose, variant, focusStatus)} />,
    );
    return host;
  }

  function renderMedications(daily: Dose[]) {
    const state = getState();
    if (!state) return;
    const view = getFamilyView();
    const canView = view?.has("medicines") !== false;
    const plans = Object.values(state.medicines);
    cabinet.hidden = !canView;
    paintFeature(
      cabinet,
      canView && (
        <Cabinet
          plans={plans}
          state={state}
          readOnly={Boolean(view)}
          formatDay={formatDay}
          open={openDetails}
          edit={openEditor}
          remove={remove}
          pause={(id, paused) =>
            mutate(
              (state) => setPaused(state, id, paused, Date.now()),
              t(
                paused
                  ? "ui.medication-schedule-paused"
                  : "ui.medication-schedule-resumed",
              ),
              true,
            )
          }
          refill={(id, amount) =>
            mutate(
              (state) => refillStock(state, id, amount),
              t("ui.purchase-added-to-stock"),
            )
          }
        />
      ),
    );
    summary.textContent =
      daily.length && view?.has("doses") !== false
        ? t(
            "ui.value-of-value-taken",
            localDigits(daily.filter((dose) => dose.status === "taken").length),
            localDigits(daily.length),
          )
        : canView
          ? plans.length === 1
            ? t("ui.1-medicine")
            : t("ui.value-medicines", localDigits(plans.length))
          : "";
    summary.hidden = !summary.textContent;
    paintFeature(
      doses,
      daily.length ? (
        daily.map((dose) => {
          const medicine = state.medicines[dose.medicineId];
          return (
            <article
              key={`${dose.medicineId}:${dose.day}:${dose.minute}`}
              {...doseCardAttributes(medicine, dose, false)}
            >
              <DoseContents
                key={`${dose.status}:${dose.actual}:${dose.planned}`}
                {...doseProps(medicine, dose, "day")}
              />
            </article>
          );
        })
      ) : (
        <p className="empty">
          {t("ui.no-medication-doses-scheduled-for-this-day")}
        </p>
      ),
    );
  }
  return { renderDose, todayDose, renderMedications, openEditor, closeContext };
}

export type RenderDose = ReturnType<typeof installMedication>["renderDose"];

export function disposeDoseCards(container: HTMLElement) {
  for (const card of container.querySelectorAll<HTMLElement>(
    "[data-react-dose]",
  ))
    clearFeature(card);
}

const normalize = (value: string) =>
  value
    .trim()
    .normalize("NFKC")
    .toLocaleLowerCase(locale)
    .replaceAll("ي", "ی")
    .replaceAll("ك", "ک");
interface CabinetProps {
  plans: MedicinePlan[];
  state: CareState;
  readOnly: boolean;
  formatDay(day: number): string;
  open(medicine: MedicinePlan): void;
  edit(medicine: MedicinePlan): void;
  remove(id: string): void;
  pause(id: string, paused: boolean): Promise<boolean>;
  refill(id: string, amount: number): Promise<boolean>;
}
function Cabinet({ plans, ...props }: CabinetProps) {
  const [search, setSearch] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const query = normalize(search);
  const matches = (medicine: MedicinePlan) =>
    normalize(medicine.name).includes(query);
  return (
    <>
      <label
        className="cabinet-search"
        id="cabinet-search-wrap"
        hidden={!query && plans.length < 2}
      >
        <svg aria-hidden="true">
          <use href="#i-search" />
        </svg>
        <input
          id="cabinet-search"
          type="search"
          placeholder={t("ui.search-medicines")}
          aria-label={t("ui.search-medicines")}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            if (list.current) list.current.scrollLeft = 0;
          }}
        />
      </label>
      <div
        id="plans"
        ref={list}
        role="region"
        aria-label={t("ui.medicine-list")}
        tabIndex={0}
      >
        {plans.length ? (
          plans.map((medicine) => (
            <Treatment
              key={medicine.id}
              medicine={medicine}
              hidden={!matches(medicine)}
              {...props}
            />
          ))
        ) : (
          <p className="empty">{t("ui.no-medicines-scheduled-yet")}</p>
        )}
      </div>
      <p
        className="empty"
        id="cabinet-empty"
        role="status"
        hidden={!plans.length || plans.some(matches)}
      >
        {t("ui.no-medicines-match-your-search")}
      </p>
    </>
  );
}

function Treatment({
  medicine,
  state,
  hidden,
  readOnly,
  formatDay,
  open,
  edit,
  remove,
  pause,
  refill,
}: Omit<CabinetProps, "plans"> & {
  medicine: MedicinePlan;
  hidden: boolean;
}) {
  const [pausing, setPausing] = useState<boolean | null>(null);
  const [purchase, setPurchase] = useState("");
  const [error, setError] = useState("");
  const buying = useRef(false);
  const stockPanel = useRef<HTMLDetailsElement>(null);
  const firstStage = medicine.phases[0];
  const stock = medicine.stock;
  const next =
    stock == null || medicine.paused
      ? null
      : nextPlannedDose(
          medicine.phases,
          medicine.dates,
          medicine.effectiveFrom,
          (day: number, minute: number) =>
            Boolean(state.doses[doseId(medicine, day, minute)]?.status),
        );
  const low =
    stock != null &&
    next &&
    isLowStock(
      stock,
      medicine.threshold ?? -Infinity,
      next.slot.milliUnits ?? 0,
    );

  async function buy() {
    if (buying.current) return;
    setError("");
    try {
      const added = quantity({ value: purchase });
      if (added === null || added === 0)
        throw new Error(t("ui.enter-a-purchase-amount-greater-than-zero"));
      buying.current = true;
      if (await refill(medicine.id, added)) {
        setPurchase("");
        if (stockPanel.current?.open) {
          stockPanel.current
            .querySelector("summary")
            ?.focus({ preventScroll: true });
          stockPanel.current.open = false;
        }
      }
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : t("ui.could-not-save-try-again"),
      );
    } finally {
      buying.current = false;
    }
  }
  return (
    <article
      className="medicine treatment"
      data-ink={medicineColor(medicine.color)}
      data-search={medicine.name}
      data-focus-scope={`medicine:${medicine.id}`}
      hidden={hidden}
    >
      <div className="treatment-profile">
        <MedicineArt shape={medicine.icon} color={medicine.color} banner />
        <div className="treatment-details">
          <div className="feature-head">
            <button
              type="button"
              className="text-button treatment-name"
              dir="auto"
              onClick={() => open(medicine)}
            >
              {medicine.name}
            </button>
            {!readOnly && (
              <input
                type="checkbox"
                role="switch"
                checked={!(pausing ?? medicine.paused)}
                aria-label={t("ui.active-schedule-for-value", medicine.name)}
                onChange={async (event) => {
                  if (pausing !== null) return;
                  const paused = !event.target.checked;
                  setPausing(paused);
                  try {
                    await pause(medicine.id, paused);
                  } finally {
                    setPausing(null);
                  }
                }}
              />
            )}
          </div>
          <p className="quiet">
            {t(medicine.paused ? "ui.schedule-paused" : "ui.schedule-active")}
          </p>
          {(medicine.instructions || medicine.sharedInstructions) && (
            <p>{medicine.instructions || medicine.sharedInstructions}</p>
          )}
          {medicine.phased || medicine.phases.length > 1 ? (
            <p>{t("ui.value-stage-s", localDigits(medicine.phases.length))}</p>
          ) : (
            firstStage && (
              <p>
                {t(
                  "ui.dose-times-value",
                  firstStage.slots
                    .map((slot) => localDigits(timeText(slot.minute)))
                    .join(" · "),
                )}
              </p>
            )
          )}
          {firstStage && (
            <p>{t("ui.starts-value", formatDay(firstStage.start))}</p>
          )}
        </div>
      </div>
      {stock != null && (
        <p data-warning={String(Boolean(low))}>
          {t(
            "ui.stock-value-value-value",
            amountText(stock),
            doseUnit(medicine.unit, stock),
            low ? t("ui.time-to-refill") : "",
          )}
        </p>
      )}
      {!readOnly && stock != null && (
        <details className="editor-options refill" ref={stockPanel}>
          <summary>{t("ui.refill-stock")}</summary>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void buy();
            }}
          >
            <label>
              {t("ui.amount-purchased")}
              <input
                dir="ltr"
                inputMode="decimal"
                maxLength={11}
                required
                value={purchase}
                onChange={(event) => {
                  setPurchase(event.target.value);
                  setError("");
                }}
              />
            </label>
            <button type="submit">{t("ui.log-purchase")}</button>
            {error && (
              <p className="field-error" role="status">
                {error}
              </p>
            )}
          </form>
        </details>
      )}
      {!readOnly && (
        <div className="buttons">
          <button
            type="button"
            className="text-button"
            onClick={() => edit(medicine)}
          >
            {t("ui.edit")}
          </button>
          <button
            type="button"
            className="text-button danger-link"
            onClick={() => remove(medicine.id)}
          >
            {t("ui.delete-medicine")}
          </button>
        </div>
      )}
    </article>
  );
}

function Details({
  medicine,
  history,
  formatDay,
  close,
  edit,
  remove,
}: {
  medicine: MedicinePlan;
  history: Dose[] | undefined;
  formatDay(day: number): string;
  close(): void;
  edit: (() => void) | undefined;
  remove: (() => void) | undefined;
}) {
  const art = { shape: medicine.icon, color: medicine.color };
  return (
    <>
      <div className="sheet-header">
        <span id="medicine-details-icon">
          <MedicineArt {...art} />
        </span>
        <h2 id="medicine-details-title">{medicine.name}</h2>
        <button
          className="icon-button"
          type="button"
          data-close="medicine-details"
          aria-label={t("ui.close")}
          onClick={close}
        >
          <svg aria-hidden="true">
            <use href="#i-close" />
          </svg>
        </button>
      </div>
      <div id="medicine-details-body" className="sheet-body">
        <MedicineArt {...art} banner />
        <p>
          {medicine.instructions ||
            medicine.sharedInstructions ||
            t("ui.no-instructions-added")}
        </p>
        {edit && (
          <button type="button" onClick={edit}>
            {t("ui.edit-medicine")}
          </button>
        )}
        {remove && (
          <button
            type="button"
            className="text-button danger-link"
            onClick={remove}
          >
            {t("ui.delete-medicine")}
          </button>
        )}
        {history && (
          <>
            <h3>{t("ui.dose-history")}</h3>
            {history.length ? (
              <ul className="dose-history">
                {history.map((dose) => (
                  <li key={`${dose.day}:${dose.minute}`}>
                    {`${formatDay(dose.day)}، ${localDigits(timeText(dose.minute))} · ${dose.status ? doseStates[dose.status] : ""}`}
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t("ui.no-doses-logged-yet")}</p>
            )}
          </>
        )}
      </div>
    </>
  );
}
