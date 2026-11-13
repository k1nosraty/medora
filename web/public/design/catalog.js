import { illustration } from "../medication/design/artwork.js";
import { appearanceColors, medicationBadge, medicineShapes } from "../medication/features/medicines/appearance.js";
import { visitIllustration } from "../medication/features/appointments/view.js";
import { routineIllustration } from "../medication/features/routines/illustration.js";
import { routineLabels } from "../medication/features/routines/catalog.js";
import { t } from "../medication/shared/i18n/locale.js";

const icon = (id, viewBox, className) => () => illustration("#" + id, { viewBox, className });
const item = (id, label, family, render) => ({ id, label, family, render });
const controls = {
  mark: "نشان مدورا", water: "قطرهٔ آب", pill: "کپسول", bottle: "بطری دارو", calendar: "تقویم",
  reports: "گزارش‌ها", settings: "تنظیمات", bell: "اعلان", globe: "زبان", search: "جست‌وجو",
  sun: "امروز", user: "حساب مدورا", plus: "افزودن", lock: "قفل", close: "بستن", back: "بازگشت",
  expand: "باز کردن", check: "تأیید", landscape: "تصویر خوش‌آمد"
};

export const cycleArt = icon("design-cycle", "0 0 112 102", "category-art");
export const glass = icon("art-report-water", "0 0 128 100", "category-art");
export const complete = icon("art-today-complete", "0 0 80 80");

export function readCatalog(visitOptions) {
  return [
    ...Object.entries(medicineShapes).map(([id, label]) => item(id, label, "medicine", color => medicationBadge(id, color || "purple"))),
    item("blister", t("بلیستر قرص"), "medicine", color => {
      const badge = medicationBadge("tablet", color || "purple");
      badge.firstElementChild.setAttribute("href", "#art-blister");
      return badge;
    }),
    ...[...visitOptions].map(({ value, text }) => item(value, text, "visit", () => visitIllustration(value))),
    ...Object.entries(routineLabels).map(([id, label]) => item(id, t(label), "routine", () => routineIllustration(id))),
    item("water", t("مصرف آب"), "water", glass),
    item("complete", t("همهٔ نوبت‌ها بررسی شدند"), "image", complete),
    item("welcome", t("امروز با مدورا"), "image", () => {
      const image = new Image();
      image.src = "/medication/assets/illustrations/care.svg";
      image.className = "gallery-illustration";
      image.alt = "";
      return image;
    }),
    item("cycle", t("چرخه"), "cycle", cycleArt),
    ...Object.entries(controls).map(([id,label]) =>
      item(id, t(label), "control", icon("i-" + id, document.getElementById("i-" + id).getAttribute("viewBox"), "gallery-icon-line")))
  ];
}

export { appearanceColors };
