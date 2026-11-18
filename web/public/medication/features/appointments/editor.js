import { CareInputError } from "../../shared/ui/care-error.js";
import { locale, t } from "../../shared/i18n/locale.js";
import { appointmentDefaults, appointmentOffsets, appointmentReminders, localZone } from "../../domain/care-plan.js";
import { dayMs, localWall, timezone } from "../../domain/wall-clock.js";
import { isoDay } from "../../domain/care-index.js";
import { appearanceColors, mountAppearanceColors } from "../medicines/appearance.js";
import { $, button, element } from "../../shared/ui/dom.js";
import { installChoiceSearch, setPressed } from "../../shared/ui/controls.js";
import { timeZoneCity } from "../../shared/ui/time-zone-picker.js";
import { appointmentView, visitIllustration } from "./view.js";

const numbers = new Intl.NumberFormat(locale);
function clockText(value) { return value.replace(/\d/g, digit => numbers.format(Number(digit))); }
const visitColorOf = color => Object.hasOwn(appearanceColors, color) ? color : "green";

export function installAppointments({ getState, getFamilyView = () => /** @type {object | null} */ (null), today, selectedDate = () => undefined, render, mutate, requestDeletion, refreshFields, formatDay, formatDayNumber, formatShortMonth }) {
  let editingVisit = null;
  let delegation;
  let clinicZone;
  const visitOffsetFields = [...document.querySelectorAll('[name="visit-offset"]')];
  const visitCategory = $("visit-category");
  const visitCategories = new Map(Array.from(visitCategory.options, option => [option.value, option.text]));
  const visitCategoryOf = category => visitCategories.has(category) ? category : "general";
  const visitCategoryName = $("visit-category-name");
  const visitAppearance = $("visit-appearance");
  const categoryDialog = $("visit-category-dialog");
  const categorySearch = $("visit-category-search");
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
      return { control, key: `${option.text} ${option.value} ${categoryAliases[option.value] ?? ""}` };
    });
    $("visit-category-results").append(group);
    categoryGroups.push({ group, rows });
  }
  const resetCategorySearch = installChoiceSearch({
    input: categorySearch, empty: $("visit-category-empty"), groups: () => categoryGroups
  });
  $("visit-category-open").addEventListener("click", () => {
    resetCategorySearch();
    setPressed(categoryGroups.flatMap(({ rows }) => rows.map(({ control }) => control)),
      control => control.dataset.category === visitCategory.value);
    categoryDialog.showModal();
    categorySearch.focus({ preventScroll: true });
  });
  const visitColors = mountAppearanceColors($("visit-colors").querySelector(".visit-color-grid"), "visit-color");
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
      summary.textContent = t("ui.cancelled-appointment");
      return;
    }
    if (!visitReminderToggle.checked) {
      summary.textContent = t("ui.reminders-are-off-for-this-appointment");
      return;
    }
    summary.textContent = "";
    if (!Number.isInteger(day) || !time) return;
    try {
      const visit = { day, time, zone: clinicZone, offsets: [...retainedVisitOffsets(existing), ...checkedVisitOffsets()] };
      const next = appointmentReminders(visit, getState().appointmentReminders ?? appointmentDefaults, localZone())
        .find(at => at > Date.now());
      if (next === undefined) summary.textContent = t("ui.no-upcoming-reminder-falls-before-this-appointment");
      else {
        const wall = localWall(next, timezone(localZone()));
        summary.textContent = t("ui.first-upcoming-reminder-value-at-value",
          formatDay(Math.floor(wall / dayMs)), clockText(new Date(wall).toISOString().slice(11, 16)));
      }
    } catch { /* The reminder summary needs a valid date and time. */ }
  }
  for (const field of [$("visit-day"), $("visit-time"), visitReminderToggle, ...visitOffsetFields]) {
    field.addEventListener("change", refreshVisitReminder);
  }

  function openVisit(visit, target) {
    delegation = target;
    $("visit-dialog").toggleAttribute("data-family-editor", Boolean(target));
    editingVisit = visit?.id ?? null;
    $("delete-edited-visit").hidden = !visit;
    $("visit-form-title").textContent = target ? t("ui.add-for-value", target.name) : visit ? t("ui.edit-appointment") : t("ui.new-appointment");
    $("visit-editor").querySelector('[type="submit"]').textContent = target ? t("ui.save-for-value", target.name) : t("ui.save-appointment");
    $("visit-name").value = visit?.name ?? "";
    const chosenZone = visit ? visit.zone : target ? target.zone : getState().clinicTimeZone;
    clinicZone = chosenZone ?? localZone() ?? "UTC";
    const wall = localWall(Date.now(), timezone(clinicZone));
    $("visit-day").value = isoDay(visit?.day ?? target?.day ?? selectedDate() ?? Math.floor(wall / dayMs));
    $("visit-time").value = visit?.time ?? new Date(wall).toISOString().slice(11, 16);
    $("visit-place").value = visit?.place ?? "";
    $("visit-note").value = visit?.note ?? visit?.notes ?? "";
    $("visit-contact").value = visit?.contact ?? "";
    $("visit-zone-summary").textContent = t("ui.clinic-zone-appointment-value", timeZoneCity(clinicZone));
    $("visit-extra").open = Boolean(visit?.note || visit?.contact);
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
  function deleteVisit(id, parent) {
    const visit = getState().visits?.[id];
    if (!visit) return;
    requestDeletion({
      title: t("ui.delete-appointment"),
      message: t("ui.delete-value-its-reminders-will-also-be-cancelled", visit.name),
      success: t("ui.appointment-deleted"),
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
      showVisitError(t("ui.enter-a-title-date-and-time"), field);
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
    const zone = clinicZone;
    const remindersOff = !visitReminderToggle.checked;
    const chosenOffsets = checkedVisitOffsets();
    submit.disabled = true;
    const plan = { id, name, day, time, place, note, contact, zone, category, color,
      ...(categoryName ? { categoryName } : {}), ...(remindersOff ? { remindersOff } : {}) };
    if (delegation) {
      try { await delegation.save({ ...plan, offsets: chosenOffsets }); }
      catch (error) { $("visit-error").textContent = error.message; }
      finally { submit.disabled = false; }
      return;
    }
    const saved = await mutate(state => {
      const visits = state.visits ??= {};
      if (existingId && !visits[id]) throw new CareInputError(t("ui.this-appointment-has-been-deleted"));
      const previous = visits[id];
      const offsets = [...retainedVisitOffsets(previous), ...chosenOffsets];
      const completed = previous?.completed && previous.day === day && previous.time === time &&
        (previous.zone ?? localZone() ?? "UTC") === zone;
      visits[id] = { ...(previous?.sharedNote && { sharedNote: previous.sharedNote }),
        ...(previous?.sharedContact && { sharedContact: previous.sharedContact }), ...plan, offsets, cancelled: previous?.cancelled ?? false,
        ...(completed ? { completed, resolvedAt: previous.resolvedAt } : {}) };
    }, t("ui.appointment-saved"), true);
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
    today, getFamilyView, openVisit, deleteVisit, mutate, render
  });

  return { ...appointments, openVisit };
}
