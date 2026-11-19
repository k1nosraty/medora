import { t } from "../../../../web/public/medication/shared/i18n/locale.js";

export interface CycleDayLabel {
  flow?: string;
  symptoms?: Record<string, number>;
  tags?: string;
  note?: string;
}
export function describeCycleDay(row: CycleDayLabel) {
  const flow =
    row.flow === "none"
      ? t("ui.cycle-no-flow")
      : row.flow === "spotting"
        ? t("ui.cycle-spotting")
        : row.flow
          ? t(`ui.cycle-flow-${row.flow}`)
          : "";
  return [
    flow,
    ...Object.entries(row.symptoms ?? {}).map(
      ([key, severity]) =>
        t(`ui.cycle-${key}`) + " (" + t(`ui.cycle-strength-${severity}`) + ")",
    ),
    row.tags,
    row.note,
  ].filter(Boolean);
}
