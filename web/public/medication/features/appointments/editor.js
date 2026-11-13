import { locale, t } from "../../shared/i18n/locale.js";
import { appointmentDefaults, appointmentOffsets, appointmentReminders, localZone } from "../../domain/care-plan.js";
import { dayMs, localWall, timezone } from "../../domain/wall-clock.js";
import { isoDay } from "../../domain/care-index.js";
import { appearanceColors } from "../medicines/appearance.js";
import { $, button, element } from "../../shared/ui/dom.js";
import { localClock } from "../../shared/ui/input-values.js";
import { appointmentView, visitIllustration } from "./view.js";

const numbers = new Intl.NumberFormat(locale);
function clockText(value) { return value.replace(/\d/g, digit => numbers.format(Number(digit))); }
const visitColorOf = color => Object.hasOwn(appearanceColors, color) ? color : "green";

export function installAppointments({ getState, today, defaultDay, render, mutate, requestDeletion, refreshFields, formatDay, formatDayNumber, formatShortMonth }) {
  let editingVisit = null;
  const visitOffsetFields = [...document.querySelectorAll('[name="visit-offset"]')];
  const visitCategory = $("visit-category");
  const visitCategories = new Map(Array.from(visitCategory.options, option => [option.value, option.text]));
  const visitCategoryOf = category => visitCategories.has(category) ? category : "general";
  const visitCategoryName = $("visit-category-name");
  const visitAppearance = $("visit-appearance");
  const categoryDialog = $("visit-category-dialog");
  const categorySearch = $("visit-category-search");
  const categoryKey = value => value.normalize("NFKC").toLocaleLowerCase(locale)
    .replaceAll("ي", "ی").replaceAll("ك", "ک").replace(/[\p{M}\p{P}\p{Z}\u200c\u200d]/gu, "");
  const categoryAliases = { ent: "ENT", psychiatry: "روانپزشک", radiology: "اشعه ایکس رادیوگرافی x-ray", dental: "دندانپزشک dentist" };
  const categoryGroups = [];
  for (const item of visitCategory.children) {
    const group = element("div", "", "visit-category-group");
    const options = item.tagName === "OPTGROUP" ? [...item.children] : [item];
    if (item.label && item.tagName === "OPTGROUP") group.append(element("h3", item.label));
    const rows = options.map(option => {
      const control = button(option.text, () => {
        visitCategory.value = option.value;
        updateVisitAppearance();
        categoryDialog.close();
      });
      control.dataset.category = option.value;
      control.prepend(visitIllustration(option.value));
      group.append(control);
      return { control, key: categoryKey(`${option.text} ${option.value} ${categoryAliases[option.value] ?? ""}`) };
    });
    $("visit-category-results").append(group);
    categoryGroups.push({ group, rows });
  }
  function filterVisitCategories() {
    const terms = categorySearch.value.split(/\s+/).map(categoryKey).filter(Boolean);
    let found = false;
    for (const { group, rows } of categoryGroups) {
      let visible = false;
      for (const { control, key } of rows) {
        control.hidden = !terms.every(term => key.includes(term));
        visible ||= !control.hidden;
      }
      group.hidden = !visible;
      found ||= visible;
    }
    $("visit-category-empty").hidden = found;
  }
  categorySearch.addEventListener("input", filterVisitCategories);
  categorySearch.addEventListener("keydown", event => {
    if (event.key !== "Enter" || event.isComposing) return;
    const matches = $("visit-category-results").querySelectorAll("button:not([hidden])");
    if (matches.length === 1) matches[0].click();
  });
  $("visit-category-open").addEventListener("click", () => {
    categorySearch.value = "";
    filterVisitCategories();
    for (const { rows } of categoryGroups) for (const { control } of rows) {
      control.setAttribute("aria-pressed", String(control.dataset.category === visitCategory.value));
    }
    categoryDialog.showModal();
    categorySearch.focus({ preventScroll: true });
  });
  const visitColors = Object.entries(appearanceColors).map(([color, title]) => {
    const choice = element("input");
    choice.type = "radio";
    choice.name = "visit-color";
    choice.value = color;
    choice.dataset.ink = color;
    const label = element("label");
    label.append(choice, element("span", title));
    $("visit-colors").querySelector(".visit-color-grid").append(label);
    return choice;
  });
  function selectedVisitColor() {
    return visitColorOf(visitColors.find(choice => choice.checked)?.value);
  }

  function updateVisitAppearance() {
    visitAppearance.dataset.ink = selectedVisitColor();
    $("visit-category-selected").textContent = visitCategories.get(visitCategory.value);
    $("visit-category-name-field").hidden = visitCategory.value !== "custom";
    $("visit-appearance-preview").replaceChildren(visitIllustration(visitCategory.value, visitAppearance.dataset.ink));
  }
  visitAppearance.addEventListener("change", updateVisitAppearance);

  const visitReminderToggle = $("visit-reminders-enabled");
  const checkedVisitOffsets = () => visitOffsetFields.filter(field => field.checked).map(field => Number(field.value));
  const retainedVisitOffsets = visit => (visit?.offsets ?? []).filter(offset => !appointmentOffsets.includes(offset));
  function refreshVisitReminder() {
    $("visit-reminder-offsets").hidden = !visitReminderToggle.checked;
    const summary = $("visit-reminder-summary");
    const day = Date.parse(`${$("visit-day").value}T00:00:00Z`) / dayMs;
    const time = $("visit-time").value;
    const existing = getState().visits?.[editingVisit];
    if (existing?.cancelled) {
      summary.textContent = t("قرار لغو شده");
      return;
    }
    if (!visitReminderToggle.checked) {
      summary.textContent = t("یادآوری این قرار خاموش است.");
      return;
    }
    summary.textContent = "";
    if (!Number.isInteger(day) || !time) return;
    try {
      const zone = $("visit-zone").value.trim() || localZone();
      const visit = { day, time, zone, offsets: [...retainedVisitOffsets(existing), ...checkedVisitOffsets()] };
      const next = appointmentReminders(visit, getState().appointmentReminders ?? appointmentDefaults, localZone())
        .find(at => at > Date.now());
      if (next === undefined) summary.textContent = t("برای این ساعت، یادآوری آینده‌ای باقی نمانده است.");
      else {
        const wall = localWall(next, timezone(localZone()));
        summary.textContent = t("اولین یادآوری این قرار: {0}، ساعت {1}",
          formatDay(Math.floor(wall / dayMs)), clockText(new Date(wall).toISOString().slice(11, 16)));
      }
    } catch { /* The form reports an invalid timezone when saved. */ }
  }
  for (const field of [$("visit-day"), $("visit-time"), $("visit-zone"), visitReminderToggle, ...visitOffsetFields]) {
    field.addEventListener("change", refreshVisitReminder);
  }

  function openVisit(visit) {
    editingVisit = visit?.id ?? null;
    $("delete-edited-visit").hidden = !visit;
    $("visit-form-title").textContent = visit ? t("ویرایش قرار") : t("قرار جدید");
    $("visit-name").value = visit?.name ?? "";
    $("visit-day").value = isoDay(visit?.day ?? defaultDay());
    $("visit-time").value = visit?.time ?? localClock();
    $("visit-place").value = visit?.place ?? "";
    $("visit-note").value = visit?.note ?? "";
    $("visit-contact").value = visit?.contact ?? "";
    $("visit-zone").value = visit?.zone ?? localZone();
    $("visit-extra").open = Boolean(visit?.note || visit?.contact || visit?.zone && visit.zone !== localZone());
    visitAppearance.open = false;
    visitCategory.value = visitCategoryOf(visit?.category);
    visitCategoryName.value = visitCategory.value === "custom" ? visit?.categoryName ?? "" : "";
    const color = visitColorOf(visit?.color);
    for (const choice of visitColors) choice.checked = choice.value === color;
    updateVisitAppearance();
    for (const field of visitOffsetFields) field.checked = (visit?.offsets ?? [60]).includes(Number(field.value));
    visitReminderToggle.checked = !visit?.remindersOff;
    $("visit-reminder-options").open = false;
    refreshVisitReminder();
    $("visit-error").textContent = "";
    refreshFields($("visit-dialog"));
    $("visit-dialog").showModal();
  }
  for (const control of document.querySelectorAll("[data-open-visit]")) control.addEventListener("click", () => openVisit());
  function deleteVisit(id, parent) {
    const visit = getState().visits?.[id];
    if (!visit) return;
    requestDeletion({
      title: t("حذف قرار"),
      message: t("قرار «{0}» حذف شود؟ یادآوری‌های این قرار هم لغو می‌شوند.", visit.name),
      success: t("قرار حذف شد."),
      parent,
      change(state) { delete state.visits?.[id]; }
    });
  }
  $("delete-edited-visit").addEventListener("click", () => deleteVisit(editingVisit, "visit-dialog"));
  $("visit-editor").addEventListener("input", () => { $("visit-error").textContent = ""; });
  function showVisitError(message, field) {
    const error = $("visit-error");
    error.textContent = message;
    (field.closest(".visit-when, label") ?? field).after(error);
    field.focus();
  }
  $("visit-editor").addEventListener("submit", async event => {
    event.preventDefault();
    const submit = event.currentTarget.querySelector('[type="submit"]');
    if (submit.disabled) return;
    const name = $("visit-name").value.trim();
    const day = Date.parse(`${$("visit-day").value}T00:00:00Z`) / dayMs;
    const time = $("visit-time").value;
    if (!name || !Number.isInteger(day) || !time) {
      const field = !name ? $("visit-name") : $("visit-editor").querySelector(`[data-for="visit-${!Number.isInteger(day) ? "day" : "time"}"]`);
      showVisitError(t("عنوان، تاریخ و ساعت قرار را کامل کنید."), field);
      return;
    }
    const existingId = editingVisit;
    const id = existingId ?? crypto.randomUUID();
    const place = $("visit-place").value.trim();
    const note = $("visit-note").value.trim();
    const contact = $("visit-contact").value.trim();
    const category = visitCategoryOf(visitCategory.value);
    const categoryName = category === "custom" ? visitCategoryName.value.trim() : "";
    const color = selectedVisitColor();
    const zone = $("visit-zone").value.trim() || localZone();
    try { timezone(zone); } catch {
      $("visit-extra").open = true;
      showVisitError(t("منطقهٔ زمانی مطب را به‌شکل Asia/Tehran وارد کنید."), $("visit-zone"));
      return;
    }
    const remindersOff = !visitReminderToggle.checked;
    const chosenOffsets = checkedVisitOffsets();
    submit.disabled = true;
    const saved = await mutate(state => {
      const visits = state.visits ??= {};
      if (existingId && !visits[id]) throw new Error(t("این قرار حذف شده است."));
      const previous = visits[id];
      const offsets = [...retainedVisitOffsets(previous), ...chosenOffsets];
      const completed = previous?.completed && previous.day === day && previous.time === time && previous.zone === zone;
      visits[id] = { id, name, day, time, place, note, contact, zone, category, color, offsets, cancelled: previous?.cancelled ?? false,
        ...(completed ? { completed, resolvedAt: previous.resolvedAt } : {}),
        ...(categoryName ? { categoryName } : {}), ...(remindersOff ? { remindersOff } : {}) };
    }, t("قرار ذخیره شد."), true);
    submit.disabled = false;
    if (saved) $("visit-dialog").close();
    else {
      submit.before($("visit-error"));
      $("visit-error").textContent = $("status").textContent;
    }
  });

  const appointments = appointmentView({
    categoryOf: visitCategoryOf, categories: visitCategories, colorOf: visitColorOf,
    formatDay, formatDayNumber,
    formatShortMonth,
    today, openVisit, deleteVisit, mutate, render
  });

  return appointments;
}
