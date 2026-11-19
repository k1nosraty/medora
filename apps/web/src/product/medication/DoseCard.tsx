import { useRef, useState } from "react";
import {
  doseTime,
  timeText,
} from "@medora/domain/browser/care-index";
import {
  amountText,
  doseUnit,
  quantity,
} from "../../../product-assets/public/medication/features/medicines/quantity.js";
import {
  listSeparator,
  locale,
  localDigits,
  t,
} from "../../../product-assets/public/medication/shared/i18n/locale.js";
import type { FamilyView } from "../productState";
import { MedicineArt, medicineColor } from "./MedicineArt";
import {
  doseStates,
  hasSlot,
  type Dose,
  type DoseStatus,
  type MedicinePlan,
} from "./model";

export function doseCardAttributes(
  medicine: MedicinePlan | undefined,
  dose: Dose,
  featured: boolean,
) {
  return {
    className: "medicine dose-card day-card",
    "data-card-kind": "medicine",
    "data-featured": featured ? "" : undefined,
    "data-ink": medicineColor(
      medicine?.color ?? dose.color ?? dose.historyPlan?.color,
    ),
    "data-focus-scope": `dose:${dose.medicineId}:${dose.day}:${dose.minute}`,
  };
}

export type DoseVariant = "featured" | "calendar" | "day";
export interface DoseCardProps {
  medicine: MedicinePlan | undefined;
  dose: Dose;
  variant: DoseVariant;
  focusStatus?: string | undefined;
  view: FamilyView | null;
  today: number;
  snoozeMinutes: number;
  save(status: DoseStatus, amount: number | null): Promise<boolean>;
  failure(): string;
}

