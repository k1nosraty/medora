import { localDigits, locale, t } from "../../shared/i18n/locale.js";
import { $, button, element } from "../../shared/ui/dom.js";
import { dayMs } from "../../domain/wall-clock.js";
import { isoDay } from "../../domain/care-index.js";
import { waterGoalReached } from "../../domain/care-plan.js";
import { changeReminderRevision } from "../reminders/controller.js";
import { integer, localClock } from "../../shared/ui/input-values.js";

const numbers = new Intl.NumberFormat(locale);
const percent = new Intl.NumberFormat(locale, { style: "percent" });
function empty(text) { return element("p", text, "empty"); }
function clockText(value) { return value.replace(/\d/g, digit => numbers.format(Number(digit))); }

export function installWater({ getState, selectedDay, today, actionDay, mutate, refreshFields, formatDay, formatShortDate }) {
  let editingWater = null;
  let quickWaterEntry;

  function mutateWater(change, success, day) {
    const currentDay = today();
    return mutate(state => {
      const affectsReminders = state.waterReminders?.enabled && (day === undefined || day === currentDay);
      const reached = affectsReminders && waterGoalReached(state, currentDay);
      change(state);
      if (affectsReminders && reached !== waterGoalReached(state, currentDay)) changeReminderRevision(state);
    }, success, false, day);
  }

  async function addWater(amount, day = selectedDay(), time = localClock(), id = null) {
    if (day > today()) return null;
    const entry = { id: id ?? crypto.randomUUID(), day, time, amount };
    const saved = await mutateWater(state => {
      const list = state.water ??= [];
      const index = list.findIndex(item => item.id === entry.id);
      if (index >= 0) list[index] = entry;
      else if (id) throw new Error(t("این ثبت آب حذف شده است."));
      else list.push(entry);
    }, t("آب ثبت شد."), id ? undefined : day);
    return saved ? entry : null;
  }
  for (const button of document.querySelectorAll("[data-water-add]")) {
    button.addEventListener("click", () => addWater(Number(button.dataset.waterAdd)));
  }
  function findQuickWater(state, entry) {
    return state.water?.find(record => record.id === entry.id && record.amount === entry.amount &&
      record.day === entry.day && record.time === entry.time);
  }
  function renderQuickWaterFeedback(state, day) {
    if (quickWaterEntry && !findQuickWater(state, quickWaterEntry)) quickWaterEntry = null;
    $("today-water-feedback").hidden = quickWaterEntry?.day !== day;
  }
  const quickWaterButton = $("today-water-quick");
  quickWaterButton.addEventListener("click", async () => {
    if (quickWaterButton.disabled || selectedDay() !== today()) return;
    quickWaterButton.disabled = true;
    try {
      const entry = await addWater(250);
      if (!entry) return;
      quickWaterEntry = entry;
      $("today-water-message").textContent = t("{0} میلی‌لیتر ثبت شد.", numbers.format(entry.amount));
      renderQuickWaterFeedback(getState(), selectedDay());
    } finally {
      quickWaterButton.disabled = false;
    }
  });
  $("today-water-dismiss").addEventListener("click", () => {
    quickWaterEntry = null;
    renderQuickWaterFeedback(getState(), selectedDay());
    quickWaterButton.focus({ preventScroll: true });
  });
  $("today-water-undo").addEventListener("click", async () => {
    const entry = quickWaterEntry;
    if (!entry) return;
    if (await mutateWater(state => {
      const record = findQuickWater(state, entry);
      if (!record) throw new Error(t("این ثبت تغییر کرده یا حذف شده است."));
      state.water = state.water.filter(item => item.id !== entry.id);
    }, t("ثبت آب برگشت داده شد."), entry.day)) quickWaterButton.focus({ preventScroll: true });
  });

  function updateWaterSelection() {
    const value = integer($("water-amount").value);
    for (const control of document.querySelectorAll("[data-water-preset]")) {
      control.setAttribute("aria-pressed", String(Number(control.dataset.waterPreset) === value));
    }
  }
  function updateWaterWhen() {
    const day = Date.parse(`${$("water-log-day").value}T00:00:00Z`) / dayMs;
    const time = $("water-log-time").value;
    $("water-when").textContent = Number.isInteger(day) && time
      ? `${day === today() ? t("امروز") : formatDay(day)} · ${clockText(time)}`
      : "";
  }
  function openWater(entry, custom = false) {
    editingWater = entry?.id ?? null;
    $("water-dialog-title").textContent = entry ? t("ویرایش ثبت آب") : t("ثبت آب");
    $("water-amount").value = localDigits(entry?.amount ?? 250);
    $("water-log-day").value = isoDay(entry?.day ?? actionDay());
    $("water-log-day").max = isoDay(today());
    $("water-log-time").value = entry?.time ?? localClock();
    $("water-error").textContent = "";
    $("water-options").open = Boolean(entry);
    updateWaterSelection();
    updateWaterWhen();
    refreshFields($("water-dialog"));
    $("water-dialog").showModal();
    if (custom) {
      $("water-amount").focus();
      $("water-amount").select();
    }
  }
  for (const control of document.querySelectorAll("[data-open-water]")) {
    control.addEventListener("click", () => openWater(null, control.id === "water-custom-action"));
  }
  $("water-amount").addEventListener("input", updateWaterSelection);
  $("water-custom").addEventListener("input", () => { $("water-error").textContent = ""; });
  for (const field of [$("water-log-day"), $("water-log-time")]) field.addEventListener("change", updateWaterWhen);
  for (const control of document.querySelectorAll("[data-water-preset]")) control.addEventListener("click", () => {
    $("water-amount").value = localDigits(control.dataset.waterPreset);
    $("water-error").textContent = "";
    updateWaterSelection();
  });
  $("water-custom").addEventListener("submit", async event => {
    event.preventDefault();
    const submit = $("water-custom").querySelector('[type="submit"]');
    if (submit.disabled) return;
    const error = $("water-error");
    const value = integer($("water-amount").value);
    const day = Date.parse(`${$("water-log-day").value}T00:00:00Z`) / dayMs;
    const time = $("water-log-time").value;
    if (!(value >= 1 && value <= 10000)) {
      error.textContent = t("مقدار آب باید از ۱ تا ۱۰٬۰۰۰ میلی‌لیتر باشد.");
      $("water-amount").focus();
      return;
    }
    if (!Number.isInteger(day) || day > today() || !time) {
      error.textContent = day > today() ? t("برای روز آینده نمی‌شود آب ثبت کرد.") : t("تاریخ و ساعت ثبت را انتخاب کنید.");
      $("water-options").open = true;
      return;
    }
    submit.disabled = true;
    try {
      if (await addWater(value, day, time, editingWater)) $("water-dialog").close();
      else error.textContent = t("ذخیره انجام نشد. دوباره تلاش کنید.");
    } finally {
      submit.disabled = false;
    }
  });
  function fillGlass(container, progress) {
    const level = 90 - 78 * progress;
    $(container).querySelector(".glass-water")
      .setAttribute("d", progress ? `M0 ${level}C30 ${level - 7} 65 ${level + 8} 100 ${level}V100H0Z` : "");
  }

  function renderTodayWater(state, day, total, goal, progress) {
    const future = day > today();
    $("today-water").hidden = future;
    $("future-schedule").hidden = !future;
    $("open-water-history").hidden = future;
    $("today-water-label").textContent = day === today() ? t("مصرف آب امروز") : t("مصرف آب این روز");
    $("today-water-total").textContent = numbers.format(total);
    $("today-water-goal").textContent = numbers.format(goal);
    $("today-water-progress").value = progress;
    $("today-water-percent").textContent = percent.format(progress);
    $("today-water").toggleAttribute("data-goal-reached", total >= goal);
    quickWaterButton.hidden = day !== today();
    renderQuickWaterFeedback(state, day);
    const waterline = 85 - 55 * progress;
    $("today-water").querySelector(".glass-water").setAttribute("d",
      progress ? `M24 ${waterline}C44 ${waterline - 7} 63 ${waterline + 6} 88 ${waterline - 2}V92H24Z` : "");
  }

  function renderWater(day, index, total, goal, progress) {
    $("water-custom-action").hidden = day > today();
    $("water-entry").hidden = day > today();
    $("water-progress").value = progress;
    $("water-date").textContent = day === today() ? t("امروز") : formatShortDate(day);
    $("water-total").textContent = numbers.format(total);
    $("water-goal-label").textContent = numbers.format(goal);
    $("water-remaining").textContent = total >= goal ? t("هدف این روز کامل شد.") : t("{0} میلی‌لیتر تا هدف", numbers.format(goal - total));
    fillGlass("water-summary", progress);
    const entries = [...index.waterOn(day)].reverse()
      .sort((a, b) => b.time.localeCompare(a.time));
    $("water-entries").replaceChildren(...(entries.length ? entries.map(entry => {
      const row = element("article", "", "entry-row");
      row.append(element("span", t("{0} میلی‌لیتر · {1}", numbers.format(entry.amount), clockText(entry.time))), button(t("ویرایش"), () => openWater(entry)),
        button(t("حذف ثبت"), () => {
          if (confirm(t("این ثبت آب حذف شود؟"))) void mutateWater(data => {
            data.water = data.water.filter(item => item.id !== entry.id);
          }, t("ثبت آب حذف شد."), entry.day);
        }));
      return row;
    }) : [empty(t("برای این روز آبی ثبت نشده است."))]));
  }

  return { openWater, renderTodayWater, renderWater };
}
