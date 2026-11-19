import { useRef, useState } from "react";
import { artworkPath } from "../../../product-assets/public/medication/design/three-dimensional.js";
import { quantityFromText } from "../../../product-assets/public/medication/domain/medication-rules.js";
import { t } from "../../../product-assets/public/medication/shared/i18n/locale.js";
import { clearFeature, paintFeature } from "../renderer";
import type { FamilyDoseRecord } from "./model";

interface DelegatedDoseForm {
  title: string;
  member: string;
  dose: Pick<FamilyDoseRecord, "amount" | "unit">;
  showError(problem: Error): void;
  clearError(): void;
  save(
    status: "taken" | "skipped",
    actual: number | null | undefined,
  ): Promise<void>;
}

export function renderFamilyDoseForm(
  host: HTMLElement,
  options: DelegatedDoseForm,
) {
  paintFeature(host, <FamilyDoseForm {...options} />);
  return () => clearFeature(host);
}

function FamilyDoseForm({
  title,
  member,
  dose,
  showError,
  clearError,
  save,
}: DelegatedDoseForm) {
  const [taken, setTaken] = useState(true);
  const [amount, setAmount] = useState(
    dose.amount == null ? "" : String(dose.amount / 1000),
  );
  const [pending, setPending] = useState(false);
  const submitLock = useRef(false);

  async function submit() {
    if (submitLock.current) return;
    clearError();
    const actual = amount ? quantityFromText(amount) : undefined;
    if (taken && amount && !actual) {
      showError(new Error("invalid"));
      return;
    }
    submitLock.current = true;
    setPending(true);
    try {
      await save(taken ? "taken" : "skipped", actual);
    } catch (error) {
      showError(error instanceof Error ? error : new Error("unavailable"));
    } finally {
      submitLock.current = false;
      setPending(false);
    }
  }

  return (
    <form
      className="family-content"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="family-hero">
        <div>
          <h3>{title}</h3>
          <p className="quiet">{member}</p>
        </div>
        <img
          className="glass-object"
          data-art="bottle"
          width={256}
          height={256}
          decoding="async"
          loading="lazy"
          src={artworkPath("bottle", document.body.dataset.finish, undefined)}
          alt=""
        />
      </div>
      <p className="family-card">
        {t("ui.your-name-will-be-attached-to-the-entry")}
      </p>
      <label>
        {t("وضعیت مصرف")}
        <select
          name="status"
          value={taken ? "taken" : "skipped"}
          onChange={(event) => setTaken(event.target.value === "taken")}
        >
          <option value="taken">{t("دارو را دادم")}</option>
          <option value="skipped">{t("مصرف نشد")}</option>
        </select>
      </label>
      <label>
        {t("مقدار مصرف واقعی")}
        {dose.unit && " · " + dose.unit}
        <input
          name="amount"
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>
      <button className="block-action" type="submit" disabled={pending}>
        {t("ذخیره برای {0}", member)}
      </button>
    </form>
  );
}