export function DoseContents({
  medicine,
  dose,
  variant,
  focusStatus,
  view,
  today,
  snoozeMinutes,
  save,
  failure,
}: DoseCardProps) {
  const [error, setError] = useState("");
  const [amount, setAmount] = useState(() =>
    dose.actual == null ? "" : amountText(dose.actual),
  );
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const menu = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const plan = dose.historyPlan ?? medicine;
  const unit = dose.unit ?? plan?.unit ?? "";
  const color = medicineColor(medicine?.color ?? dose.color ?? plan?.color);
  const icon = medicine?.icon ?? dose.icon ?? plan?.icon;
  const name = dose.name || plan?.name || t("ui.medicine");
  const instructions =
    dose.instructions || plan?.instructions || plan?.sharedInstructions;
  const planned =
    dose.planned === null
      ? ""
      : `${amountText(dose.planned)} ${doseUnit(unit, dose.planned)}`;
  const scheduled =
    (view?.timeOf ?? doseTime)(dose.day, dose.minute) ?? Number.NaN;
  let recorded = dose.status
    ? doseStates[dose.status]
    : t(
        variant === "calendar"
          ? scheduled > Date.now()
            ? "برنامه‌ریزی‌شده"
            : "بدون ثبت"
          : "در انتظار ثبت",
      );
  if (dose.status === "taken" && dose.actual != null)
    recorded += `${listSeparator}${amountText(dose.actual)} ${doseUnit(unit, dose.actual)}`;
  const featured = variant === "featured";
  const snoozedTime =
    featured && dose.status === "snoozed" ? dose.snoozeUntil : null;
  const time = snoozedTime
    ? new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(
        snoozedTime,
      )
    : localDigits(timeText(dose.minute));

  function closeOptions() {
    if (menu.current?.open) {
      if (menu.current.contains(document.activeElement))
        summary.current?.focus({ preventScroll: true });
      menu.current.open = false;
    }
  }

  async function record(status: DoseStatus) {
    if (saving.current) return;
    setError("");
    let entered;
    try {
      entered = status === "taken" ? quantity({ value: amount }, true) : null;
      if (entered === 0)
        throw new Error(t("ui.enter-an-amount-greater-than-zero"));
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : t("ui.could-not-save-try-again"),
      );
      return;
    }
    saving.current = true;
    setPending(true);
    try {
      if (await save(status, entered)) closeOptions();
      else setError(failure() || t("ui.could-not-save-try-again"));
    } finally {
      saving.current = false;
      setPending(false);
    }
  }

  const unresolved = !dose.status || dose.status === "snoozed";
  const canSnooze = Boolean(
    medicine &&
    dose.day === today &&
    !medicine.paused &&
    !dose.historyPlan &&
    hasSlot(medicine, dose),
  );
  const takenLabel = t(
    dose.status === "taken" ? "ui.edit-intake" : "ui.mark-as-taken",
  );
  const taken = (
    <button
      className={"secondary" + (unresolved ? " care-record-action" : "")}
      type="button"
      data-focus-key={featured && unresolved ? "day-focus-record" : undefined}
      disabled={pending}
      onClick={() => void record("taken")}
    >
      {featured && unresolved && <Icon name="check" />}
      {takenLabel}
    </button>
  );
  const snooze = (prominent: boolean) => (
    <button
      className={prominent ? "secondary day-card-snooze" : "secondary"}
      type="button"
      disabled={pending}
      onClick={() => {
        closeOptions();
        void record("snoozed");
      }}
    >
      {prominent && <Icon name="clock" />}
      {t("ui.in-value-min", localDigits(snoozeMinutes))}
    </button>
  );
  function placeOptions(details: HTMLDetailsElement) {
    const panel = details.querySelector<HTMLElement>(".day-card-menu");
    const card = details.closest(".day-card");
    if (!panel || !card) return;
    panel.style.removeProperty("inset-block-start");
    panel.style.removeProperty("inset-block-end");
    panel.style.removeProperty("max-block-size");
    if (!details.open) return;
    const dock = document.getElementById("app-dock");
    const dockTop = dock?.getBoundingClientRect().top;
    const bottom = dockTop ? Math.min(dockTop, innerHeight) : innerHeight;
    const bounds = panel.getBoundingClientRect();
    if (bounds.bottom <= bottom) return;
    const headerBottom =
      document.querySelector(".app-bar")?.getBoundingClientRect().bottom ?? 0;
    const above = card.getBoundingClientRect().top - headerBottom - 8;
    const below = bottom - bounds.top - 4;
    if (above > below) {
      panel.style.insetBlockStart = "auto";
      panel.style.insetBlockEnd = "calc(100% + .25rem)";
    }
    panel.style.maxBlockSize = Math.max(80, Math.max(above, below)) + "px";
  }

  const options = (
    <details
      name="day-card-options"
      className="day-card-more"
      ref={menu}
      onToggle={(event) => placeOptions(event.currentTarget)}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !event.currentTarget.open) return;
        event.preventDefault();
        event.stopPropagation();
        closeOptions();
      }}
    >
      <summary aria-label={t("ui.dose-options")} ref={summary}>
        ⋯
      </summary>
      <div className="day-card-menu">
        <form
          className="day-card-dose-form"
          onSubmit={(event) => {
            event.preventDefault();
            void record("taken");
          }}
        >
          <label>
            {t("ui.actual-dose-taken")}
            <input
              dir="ltr"
              inputMode="decimal"
              maxLength={11}
              value={amount}
              placeholder={
                dose.planned == null ? undefined : amountText(dose.planned)
              }
              onChange={(event) => {
                setAmount(event.target.value);
                setError("");
              }}
            />
          </label>
          <button type="submit" className="secondary" disabled={pending}>
            {takenLabel}
          </button>
          <p className="field-error" role="status">
            {error}
          </p>
        </form>
        {canSnooze && snooze(false)}
        {dose.status !== "skipped" && (
          <button
            className="secondary"
            type="button"
            disabled={pending}
            onClick={() => {
              closeOptions();
              void record("skipped");
            }}
          >
            {t("ui.skip-dose")}
          </button>
        )}
        {dose.status && (
          <button
            className="secondary"
            type="button"
            disabled={pending}
            onClick={() => {
              closeOptions();
              void record(null);
            }}
          >
            {t("ui.undo-log")}
          </button>
        )}
      </div>
    </details>
  );
  let actions;
  if (view) {
    if (
      medicine &&
      (!medicine.paused || dose.historyPlan) &&
      unresolved &&
      scheduled <= Date.now() &&
      view.canRecord("medicine", dose.day)
    ) {
      actions = (
        <button
          type="button"
          className="secondary care-record-action"
          data-focus-key={featured ? "day-focus-record" : undefined}
          onClick={() =>
            view.record({
              kind: "medicine",
              day: dose.day,
              id: medicine.id,
              minute: dose.minute,
              amount: dose.planned,
              title: name,
              unit,
            })
          }
        >
          {featured && <Icon name="check" />}
          {t("ui.log-dose")}
        </button>
      );
    }
  } else if (
    dose.day <= today &&
    medicine &&
    (!medicine.paused || dose.historyPlan)
  ) {
    actions = featured ? (
      <>
        {taken}
        {unresolved && canSnooze && snooze(true)}
        {options}
      </>
    ) : (
      <>
        {options}
        {unresolved && taken}
      </>
    );
  }
  const art = (
    <div className="day-card-art" aria-hidden="true">
      <MedicineArt shape={icon} color={color} />
    </div>
  );
  const category = <small className="day-card-kind">{t("ui.medicine")}</small>;
  const clock = (
    <time
      className="day-card-time"
      dateTime={
        snoozedTime
          ? new Date(snoozedTime).toISOString()
          : timeText(dose.minute)
      }
    >
      <bdi dir="ltr">{time}</bdi>
    </time>
  );
  const content = (
    <div className="day-card-content">
      {focusStatus ? (
        <div className="day-focus-context">
          {clock}
          <span className="day-focus-status">{focusStatus}</span>
        </div>
      ) : (
        category
      )}
      <h3 className="day-card-title" dir="auto">
        {name}
      </h3>
      {!focusStatus && clock}
      {featured && planned && (
        <small className="day-card-summary">{planned}</small>
      )}
      <div className="day-card-details">
        {((!featured && (!view || view.has("doses"))) ||
          (!featured && planned) ||
          instructions) && (
          <div className="dose-result">
            {!featured && (!view || view.has("doses")) && (
              <p className="badge" data-status={dose.status ?? "pending"}>
                {recorded}
              </p>
            )}
            {!featured && planned && <p>{planned}</p>}
            {instructions && <p>{instructions}</p>}
          </div>
        )}
        {view && dose.recordedBy && (
          <small className="family-stamp">
            {t("ui.recorded-by-value", view.authorName(dose))}
          </small>
        )}
        {!view &&
          actions &&
          dose.status === "snoozed" &&
          dose.snoozeUntil != null && (
            <p className="dose-snoozed">
              {t(
                "ui.next-reminder-value",
                new Intl.DateTimeFormat(locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(dose.snoozeUntil),
              )}
            </p>
          )}
        {error && !menu.current?.open && (
          <p role="status" className="field-error">
            {error}
          </p>
        )}
      </div>
    </div>
  );
  const actionBar = actions && (
    <div className="day-card-actions">{actions}</div>
  );
  return focusStatus ? (
    <>
      <div className="day-focus-media">
        {art}
        {category}
      </div>
      <div className="day-focus-copy">
        {content}
        {actionBar}
      </div>
    </>
  ) : (
    <>
      {art}
      {content}
      {actionBar}
    </>
  );
}

function Icon({ name }: { name: string }) {
  return (
    <svg aria-hidden="true">
      <use href={"#i-" + name} />
    </svg>
  );
}
