import { appearanceColors, medicineShapes } from "../medication/features/medicines/appearance.js";
import { controlGlass, glassObject, medicineGlass, routineGlass, visitGlass } from "./glass.js";
import { routineLabels } from "../medication/features/routines/catalog.js";
import { language, t } from "../medication/shared/i18n/locale.js";

const item = (id, label, family, render) => ({ id, label, family, render });
const controls = {
  mark: "نشان مدورا", water: "قطرهٔ آب", pill: "کپسول", bottle: "بطری دارو", calendar: "تقویم",
  reports: "گزارش‌ها", settings: "تنظیمات", bell: "اعلان", globe: "زبان", search: "جست‌وجو",
  sun: "امروز", user: "حساب مدورا", plus: "افزودن", lock: "قفل", close: "بستن", back: "بازگشت",
  expand: "باز کردن", check: "تأیید", landscape: "تصویر خوش‌آمد"
};

export const cycleArt = () => glassObject("cycle", "cycle", { className: "category-art" });
export const glass = () => glassObject("water", "water", { className: "category-art" });
export const complete = accent => glassObject("complete", "image", { accent });
export const heart = accent => glassObject("heart", "image", { accent, className: "story-art" });

export function readCatalog(visitOptions) {
  return [
    ...Object.entries(medicineShapes).map(([id, label]) => item(id, label, "medicine", color => medicineGlass(id, color))),
    item("blister", t("بلیستر قرص"), "medicine", color => medicineGlass("blister", color)),
    ...[...visitOptions].map(({ value, text }) => item(value, text, "visit", color => visitGlass(value, color))),
    ...Object.entries(routineLabels).map(([id, label]) => item(id, t(label), "routine", color => routineGlass(id, color))),
    item("water", t("مصرف آب"), "water", glass),
    item("complete", t("همهٔ نوبت‌ها بررسی شدند"), "image", (_, accent) => complete(accent)),
    item("welcome", t("امروز با مدورا"), "image", (_, accent) => heart(accent)),
    item("cycle", t("چرخه"), "cycle", cycleArt),
    item("flow", language === "fa" ? "شدت خون‌ریزی" : "Flow", "cycle", () => glassObject("cycle-flow", "cycle")),
    item("spotting", language === "fa" ? "لکه‌بینی" : "Spotting", "cycle", () => glassObject("cycle-spotting", "cycle")),
    item("pain", language === "fa" ? "درد" : "Pain", "cycle", () => glassObject("cycle-pain", "cycle")),
    item("cycle-private", t("قفل"), "cycle", () => controlGlass("lock", "berry")),
    item("notification-art", t("اعلان"), "image", (_, accent) => controlGlass("bell", accent)),
    item("backup-art", t("پشتیبان‌گیری"), "image", (_, accent) => glassObject("backup", "image", { accent })),
    ...Object.entries(controls).map(([id,label]) =>
      item(id, t(label), "control", (_, accent) => controlGlass(id, accent)))
  ];
}

export { appearanceColors };
