import { element } from "../../shared/ui/dom.js";
import { locale, t } from "../../shared/i18n/locale.js";
import { ageAt } from "../../domain/profile.js";

export const sectionLabels = { profile: "پروفایل", medicines: "داروها", doses: "وضعیت مصرف", visits: "قرارها",
  routines: "روتین‌ها", water: "آب", cycle: "چرخهٔ قاعدگی" };

export function field(label, name, type, value) {
  const row = element("label", t(label));
  const input = document.createElement("input");
  input.name = name;
  input.type = type;
  input.value = value ?? "";
  input.required = true;
  row.append(input);
  return row;
}

export function selectField(label, name, options) {
  const row = element("label", t(label));
  const input = document.createElement("select");
  input.name = name;
  for (const [value, copy] of options) input.add(new Option(t(copy), value));
  row.append(input);
  return row;
}

export function profileFacts(profile) {
  const numbers = new Intl.NumberFormat(locale);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });
  const age = ageAt(profile.birthDate, new Date());
  const gender = { female: "خانم", male: "آقا", undisclosed: "ترجیح می‌دهم نگویم" }[profile.gender];
  const facts = element("dl", "", "family-facts");
  for (const [label, value] of [
    ["نام و نام خانوادگی", [profile.firstName, profile.lastName].filter(Boolean).join(" ")],
    ["تاریخ تولد", profile.birthDate && date.format(new Date(profile.birthDate + "T00:00Z"))],
    ["سن", age !== null && t("ui.value-years-old", numbers.format(age))],
    ["قد", profile.heightCm && numbers.format(profile.heightCm) + " " + t("ui.cm")],
    ["وزن", profile.weightKg && numbers.format(profile.weightKg) + " " + t("ui.kg")],
    ["جنسیت", gender && t(gender)]
  ]) if (value) {
    const row = element("div");
    row.append(element("dt", t(label)), element("dd", value));
    facts.append(row);
  }
  return facts;
}
