import { button, element } from "../../shared/ui/dom.js";
import { locale, t } from "../../shared/i18n/locale.js";
import { createCareIndex, isoDay, timeText } from "../../domain/care-index.js";
import * as engine from "../../domain/medication-rules.js";
import { routineComplete } from "../../domain/routine-plan.js";
import { dayMs, instantForWall, localWall, timezone } from "../../domain/wall-clock.js";
import { ageAt } from "../../domain/profile.js";

export const sectionLabels = { profile: "پروفایل", medicines: "داروها", doses: "وضعیت مصرف", visits: "قرارها",
  routines: "روتین‌ها", water: "آب", cycle: "چرخهٔ قاعدگی" };
const numbers = new Intl.NumberFormat(locale);
const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });
const timeFormat = new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone: "UTC", hourCycle: "h23" });
const dateText = day => dateFormat.format(new Date(day * dayMs));
const amount = (value, unit) => value == null ? "" : numbers.format(value) + " " + unit;

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

export function familyCareView(content, data, { record, add, day, changeDay }) {
  const { records, policy, zone } = data;
  const clock = timezone(zone);
  const today = Math.floor(localWall(Date.now(), clock) / dayMs);
  day ??= today;
  const offsets = new Map();
  const at = (day, minute) => instantForWall(day * dayMs + minute * 60_000, clock, offsets);
  const has = key => policy.sections.includes(key);
  const care = createCareIndex({ medicines: {}, doses: {}, ...records }, engine, zone, today, at);
  const date = field("تاریخ برنامه", "day", "date", isoDay(day));
  const label = element("span", t("تاریخ برنامه"), "family-date-label");
  label.append(element("strong", dateText(day), "family-date"));
  date.firstChild.replaceWith(label);
  date.querySelector("input").addEventListener("change", ({ target }) => {
    const selected = Date.parse(target.value + "T00:00Z") / dayMs;
    if (Number.isInteger(selected)) changeDay(selected);
  });
  content.append(date);
  if (!data.synced) content.append(element("p", t("هنوز سابقه‌ای از این حساب همگام نشده است."), "family-card"));
  const changes = [];
  if (data.synced && policy.add && has("medicines")) changes.push(["medicine", "دارو"]);
  if (data.synced && policy.add && has("visits")) changes.push(["visit", "قرار"]);
  if (data.synced && policy.add && has("routines")) changes.push(["routine", "روتین"]);
  if (changes.length) content.append(button(t("افزودن برنامه"), () => add(changes, day < today ? today : day)));

  function card(key, rows) {
    if (!has(key)) return;
    const wrap = element("section", "", "family-card");
    wrap.append(element("h3", t(sectionLabels[key])), ...rows);
    if (!rows.length) wrap.append(element("p", t("برای این روز ثبتی وجود ندارد."), "quiet"));
    content.append(wrap);
  }
  function row(title, detail, data, action, text) {
    const item = element("div", "", "family-record-row");
    item.append(element("strong", title), element("small", detail));
    if (data?.recordedBy) item.append(element("span", t("ثبت‌کننده: {0}", data.recordedBy), "family-stamp"));
    if (action) item.append(button(t(text ?? "ثبت به‌نمایندگی"), action));
    return item;
  }

  if (has("profile")) {
    const p = records.profile;
    const age = ageAt(p.birthDate, new Date());
    const gender = { female: "خانم", male: "آقا", undisclosed: "ترجیح می‌دهم نگویم" }[p.gender];
    const items = [
      ["نام و نام خانوادگی", [p.firstName, p.lastName].filter(Boolean).join(" ")],
      ["سن", age === null ? "" : t("{0} سال", numbers.format(age))],
      ["تاریخ تولد", p.birthDate ? dateFormat.format(new Date(p.birthDate + "T00:00Z")) : ""],
      ["قد", amount(p.heightCm, t("سانتی‌متر"))], ["وزن", amount(p.weightKg, t("کیلوگرم"))],
      ["جنسیت", gender ? t(gender) : ""]
    ].filter(([, value]) => value);
    const facts = element("dl", "", "family-facts");
    for (const [label, value] of items) {
      const fact = element("div");
      fact.append(element("dt", t(label)), element("dd", value));
      facts.append(fact);
    }
    card("profile", items.length ? [facts] : []);

  }

  const scheduled = care.dosesOn(day);
  const canRecord = data.synced && policy.record && day <= today;
  const doseRows = new Map(scheduled.map(dose => [dose.medicineId + "|" + dose.minute, dose]));
  if (has("medicines")) card("medicines", [...doseRows.values()].map(dose => {
    const med = records.medicines[dose.medicineId] ?? dose.historyPlan;
    const final = ["taken", "skipped"].includes(dose.status);
    return row(med?.name ?? t("دارو"), [timeFormat.format(dose.minute * 60000),
      amount(dose.planned == null ? null : dose.planned / 1000, med?.unit),
      has("doses") ? t(dose.status === "taken" ? "مصرف شد" : dose.status === "skipped" ? "مصرف نشد" : "هنوز ثبت نشده") : "",
      has("doses") && dose.status === "taken" && dose.actual != null &&
        t("مصرف واقعی: {0}", amount(dose.actual / 1000, dose.unit ?? med?.unit)),
      med?.instructions].filter(Boolean).join(" · "),
    dose, canRecord && has("doses") && !final && at(day, dose.minute) <= Date.now() && med ?
      () => record({ kind: "medicine", day, id: dose.medicineId, minute: dose.minute, amount: dose.planned, title: med.name, unit: med.unit }) : null);
  }));
  if (has("medicines") && !scheduled.length && Object.keys(records.medicines).length) {
    const plans = element("details", "", "family-card");
    plans.append(element("summary", t("فهرست داروها")));
    for (const med of Object.values(records.medicines)) plans.append(element("p", med.name));
    content.append(plans);
  }
  if (has("doses") && !has("medicines")) card("doses", Object.values(records.doses).filter(dose => dose.day === day)
    .map(dose => row(t(dose.status === "taken" ? "مصرف شد" : dose.status === "skipped" ? "مصرف نشد" : "تعویق"), timeText(dose.minute), dose)));
  if (has("visits")) card("visits", care.visitsOn(day).map(({ visit, time }) => row(visit.name,
    [timeFormat.format(Date.parse("1970-01-01T" + time + "Z")), visit.notes, visit.completed ? t("حضور ثبت شد") : ""].filter(Boolean).join(" · "), visit,
    canRecord && !visit.completed && !visit.cancelled ? () => record({ kind: "visit", day, id: visit.id, title: visit.name }) : null)));
  if (has("routines")) card("routines", care.calendarRoutinesOn(day).map(routine => row(routine.name,
    [routineComplete(routine) ? t("انجام شد") : t("هنوز ثبت نشده"), routine.notes,
      routine.mode === "quantity" ? amount(routine.amount ?? routine.target, routine.unit) : ""].filter(Boolean).join(" · "), routine,
    canRecord && !routineComplete(routine) ? () => record({ kind: "routine", day, id: routine.id, title: routine.name, routine }) : null)));
  if (has("water")) {
    const rows = (records.water ?? []).filter(entry => entry.day === day).map(entry =>
      row(amount(entry.amount, t("میلی‌لیتر")), timeFormat.format(Date.parse("1970-01-01T" + entry.time + "Z")), entry));
    if (canRecord) rows.push(button(t("ثبت آب"), () => record({ kind: "water", day, title: t("ثبت آب") })));
    card("water", rows);
  }
  if (has("cycle")) {
    const rows = Object.entries(records.cycleRecords).sort(([left], [right]) => Number(right) - Number(left))
      .map(([start, entry]) => row(dateText(Number(start)), [entry.end == null ? "" : dateText(entry.end),
        t({ light: "کم", medium: "متوسط", heavy: "زیاد" }[entry.flow] ?? ""), entry.note].filter(Boolean).join(" · "), entry));
    if (canRecord && records.cycleEnabled) {
      rows.unshift(button(t("ثبت شروع پریود"), () => record({ kind: "cycle", day, title: t("ثبت شروع پریود") })));
    }
    card("cycle", rows);
  }
}
