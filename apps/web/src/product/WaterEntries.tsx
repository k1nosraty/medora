import { paintFeature } from "./renderer";
import { t } from "../../../../web/public/medication/shared/i18n/locale.js";

export interface WaterEntry {
  id: string;
  day: number;
  amount: number;
  time: string;
  recordedBy?: string;
}
interface HistoryProps {
  entries: WaterEntry[];
  view: { authorName(entry: WaterEntry): string } | null | undefined;
  label(entry: WaterEntry): string;
  edit(entry: WaterEntry): void;
  remove(entry: WaterEntry): void;
}
const action = "secondary glass-secondary-action tracker-utility";
function WaterEntries({ entries, view, label, edit, remove }: HistoryProps) {
  if (!entries.length)
    return <p className="empty">{t("ui.no-water-logged-for-this-day")}</p>;
  return entries.map((entry) => (
    <article
      key={entry.id}
      className="entry-row program-water"
      data-focus-scope={"water:" + entry.id}
    >
      <span>{label(entry)}</span>
      {view ? (
        entry.recordedBy && (
          <small className="family-stamp">
            {t("ui.recorded-by-value", view.authorName(entry))}
          </small>
        )
      ) : (
        <>
          <button type="button" className={action} onClick={() => edit(entry)}>
            {t("ui.edit")}
          </button>
          <button
            type="button"
            className={action + " water-entry-remove"}
            onClick={() => remove(entry)}
          >
            {t("ui.delete-entry")}
          </button>
        </>
      )}
    </article>
  ));
}
export function renderEntries(host: HTMLElement, props: HistoryProps) {
  paintFeature(host, <WaterEntries {...props} />);
}
