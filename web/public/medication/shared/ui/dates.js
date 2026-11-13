import { t } from "../i18n/locale.js";
import { dayMs } from "../../domain/wall-clock.js";

export function dayNumber(iso) {
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(ms) || !/^\d{4}-\d{2}-\d{2}$/.test(iso) || new Date(ms).toISOString().slice(0, 10) !== iso) {
    throw new Error(t("تاریخ را کامل وارد کنید."));
  }
  return ms / dayMs;
}
export const localDayNumber = date => dayNumber([
  String(date.getFullYear()).padStart(4, "0"),
  String(date.getMonth() + 1).padStart(2, "0"),
  String(date.getDate()).padStart(2, "0")
].join("-"));
export const today = () => localDayNumber(new Date());
