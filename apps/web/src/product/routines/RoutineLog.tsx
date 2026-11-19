import { useRef, useState, type ReactNode } from "react";
import { t } from "../../../product-assets/public/medication/shared/i18n/locale.js";
import { integer } from "../../../product-assets/public/medication/shared/ui/input-values.js";
import { routineComplete } from "@medora/domain/browser/routine-plan";
import { Icon } from "../PlanCard";
import { displayAmount, type Activity, type Progress } from "./model";

export function RoutineLog({
  activity,
  dialog,
  banner,
  save,
  failure,
  onSaved,
}: {
  activity: Activity;
  dialog: HTMLDialogElement;
  banner: ReactNode;
  save(progress: Progress): Promise<boolean>;
  failure(): string;
  onSaved(): void;
}) {
  const { entry, plan, readOnly } = activity;
  const [amount, setAmount] = useState(String(entry.amount ?? ""));
  const [checks, setChecks] = useState(entry.checked ?? []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const quantity = entry.mode === "quantity";
  const notes = plan?.notes || plan?.sharedNotes;
  async function submit() {
    if (lock.current || readOnly) return;
    const result =
      entry.mode === "done" ? true : quantity ? integer(amount) : checks;
    if (typeof result === "number" && !Number.isInteger(result)) {
      setError(t("ui.enter-0-to-99-999-zero-clears-the-entry"));
      dialog.querySelector<HTMLInputElement>("#routine-amount")?.focus();
      return;
    }
    lock.current = true;
    setPending(true);
    try {
      if (await save(result)) {
        dialog.close();
        onSaved();
      } else setError(failure() || t("ui.could-not-save-try-again"));
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <form
      id="routine-log-form"
      className="sheet-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="routine-log-header">
        <div id="routine-log-banner">{banner}</div>
        <button
          type="button"
          className="icon-button"
          data-close="routine-log-dialog"
          aria-label={t("ui.close")}
          onClick={() => dialog.close()}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="sheet-body routine-fields">
        <p id="routine-log-notes" className="quiet" dir="auto" hidden={!notes}>
          {notes}
        </p>
        <label id="routine-amount-field" hidden={!quantity || readOnly}>
          {t("ui.amount-done-so-far")}
          <input
            id="routine-amount"
            inputMode="numeric"
            dir="ltr"
            maxLength={5}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <small id="routine-log-goal">
            {quantity
              ? t("ui.goal-value", displayAmount(entry, entry.target ?? 0))
              : ""}
          </small>
        </label>
        <div id="routine-log-steps" className="routine-fields">
          {!readOnly &&
            entry.mode === "steps" &&
            entry.steps?.map((step, index) => (
              <label key={index} className="routine-check">
                <input
                  type="checkbox"
                  value={index}
                  checked={checks.includes(index)}
                  onChange={(event) =>
                    setChecks(
                      event.target.checked
                        ? [...checks, index]
                        : checks.filter((check) => check !== index),
                    )
                  }
                />
                <span dir="auto">{step}</span>
              </label>
            ))}
          {readOnly && !routineComplete(entry) && (
            <p className="quiet">
              {t("ui.this-occurrence-can-no-longer-be-logged")}
            </p>
          )}
        </div>
        <p id="routine-log-status" className="field-error" role="alert">
          {error}
        </p>
        <button
          id="routine-log-save"
          type="submit"
          className="block-action"
          hidden={readOnly}
          disabled={pending}
        >
          {t(entry.mode === "done" ? "انجام دادم" : "ذخیرهٔ پیشرفت")}
        </button>
      </div>
    </form>
  );
}
