import { useApp } from "../context";
import {
  addStock,
  changeVisit,
  visitDay,
  setPaused,
  type Fields,
  type Kind,
} from "../../../../packages/domain/src/care";
interface Props {
  kind: Kind;
  row: Fields;
  id: string;
  today: number;
  pending: boolean;
  change: (fn: (state: Fields) => void) => void;
}
export function PlanActions({ kind, row, id, today, pending, change }: Props) {
  const { t, locale } = useApp();
  if (kind === "medicines" || kind === "routines")
    return (
      <div className="plan-actions">
        <button
          className="secondary"
          disabled={pending}
          onClick={() =>
            change((s) => setPaused(s, kind, id, !row.paused, Date.now()))
          }
        >
          {row.paused ? t.resume : t.pause}
        </button>
        {kind === "medicines" && typeof row.stock === "number" && (
          <details>
            <summary>
              {t.balance} ·{" "}
              {new Intl.NumberFormat(locale).format(row.stock / 1000)}{" "}
              {String(row.unit ?? "")}
            </summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                change((s) => addStock(s, id, String(data.get("amount"))));
              }}
            >
              <label>
                {t.refill}
                <input
                  required
                  inputMode="decimal"
                  name="amount"
                  maxLength={11}
                />
              </label>
              <button disabled={pending}>{t.save}</button>
            </form>
          </details>
        )}
      </div>
    );
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (kind === "visits")
    return (
      <div className="plan-actions">
        {Boolean(row.cancelled) && <small>{t.cancelled}</small>}
        <button
          className="secondary"
          disabled={pending}
          onClick={() =>
            change((s) =>
              changeVisit(
                s,
                id,
                row.cancelled ? "restore" : "cancel",
                today,
                zone,
                Date.now(),
              ),
            )
          }
        >
          {row.cancelled ? t.restoreVisit : t.cancelVisit}
        </button>
        {!row.cancelled && visitDay(row, zone) <= today && (
          <button
            disabled={pending}
            aria-pressed={Boolean(row.completed)}
            onClick={() =>
              change((s) =>
                changeVisit(
                  s,
                  id,
                  row.completed ? "unattend" : "attend",
                  today,
                  zone,
                  Date.now(),
                ),
              )
            }
          >
            {row.completed ? t.undoAttendance : t.attend}
          </button>
        )}
      </div>
    );
  return null;
}
