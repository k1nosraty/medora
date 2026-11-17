import { CareInputError } from "../../shared/ui/care-error.js";
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

export function installWater({ getState, selectedDay, today, actionDay, getFamilyView = () => null, mutate, refreshFields, formatDay, formatShortDate }) {
  let editingWater = null;
  let delegation;
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
      else if (id) throw new CareInputError(t("ui.this-water-entry-has-been-deleted"));
      else list.push(entry);
    }, t("ui.water-logged"), id ? undefined : day);
    return saved ? entry : null;
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
  async function quickAddWater() {
    if (quickWaterButton.disabled || selectedDay() !== today()) return;
    quickWaterButton.disabled = true;
    try {
      const entry = await addWater(250);
      if (!entry) return;
      quickWaterEntry = entry;
      $("today-water-message").textContent = t("ui.logged-value-ml", numbers.format(entry.amount));
      renderQuickWaterFeedback(getState(), selectedDay());
    } finally {
      quickWaterButton.disabled = false;
    }
  }
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
      if (!record) throw new CareInputError(t("ui.this-entry-has-changed-or-been-removed"));
      state.water = state.water.filter(item => item.id !== entry.id);
    }, t("ui.water-entry-undone"), entry.day)) quickWaterButton.focus({ preventScroll: true });
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
      ? `${day === today() ? t("ui.today") : formatDay(day)} · ${clockText(time)}`
      : "";
  }
  function openWater(entry, target, { focusAmount = false } = {}) {
    delegation = target;
    $("water-dialog").toggleAttribute("data-family-editor", Boolean(target));
    $("water-custom").querySelector('[type="submit"]').textContent = target ? t("ui.save-for-value", target.name) : t("ui.save");
    editingWater = entry?.id ?? null;
    $("water-dialog-title").textContent = entry ? t("ui.edit-water-entry") : t("ui.log-water");
    $("water-amount").value = localDigits(entry?.amount ?? 250);
    $("water-log-day").value = isoDay(entry?.day ?? target?.day ?? actionDay());
    $("water-log-day").max = isoDay(today());
    $("water-log-time").value = entry?.time ?? target?.time ?? localClock();
    $("water-error").textContent = "";
    $("water-options").open = Boolean(entry);
    updateWaterSelection();
    updateWaterWhen();
    refreshFields($("water-dialog"));
    $("water-dialog").showModal();
    if (focusAmount) {
      $("water-amount").focus();
      $("water-amount").select();
    }
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
      error.textContent = t("ui.enter-an-amount-from-1-to-10-000-ml");
      $("water-amount").focus();
      return;
    }
    if (!Number.isInteger(day) || day > today() || !time) {
      error.textContent = day > today() ? t("ui.water-can-only-be-logged-for-today-or-an-earlier-date") : t("ui.choose-a-date-and-time-for-the-entry");
      $("water-options").open = true;
      return;
    }
    submit.disabled = true;
    try {
      if (delegation) await delegation.save({ day, time, amount: value });
      else if (await addWater(value, day, time, editingWater)) $("water-dialog").close();
      else error.textContent = t("ui.could-not-save-try-again");
    } catch (reason) {
      error.textContent = reason.message;
    } finally {
      submit.disabled = false;
    }
  });
  function fillGlass(container, progress) {
    $(container).querySelector(".water-glass").dataset.level = String(Math.min(4, Math.floor(progress * 4)));
  }

  function renderTodayWater(state, day, total, goal, progress) {
    const future = day > today();
    const view = getFamilyView();
    $("today-water").hidden = future || view?.has("water") === false;
    $("today-water").querySelector("[data-open-water]").hidden = view?.canRecord("water", day) === false;
    $("future-schedule").hidden = !future;
    $("open-water-history").hidden = future;
    $("today-water-label").textContent = day === today() ? t("ui.todays-water") : t("ui.water-intake-for-this-day");
    $("today-water-total").textContent = numbers.format(total);
    $("today-water-goal").textContent = numbers.format(goal);
    $("today-water-progress").value = progress;
    $("today-water-percent").textContent = percent.format(progress);
    $("today-water").toggleAttribute("data-goal-reached", total >= goal);
    quickWaterButton.hidden = day !== today() || view?.canRecord("water", day) === false;
    if (view) $("today-water-feedback").hidden = true;
    else renderQuickWaterFeedback(state, day);
    fillGlass("today-water", progress);
  }

  function renderWater(day, index, total, goal, progress) {
    const view = getFamilyView();
    $("water-custom-action").hidden = $("water-entry").hidden = day > today() || view?.canRecord("water", day) === false;
    $("water-progress").value = progress;
    $("water-date").textContent = day === today() ? t("ui.today") : formatShortDate(day);
    $("water-total").textContent = numbers.format(total);
    $("water-goal-label").textContent = numbers.format(goal);
    $("water-remaining").textContent = total >= goal ? t("ui.water-goal-reached") : t("ui.value-ml-to-reach-your-goal", numbers.format(goal - total));
    fillGlass("water-summary", progress);
    const entries = [...index.waterOn(day)].reverse()
      .sort((a, b) => b.time.localeCompare(a.time));
    $("water-entries").replaceChildren(...(entries.length ? entries.map(entry => {
      const row = element("article", "", "entry-row glass-secondary-actions");
      row.dataset.focusScope = "water:" + entry.id;
      row.append(element("span", t("ui.value-ml-value", numbers.format(entry.amount), clockText(entry.time))));
      if (view) {
        if (entry.recordedBy) row.append(element("small", t("ui.recorded-by-value", view.authorName(entry)), "family-stamp"));
        return row;
      }
      row.append(button(t("ui.edit"), () => openWater(entry)),
        button(t("ui.delete-entry"), () => {
          if (confirm(t("ui.delete-this-water-entry"))) void mutateWater(data => {
            data.water = data.water.filter(item => item.id !== entry.id);
          }, t("ui.water-entry-deleted"), entry.day);
        }));
      return row;
    }) : [empty(t("ui.no-water-logged-for-this-day"))]));
  }

  return { openWater, addWater, quickAddWater, renderTodayWater, renderWater };
}
