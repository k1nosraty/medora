import { describeCycleDay as describeDay } from "../../product-assets/public/medication/features/cycle/tools.js";
import { t } from "../../product-assets/public/medication/shared/i18n/locale.js";

export interface CycleDayLabel {
  flow?: string;
  symptoms?: Record<string, number>;
  tags?: string;
  note?: string;
}
export function describeCycleDay(row: CycleDayLabel): string[] {
  return describeDay(row, t);
}
