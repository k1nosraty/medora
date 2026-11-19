import { locale, t } from "../../shared/i18n/locale.js";

const number = new Intl.NumberFormat(locale).format;
export const sleepImage = () => {
  const image = new Image(256, 256);
  image.src = "/medication/assets/illustrations/sleep.webp";
  image.alt = "";
  image.className = "glass-object";
  return image;
};

export function sleepDuration(minutes) {
  if (!minutes) return t("ui.sleep-less-than-minute");
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return [hours && t("ui.sleep-hours", number(hours)), rest && t("ui.value-min", number(rest))].filter(Boolean).join(locale === "fa-IR" ? " و " : " ");
}
