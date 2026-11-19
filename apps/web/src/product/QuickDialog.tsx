import { Icon, PlanArtwork } from "./PlanCard";
import { paintFeature } from "./renderer";
import { t } from "../../product-assets/public/medication/shared/i18n/locale.js";
import type { EntryKind } from "./entryActions";
import type { FamilyView } from "./product";

const kinds = [
  ["medicine", "ui.add-medicine", "bottle"],
  ["visit", "ui.new-appointment", "visit-main"],
  ["routine", "ui.new-routine", "routine-main"],
  ["water", "ui.log-water", "water"],
  ["cycle", "ui.log-cycle", "cycle"],
  ["sleep", "ui.sleep-log", "sleep"],
] as const;

export function renderQuickDialog({
  view,
  day,
  today,
  cycle,
  sleep,
  select,
}: {
  view: FamilyView | null;
  day: number;
  today: number;
  cycle: boolean;
  sleep: boolean;
  select(kind: EntryKind, control: HTMLElement): void;
}) {
  const dialog = document.querySelector<HTMLDialogElement>("#quick-dialog")!;
  const visible = kinds.map(([kind]) =>
    view
      ? kind === "water" || kind === "cycle"
        ? view.canRecord(kind, day)
        : view.canAdd(kind)
      : (kind !== "cycle" || cycle) && (kind !== "sleep" || sleep),
  );
  document.getElementById("open-quick")!.hidden = !visible.some(Boolean);
  paintFeature(
    dialog,
    <>
      <div className="sheet-header">
        <Icon name="plus" />
        <h2 id="quick-title">{t("ui.what-would-you-like-to-add")}</h2>
        <button
          type="button"
          className="icon-button"
          data-close="quick-dialog"
          aria-label={t("ui.close")}
          onClick={() => dialog.close()}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="sheet-body quick-items">
        {kinds.map(([kind, label, artwork], index) => (
          <button
            type="button"
            key={kind}
            className={`secondary quick-item program-${kind}`}
            id={
              kind === "sleep" || kind === "cycle" ? "quick-" + kind : undefined
            }
            data-quick-kind={kind}
            data-open-medication={kind === "medicine" ? "" : undefined}
            data-open-visit={kind === "visit" ? "" : undefined}
            data-open-routine={kind === "routine" ? "" : undefined}
            data-open-water={kind === "water" ? "" : undefined}
            hidden={!visible[index]}
            disabled={!view && kind === "water" && day > today}
            onClick={(event) => {
              event.stopPropagation();
              dialog.close();
              select(kind, event.currentTarget);
            }}
          >
            {kind === "sleep" ? (
              <img
                className="glass-object category-art"
                src="/medication/assets/illustrations/sleep.webp"
                width="256"
                height="256"
                alt=""
              />
            ) : (
              <PlanArtwork id={artwork} className="category-art" eager />
            )}
            {t(label)}
          </button>
        ))}
      </div>
    </>,
  );
}
