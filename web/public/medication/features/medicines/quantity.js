import { language, localDigits, t } from "../../shared/i18n/locale.js";
import { quantityFromText, quantityToText } from "../../domain/medication-rules.js";

export const amountText = value => localDigits(quantityToText(value));
export function doseUnit(unit, amount) {
  if (unit !== "tablet" && unit !== "قرص") return unit;
  if (language === "fa") return "قرص";
  return amount === 0 || amount > 1000 ? "tablets" : "tablet";
}
export function quantity(input, optional = false) {
  const text = input.value.trim();
  if (optional && !text) return null;
  const normalized = text.replace(/[۰-۹٠-٩]/g, digit => String(digit.charCodeAt(0) & 15));
  const common = { "¼": "1/4", "½": "1/2", "¾": "3/4" };
  const fraction = (Object.hasOwn(common, normalized) ? common[normalized] : normalized).match(/^(\d{1,7})\s*[/⁄]\s*(\d{1,7})$/);
  const fractionAmount = fraction ? Number(fraction[1]) * 1000 / Number(fraction[2]) : null;
  const amount = fraction ? (Number.isInteger(fractionAmount) ? quantityFromText(String(fractionAmount / 1000)) : null) :
    quantityFromText(text);
  if (amount === null) throw new Error(t("مقدار را به‌صورت عدد با حداکثر سه رقم اعشار وارد کنید."));
  return amount;
}
