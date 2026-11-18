import { language, t } from "../../shared/i18n/locale.js";
import { element } from "../../shared/ui/dom.js";

export const defaultMedicineIcon = "bottle";
export const defaultMedicineColor = "purple";
export const medicineShapes = {
  bottle: t("ui.medicine-bottle"), tablet: language === "en" ? "Tablet" : "قرص", capsule: t("ui.capsule"), syrup: t("ui.syrup"), injection: t("ui.ampoule"),
  ointment: t("ui.ointment"), drops: t("ui.drops"), spray: t("ui.spray"), sachet: t("ui.sachet"), powder: t("ui.powder")
};
export const appearanceColors = {
  gold: t("ui.gold"), peach: t("ui.peach"), coral: t("ui.coral"), rose: t("ui.pink"), purple: t("ui.lilac"),
  indigo: t("ui.indigo"), blue: t("ui.blue"), green: t("ui.teal"), pistachio: t("ui.pistachio"), slate: t("ui.gray")
};

export function mountAppearanceColors(grid, name) {
  return Object.entries(appearanceColors).map(([color, title]) => {
    const choice = element("input");
    choice.type = "radio";
    choice.name = name;
    choice.value = color;
    choice.dataset.ink = color;
    const label = element("label");
    label.append(choice, element("span", title));
    grid.append(label);
    return choice;
  });
}
