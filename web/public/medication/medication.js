import { language, listSeparator, localDigits, locale, localizeMarkup, selectLanguage, t } from "./locale.js";
import { accessCare } from "./storage.js";
import { changeReminderRevision, initializeReminders, syncReminders } from "./reminders.js";
import { wellness } from "./wellness.js";
import { installPickers } from "./pickers.js";
import { clockMinute, localZone, minuteMs } from "./care-plan.js";
import { installAppearance, medicationBadge, medicationBanner } from "./medication-art.js";
import { installAccount } from "./account.js";
import { showPromotion } from "./promotion.js";
import { $, dayCardOptions, element } from "./dom.js";
import { compilePhases, createCareIndex, doseId, doseTime, isoDay, timeText } from "./care-index.js";
import { installRoutines } from "./routines-view.js";
import { validRoutineId } from "./routine-plan.js";
import { renderToday } from "./daily-view.js";
import { installBackupRestore } from "./backup-restore-view.js";

// An older cached page can still load this module from the current release.
if (!document.getElementById("push-show-details")) {
  const url = new URL(location.href);
  const firstAttempt = !url.searchParams.has("retry");
  url.searchParams.set("retry", Date.now());
  if (firstAttempt) location.replace(url);
  else {
    const link = document.createElement("a");
    link.href = url;
    link.textContent = t("بارگذاری دوباره");
    document.getElementById("boot-status").replaceChildren(link);
  }
  throw new Error("Outdated Medora page");
}

localizeMarkup();
const dayLength = 86_400_000;
const weekdays = [t("شنبه"), t("یکشنبه"), t("دوشنبه"), t("سه‌شنبه"), t("چهارشنبه"), t("پنجشنبه"), t("جمعه")];
const weekdayBits = [5, 6, 0, 1, 2, 3, 4];
let engine;
let care;
let editing;
let editingRevision;
let editorStep = 0;
let editorDates = [];
let restoreExactMode = false;
let busy = false;
let deletion;
const doseStates = { taken: t("مصرف شد"), skipped: t("مصرف نشد"), snoozed: t("به تعویق افتاد") };
const editorChapters = [t("نام، شکل و رنگ"), t("برنامهٔ ساده یا چندمرحله‌ای"), t("مرور و ذخیره")];

function dayNumber(iso) {
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(ms) || !/^\d{4}-\d{2}-\d{2}$/.test(iso) || new Date(ms).toISOString().slice(0, 10) !== iso) {
    throw new Error(t("تاریخ را کامل وارد کنید."));
  }
  return ms / dayLength;
}
const amountText = value => localDigits(engine.quantityToText(value));
function doseUnit(unit, amount) {
  if (unit !== "tablet" && unit !== "قرص") return unit;
  if (language === "fa") return "قرص";
  return amount === 0 || amount > 1000 ? "tablets" : "tablet";
}
const localDayNumber = date => dayNumber([
  String(date.getFullYear()).padStart(4, "0"),
  String(date.getMonth() + 1).padStart(2, "0"),
  String(date.getDate()).padStart(2, "0")
].join("-"));
const today = () => localDayNumber(new Date());

function quantity(input, optional = false) {
  const text = input.value.trim();
  if (optional && !text) return null;
  const normalized = text.replace(/[۰-۹٠-٩]/g, digit => String(digit.charCodeAt(0) & 15));
  const common = { "¼": "1/4", "½": "1/2", "¾": "3/4" };
  const fraction = (Object.hasOwn(common, normalized) ? common[normalized] : normalized).match(/^(\d{1,7})\s*[/⁄]\s*(\d{1,7})$/);
  const fractionAmount = fraction ? Number(fraction[1]) * 1000 / Number(fraction[2]) : null;
  const amount = fraction ? (Number.isInteger(fractionAmount) ? engine.quantityFromText(String(fractionAmount / 1000)) : null) :
    engine.quantityFromText(text);
  if (amount === null) throw new Error(t("مقدار را به‌صورت عدد با حداکثر سه رقم اعشار وارد کنید."));
  return amount;
}

function slotsFor(medicine, day) {
  if (medicine.dates?.length && !medicine.dates.includes(day)) return [];
  return engine.medicationSlots(compilePhases(engine, medicine.phases), day);
}

function updateSlotLabels(container) {
  Array.from(container.children).forEach((row, index, rows) => {
    row.querySelector(".slot-heading strong").textContent = t("نوبت {0}", localDigits(index + 1));
    row.querySelector(".remove-slot").hidden = rows.length === 1;
  });
  container.nextElementSibling.querySelector(".add-slot").disabled = container.children.length >= 12;
}

function addSlot(container, slot) {
  const row = $("slot-template").content.firstElementChild.cloneNode(true);
  row.querySelector(".time").value = timeText(slot.minute);
  row.querySelector(".amount").value = slot.amount === null ? "" : amountText(slot.amount);
  row.querySelector(".remove-slot").addEventListener("click", () => {
    row.remove();
    updateSlotLabels(container);
    container.nextElementSibling.querySelector(".add-slot").focus();
  });
  container.append(row);
  updateSlotLabels(container);
  return row;
}

function updatePhaseLabels() {
  const phases = Array.from($("phases").children);
  phases.forEach((field, index) => {
    field.querySelector("legend").textContent = t("مرحلهٔ {0}", localDigits(index + 1));
    field.querySelector(".remove-phase").hidden = phases.length === 1;
  });
  $("add-phase").disabled = phases.length >= 50;
}

function addPhase(phase = { start: today(), end: null, interval: 1, mask: 127, slots: [{ minute: 480, amount: null }] }) {
  const fieldset = $("phase-template").content.firstElementChild.cloneNode(true);
  fieldset.querySelector(".start").value = isoDay(phase.start);
  fieldset.querySelector(".end").value = phase.end === null || phase.autoEnd ? "" : isoDay(phase.end - 1);
  fieldset.querySelector(".interval").value = phase.interval;
  const repeat = fieldset.querySelector(".repeat");
  repeat.value = phase.mask === 127 && phase.interval === 1 ? "daily" : "weekly";
  weekdays.forEach((label, index) => {
    const field = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = 1 << weekdayBits[index];
    checkbox.checked = Boolean(phase.mask & Number(checkbox.value));
    field.append(checkbox, label);
    fieldset.querySelector(".weekdays").append(field);
  });
  const slots = fieldset.querySelector(".slots");
  phase.slots.forEach(slot => addSlot(slots, slot));
  fieldset.querySelector(".add-slot").addEventListener("click", () => {
    const times = Array.from(slots.querySelectorAll(".time"), field => field.value);
    let minute = (clockMinute(times.at(-1)) + 240) % 1440;
    while (times.includes(timeText(minute))) minute = (minute + 1) % 1440;
    const row = addSlot(slots, { minute, amount: null });
    pickers.refresh($("editor"));
    row.querySelector(".picker-field").focus();
  });
  fieldset.querySelector(".remove-phase").addEventListener("click", () => {
    fieldset.remove();
    updateEditorMode();
    $("add-phase").focus();
  });
  fieldset.querySelector(".add-exact-day").addEventListener("click", () => {
    pickers.chooseDate(editorDates.at(-1) ?? today(), day => {
      if (!editorDates.includes(day)) editorDates = [...editorDates, day].sort((a, b) => a - b);
      renderExactDates(fieldset);
      clearEditorFieldError();
      $("editor-status").textContent = "";
    });
  });
  fieldset.querySelector(".dose-unit-link").addEventListener("click", () => {
    $("inventory-options").open = true;
    $("unit").focus();
  });
  fieldset.dataset.weekly = String(repeat.value === "weekly");
  repeat.addEventListener("change", () => {
    if (repeat.value === "weekly" && fieldset.dataset.weekly === "false") {
      const start = dayNumber(fieldset.querySelector(".start").value);
      const weekday = ((start + 3) % 7 + 7) % 7;
      for (const day of fieldset.querySelectorAll(".weekdays input")) day.checked = Number(day.value) === (1 << weekday);
      fieldset.dataset.weekly = "true";
    }
    updateEditorMode();
  });
  $("phases").append(fieldset);
  return fieldset;
}

function openEditor(medicine) {
  editing = medicine?.id;
  editingRevision = medicine?.revision;
  $("delete-edited-medication").hidden = !medicine;
  $("editor-title").textContent = medicine ? t("ویرایش دارو") : t("داروی جدید");
  $("name").value = medicine?.name ?? "";
  $("instructions").value = medicine?.instructions ?? "";
  $("medicine-icon").value = medicine?.icon ?? "capsule";
  $("medicine-color").value = medicine?.color ?? "gold";
  updateAppearance();
  $("unit").value = medicine?.unit ?? t("قرص");
  $("unit").readOnly = medicine?.stock != null;
  $("stock").value = medicine?.stock == null ? "" : amountText(medicine.stock);
  $("stock").readOnly = medicine?.stock != null;
  $("threshold").value = amountText(medicine?.threshold ?? 2000);
  $("editor-status").textContent = "";
  clearEditorFieldError();
  $("phases").replaceChildren();
  if (medicine) medicine.phases.forEach(addPhase);
  else addPhase();
  const first = $("phases").firstElementChild;
  editorDates = (medicine?.dates ?? []).filter(day => day >= medicine.phases[0].start);
  restoreExactMode = false;
  $("phased-mode").checked = !editorDates.length && Boolean(medicine?.phased || medicine?.phases.length > 1);
  $("regular-mode").checked = !$("phased-mode").checked;
  if (editorDates.length) first.querySelector(".repeat").value = "dates";
  $("dose-instructions").open = Boolean(medicine?.instructions);
  $("inventory-options").open = false;
  updateStockOptions();
  updateEditorMode();
  showEditorStep(0, false);
  $("medication-dialog").showModal();
}

function showEditorStep(step, focus = true) {
  editorStep = step;
  $("editor").dataset.step = String(step);
  $("editor-chapter").textContent = editorChapters[step];
  for (const panel of document.querySelectorAll("[data-editor-step]")) panel.hidden = Number(panel.dataset.editorStep) !== step;
  Array.from($("editor-steps").children).forEach((label, index) => {
    label.dataset.complete = String(index < step);
    if (index === step) label.setAttribute("aria-current", "step");
    else label.removeAttribute("aria-current");
  });
  $("editor-back").hidden = step === 0;
  $("editor-next").textContent = step === 2 ? t("ذخیرهٔ دارو") : t("ادامه");
  $("editor-status").textContent = "";
  if (focus) {
    const panel = document.querySelector(`[data-editor-step="${step}"]`);
    $(panel.getAttribute("aria-labelledby")).focus({ preventScroll: true });
    $("medication-dialog").scrollTop = 0;
  }
}

function reviewMedicine({ name, phases, dates, stock, unit, threshold, phased, instructions }) {
  const title = element("h4", name);
  title.dir = "auto";
  const list = element("ol");
  for (const [index, phase] of phases.entries()) {
    const range = phase.end === null ? t("از {0}", dashboard.formatDay(phase.start)) :
      t("{0} تا {1}", dashboard.formatDay(phase.start), dashboard.formatDay(phase.end - 1));
    const days = weekdays.filter((_, index) => phase.mask & (1 << weekdayBits[index]));
    const repeat = dates.length ? dates.map(day => dashboard.formatDay(day)).join(listSeparator) :
      phase.interval > 1 ? t("هر {0} هفته", localDigits(phase.interval)) :
        days.length === 7 ? t("هر روز") : t("هر هفته");
    const row = element("li");
    if (phased) row.append(element("h5", t("مرحلهٔ {0}", localDigits(index + 1))));
    if (!dates.length) row.append(element("p", range));
    row.append(element("strong", repeat));
    if (!dates.length && days.length < 7) row.append(element("p", days.join(listSeparator)));
    for (const slot of phase.slots) {
      const line = element("p");
      const time = element("bdi", localDigits(timeText(slot.minute)));
      line.append(time);
      if (slot.amount !== null) line.append(` · ${amountText(slot.amount)} ${doseUnit(unit, slot.amount)}`);
      row.append(line);
    }
    list.append(row);
  }
  const review = $("editor-review");
  const notBefore = care.medicines[editing]?.effectiveFrom ?? 0;
  const next = nextPlannedDose(phases, dates, notBefore);
  const upcoming = element("p", next ? t("نوبت آینده: {0}، ساعت {1}", dashboard.formatDay(next.day), localDigits(timeText(next.slot.minuteOfDay))) :
    t("نوبت آینده‌ای در این برنامه نیست."));
  upcoming.className = "review-upcoming";
  review.replaceChildren(title, upcoming, list);
  if (instructions) review.append(element("p", instructions));
  const thresholdUnit = doseUnit(unit, threshold);
  if ($("stock").readOnly) review.append(element("p", t("هشدار موجودی در {0} {1}", amountText(threshold), thresholdUnit)));
  else if (stock !== null) review.append(element("p", t("موجودی اولیه {0} {1} · هشدار در {2} {3}", amountText(stock), doseUnit(unit, stock), amountText(threshold), thresholdUnit)));
}

function renderExactDates(fieldset) {
  fieldset.querySelector(".exact-days").replaceChildren(...editorDates.map(day => {
    const remove = action(dashboard.formatDay(day) + " ×", () => {
      editorDates = editorDates.filter(value => value !== day);
      renderExactDates(fieldset);
      fieldset.querySelector(".add-exact-day").focus();
    });
    remove.className = "secondary";
    remove.setAttribute("aria-label", t("حذف تاریخ {0}", dashboard.formatDay(day)));
    return remove;
  }));
}

function updateEditorMode() {
  const phased = $("phased-mode").checked;
  const phases = Array.from($("phases").children);
  $("editor").dataset.phased = String(phased);
  for (const phase of phases) {
    const repeat = phase.querySelector(".repeat");
    repeat.querySelector('[value="dates"]').hidden = phased;
    repeat.querySelector('[value="dates"]').disabled = phased;
    phase.querySelector(".weekly-plan").hidden = repeat.value !== "weekly";
    phase.querySelector(".plan-dates").hidden = repeat.value === "dates";
    phase.querySelector(".exact-plan").hidden = repeat.value !== "dates";
    if (repeat.value === "dates") renderExactDates(phase);
  }
  const warning = $("phase-mode-warning");
  warning.textContent = phased && restoreExactMode ? t("تاریخ‌های انتخابی فقط در برنامهٔ ثابت استفاده می‌شوند.") :
    !phased && phases.length > 1 ? t("با ذخیرهٔ برنامهٔ ثابت، فقط مرحلهٔ اول نگه داشته می‌شود.") : "";
  warning.hidden = !warning.textContent;
  updatePhaseLabels();
  updateDoseUnits();
  pickers.refresh($("editor"));
}

function updateDoseUnits() {
  const unit = $("unit").value.trim();
  for (const link of $("phases").querySelectorAll(".dose-unit-link")) {
    link.textContent = unit ? t("واحد: {0}", doseUnit(unit, 1000)) : t("تعیین واحد");
  }
}

function updateStockOptions() {
  $("threshold-field").hidden = !$("stock").readOnly && !$("stock").value.trim();
}

function clearEditorFieldError() {
  $("editor-inline-error")?.remove();
  const field = $("editor").querySelector('[aria-describedby="editor-inline-error"]');
  field?.removeAttribute("aria-invalid");
  field?.removeAttribute("aria-describedby");
}

function invalidEditorField(field, message) {
  const details = field.closest("details");
  if (details) details.open = true;
  const picker = field.closest(".picker-control");
  const control = picker?.querySelector(".picker-field") ?? field;
  const row = picker ?? field.closest("label") ?? field;
  const hint = element("p", message);
  hint.id = "editor-inline-error";
  hint.className = "field-error";
  row.after(hint);
  control.setAttribute("aria-invalid", "true");
  control.setAttribute("aria-describedby", hint.id);
  control.focus();
  throw new Error(message);
}

function editorPhases() {
  const phased = $("phased-mode").checked;
  const active = phased ? Array.from($("phases").children) : [$("phases").firstElementChild];
  const exact = !phased && active[0].querySelector(".repeat").value === "dates";
  if (exact && !editorDates.length) {
    invalidEditorField(active[0].querySelector(".add-exact-day"), t("حداقل یک تاریخ مصرف انتخاب کنید."));
  }
  const starts = active.map(fieldset => {
    if (exact) return editorDates[0];
    const field = fieldset.querySelector(".start");
    if (!field.value) invalidEditorField(field, t("روز شروع برنامه را انتخاب کنید."));
    return dayNumber(field.value);
  });
  const phases = active.map((fieldset, index) => {
    const field = name => fieldset.querySelector(name);
    const weekly = field(".repeat").value === "weekly";
    const checkedDays = [...fieldset.querySelectorAll(".weekdays input:checked")];
    if (weekly && !checkedDays.length) invalidEditorField(field(".weekdays input"), t("حداقل یک روز هفته را انتخاب کنید."));
    if (weekly && !field(".interval").validity.valid) invalidEditorField(field(".interval"), t("فاصلهٔ تکرار باید بین ۱ تا ۵۲ هفته باشد."));
    const next = starts[index + 1] ?? null;
    const start = starts[index];
    const endValue = !exact ? field(".end").value : "";
    const end = endValue ? dayNumber(endValue) + 1 : next;
    if (next !== null && next <= start) invalidEditorField(active[index + 1].querySelector(".start"), t("شروع این مرحله باید بعد از مرحلهٔ قبلی باشد."));
    if (end !== null && end <= start) invalidEditorField(field(".end"), t("پایان نمی‌تواند قبل از شروع باشد."));
    if (next !== null && end > next) invalidEditorField(field(".end"), t("پایان این مرحله با شروع مرحلهٔ بعد هم‌پوشانی دارد."));
    const seen = new Set();
    const slots = Array.from(field(".slots").children, row => {
      const time = row.querySelector(".time");
      const dose = row.querySelector(".amount");
      if (!time.value) invalidEditorField(time, t("ساعت این نوبت را انتخاب کنید."));
      const minute = clockMinute(time.value);
      if (seen.has(minute)) invalidEditorField(time, t("برای این ساعت یک نوبت دیگر ثبت شده است."));
      seen.add(minute);
      let amount;
      try { amount = quantity(dose, true); }
      catch (error) { invalidEditorField(dose, error.message); }
      if (amount === 0) invalidEditorField(dose, t("مقدار نوبت باید بیشتر از صفر باشد."));
      return { minute, amount };
    }).sort((a, b) => a.minute - b.minute);
    return {
      start, end,
      ...(next !== null && !endValue ? { autoEnd: true } : {}),
      interval: weekly ? Number(field(".interval").value) : 1,
      mask: weekly ? checkedDays.reduce((mask, input) => mask | Number(input.value), 0) : 127,
      slots
    };
  });
  return { phases, dates: exact ? editorDates : [] };
}

async function mutate(change, success, scheduleChanged = false, day) {
  if (busy) return false;
  busy = true;
  $("app").setAttribute("aria-busy", "true");
  try {
    let needsSync = false;
    care = await accessCare(state => {
      const revision = state.reminders?.revision;
      change(state);
      if (scheduleChanged) changeReminderRevision(state);
      needsSync = state.reminders?.revision !== revision;
    }, { snapshot: care, day });
    render();
    $("status").textContent = success;
    if (needsSync) void syncReminders(false, care);
    return true;
  } catch (error) {
    $("status").textContent = error instanceof Error && error.name === "Error" ? error.message : t("ذخیره انجام نشد. دوباره تلاش کنید.");
    return false;
  } finally {
    busy = false;
    $("app").removeAttribute("aria-busy");
  }
}

$("editor-back").addEventListener("click", () => showEditorStep(editorStep - 1));
$("editor").addEventListener("submit", async event => {
  event.preventDefault();
  if (busy) return;
  const id = editing ?? crypto.randomUUID();
  try {
    $("editor-status").textContent = "";
    clearEditorFieldError();
    const name = $("name").value.trim();
    if (editorStep === 0) {
      if (!name) {
        $("name").focus();
        throw new Error(t("نام دارو را وارد کنید."));
      }
      showEditorStep(1);
      return;
    }
    const phased = $("phased-mode").checked;
    const { phases, dates } = editorPhases();
    if (!engine.validMedicationPhases(compilePhases(engine, phases))) {
      throw new Error(t("ترتیب تاریخ‌ها، هم‌پوشانی مرحله‌ها، روزهای هفته و ساعت‌های تکراری را بررسی کنید."));
    }
    const unit = $("unit").value.trim();
    if (!name || (!unit && phases.some(phase => phase.slots.some(slot => slot.amount !== null)))) {
      invalidEditorField($("unit"), t("برای دوز عددی، واحد مصرف را مشخص کنید."));
    }
    let stock = null;
    let threshold = 2000;
    try { if (!$("stock").readOnly) stock = quantity($("stock"), true); }
    catch (error) { invalidEditorField($("stock"), error.message); }
    if (stock !== null || $("stock").readOnly) {
      try { threshold = quantity($("threshold"), true) ?? threshold; }
      catch (error) { invalidEditorField($("threshold"), error.message); }
      const active = phased ? $("phases") : $("phases").firstElementChild;
      const missing = [...active.querySelectorAll(".amount")].find(field => !field.value.trim());
      if (missing) invalidEditorField(missing, t("برای پیگیری موجودی، مقدار همهٔ نوبت‌ها را مشخص کنید."));
    }
    const instructions = $("instructions").value.trim();
    if (editorStep === 1) {
      reviewMedicine({ name, phases, dates, stock, unit, threshold, phased, instructions });
      showEditorStep(2);
      return;
    }
    if (await mutate(state => {
      const saved = state.medicines[id];
      if (editing && (!saved || saved.revision !== editingRevision)) {
        throw new Error(t("این برنامه در پنجرهٔ دیگری تغییر کرده است. دوباره آن را باز کنید."));
      }
      state.medicines[id] = {
        ...saved,
        id, name, unit: saved?.stock != null ? saved.unit : unit, phases, dates, stock: saved?.stock ?? stock, threshold,
        ...(saved && saved.stock == null && stock !== null ? { stockTrackedFrom: Date.now() } : {}),
        instructions, icon: $("medicine-icon").value, color: $("medicine-color").value, phased,
        revision: (saved?.revision ?? 0) + 1
      };
    }, t("برنامهٔ دارو ذخیره شد."), true)) {
      $("medication-dialog").close();
      editing = null;
    } else $("editor-status").textContent = $("status").textContent;
  } catch (error) {
    $("editor-status").textContent = error.message;
  }
});

function action(label, click, secondary = false) {
  const button = element("button", label);
  button.type = "button";
  if (secondary) button.className = "secondary";
  button.addEventListener("click", click);
  return button;
}

function requestDeletion({ title, message, change, success, parent }) {
  deletion = { change, success, parent };
  $("delete-title").textContent = title;
  $("delete-message").textContent = message;
  $("delete-error").textContent = "";
  $("delete-dialog").showModal();
}

$("cancel-delete").addEventListener("click", () => $("delete-dialog").close());
$("delete-dialog").addEventListener("cancel", event => {
  if ($("confirm-delete").disabled) event.preventDefault();
});
$("delete-form").addEventListener("submit", async event => {
  event.preventDefault();
  const { change, success, parent } = deletion;
  const confirm = $("confirm-delete");
  const cancel = $("cancel-delete");
  confirm.disabled = cancel.disabled = true;
  try {
    if (await mutate(change, success, true)) {
      $("delete-dialog").close();
      if (parent) $(parent).close();
    } else {
      $("delete-error").textContent = t("حذف انجام نشد. دوباره تلاش کنید.");
    }
  } finally {
    confirm.disabled = cancel.disabled = false;
  }
});

function deleteMedicine(id, parent) {
  const medicine = care.medicines[id];
  if (!medicine) return;
  requestDeletion({
    title: t("حذف دارو"),
    message: t("برنامهٔ «{0}» حذف شود؟ سوابق مصرف حفظ می‌شوند.", medicine.name),
    success: t("برنامهٔ دارو حذف شد."),
    parent,
    change(state) {
      const saved = state.medicines[id];
      if (!saved) return;
      const now = Date.now();
      for (const [key, dose] of Object.entries(state.doses)) {
        if (dose.medicineId !== id) continue;
        const unrecorded = !dose.status || dose.status === "snoozed";
        if (unrecorded && doseTime(dose.day, dose.minute) > now) {
          delete state.doses[key];
          continue;
        }
        dose.name ??= saved.name;
        dose.instructions ??= saved.instructions;
        dose.unit ??= saved.unit;
        dose.icon = saved.icon ?? dose.icon;
        dose.color = saved.color ?? dose.color;
        if (dose.status === "snoozed") {
          dose.status = null;
          dose.snoozeUntil = 0;
        }
      }
      delete state.medicines[id];
    }
  });
}

$("delete-edited-medication").addEventListener("click", () => deleteMedicine(editing, "medication-dialog"));

function nextPlannedDose(phases, dates = [], notBefore = 0, excluded = () => false) {
  const now = Date.now();
  const earliest = new Date(Math.max(now, notBefore));
  if (earliest.getFullYear() > 9999) return null;
  const compiled = compilePhases(engine, phases);
  const find = (day, slots) => slots.find(slot => {
    const at = doseTime(day, slot.minuteOfDay);
    return at > now && at >= notBefore && !excluded(day, slot.minuteOfDay);
  });
  const first = localDayNumber(earliest);
  const last = dayNumber("9999-12-31");
  if (dates.length) {
    for (const day of dates) {
      if (day < first) continue;
      const slot = find(day, engine.medicationSlots(compiled, day));
      if (slot) return { day, slot };
    }
  } else {
    for (const phase of compiled) {
      let day = engine.nextMedicationPhaseDay(phase, first);
      while (day !== null && day <= last) {
        const slot = find(day, phase.slots);
        if (slot) return { day, slot };
        day = engine.nextMedicationPhaseDay(phase, day + 1);
      }
    }
  }
  return null;
}

function nextAmount(medicine) {
  const next = nextPlannedDose(medicine.phases, medicine.dates, medicine.effectiveFrom,
    (day, minute) => Boolean(care.doses[doseId(medicine, day, minute)]?.status));
  return next ? next.slot.milliUnits ?? 0 : null;
}

function renderMedicine(medicine) {
  const card = element("article");
  card.className = "medicine treatment";
  card.dataset.color = card.dataset.ink = medicine.color ?? "gold";
  card.dataset.search = medicine.name;
  const heading = action(medicine.name, () => openMedicine(medicine));
  heading.dir = "auto";
  heading.className = "text-button treatment-name";
  const toggle = element("input");
  toggle.type = "checkbox";
  toggle.role = "switch";
  toggle.checked = !medicine.paused;
  toggle.setAttribute("aria-label", t("برنامهٔ {0} فعال است", medicine.name));
  toggle.addEventListener("change", async () => {
    const paused = !toggle.checked;
    if (!await mutate(state => {
      const saved = state.medicines[medicine.id];
      saved.paused = paused;
      saved.revision += 1;
    }, paused ? t("برنامهٔ دارو متوقف شد.") : t("برنامهٔ دارو فعال شد."), true)) toggle.checked = !toggle.checked;
  });
  const top = element("div");
  top.className = "feature-head";
  top.append(heading, toggle);
  const status = element("p", medicine.paused ? t("برنامه متوقف است") : t("برنامه فعال است"));
  status.className = "quiet";
  const profile = element("div");
  profile.className = "treatment-profile";
  const details = element("div");
  details.className = "treatment-details";
  details.append(top, status);
  if (medicine.instructions) details.append(element("p", medicine.instructions));
  if (medicine.phased || medicine.phases.length > 1) details.append(element("p", t("{0} مرحلهٔ مصرف", localDigits(medicine.phases.length))));
  else details.append(element("p", t("ساعت‌های مصرف: {0}", medicine.phases[0].slots.map(slot => localDigits(timeText(slot.minute))).join(" · "))));
  details.append(element("p", t("شروع از {0}", dashboard.formatDay(medicine.phases[0].start))));
  profile.append(medicationBanner(medicine.icon, medicine.color), details);
  card.append(profile);
  if (medicine.stock !== null) {
    const upcoming = medicine.paused ? null : nextAmount(medicine);
    const low = upcoming !== null && engine.isLowStock(medicine.stock, medicine.threshold, upcoming);
    const balance = element("p", t("موجودی {0} {1}{2}", amountText(medicine.stock), doseUnit(medicine.unit, medicine.stock), low ? t("، زمان تهیهٔ دارو") : ""));
    balance.dataset.warning = String(low);
    card.append(balance);
    const purchase = element("form");
    const label = element("label", t("مقدار خریداری‌شده"));
    const amount = element("input");
    amount.dir = "ltr";
    amount.inputMode = "decimal";
    amount.maxLength = 11;
    amount.required = true;
    label.append(amount);
    const submit = element("button", t("خریدم"));
    submit.type = "submit";
    purchase.append(label, submit);
    purchase.addEventListener("submit", event => {
      event.preventDefault();
      try {
        const added = quantity(amount);
        if (added === 0) throw new Error(t("مقدار خرید باید بیشتر از صفر باشد."));
        void mutate(state => {
          const saved = state.medicines[medicine.id];
          saved.stock = engine.updateStock(saved.stock, 0, 0, added);
        }, t("موجودی خریداری‌شده ثبت شد."));
      } catch (error) {
        $("status").textContent = error.message;
      }
    });
    const refill = element("details");
    refill.className = "editor-options refill";
    refill.append(element("summary", t("ثبت خرید")), purchase);
    card.append(refill);
  }
  const edit = action(t("ویرایش"), () => openEditor(medicine), true);
  edit.className = "text-button";
  const remove = action(t("حذف دارو"), () => deleteMedicine(medicine.id));
  remove.className = "text-button danger-link";
  const actions = element("div");
  actions.className = "buttons";
  actions.append(edit, remove);
  card.append(actions);
  return card;
}

function filterCabinet() {
  const normalize = value => value.trim().normalize("NFKC").toLocaleLowerCase(locale).replaceAll("ي", "ی").replaceAll("ك", "ک");
  const query = normalize($("cabinet-search").value);
  const cards = Array.from($("plans").querySelectorAll("[data-search]"));
  for (const card of cards) card.hidden = !normalize(card.dataset.search).includes(query);
  $("cabinet-search-wrap").hidden = !query && cards.length < 2;
  $("cabinet-empty").hidden = cards.length === 0 || cards.some(card => !card.hidden);
}

function openMedicine(medicine) {
  $("medicine-details-title").textContent = medicine.name;
  $("medicine-details-icon").replaceChildren(medicationBadge(medicine.icon, medicine.color));
  const entries = Object.values(care.doses).filter(dose => dose.medicineId === medicine.id && dose.status)
    .sort((a, b) => b.day - a.day || b.minute - a.minute);
  const summary = element("p", medicine.instructions || t("دستور مصرف ثبت نشده است."));
  const edit = action(t("ویرایش دارو"), () => { $("medicine-details").close(); openEditor(medicine); });
  const heading = element("h3", t("سابقهٔ مصرف"));
  const history = element("ul");
  history.className = "dose-history";
  for (const dose of entries) {
    const status = doseStates[dose.status];
    history.append(element("li", `${dashboard.formatDay(dose.day)}، ${localDigits(timeText(dose.minute))} · ${status}`));
  }
  const remove = action(t("حذف دارو"), () => deleteMedicine(medicine.id, "medicine-details"));
  remove.className = "text-button danger-link";
  $("medicine-details-body").replaceChildren(medicationBanner(medicine.icon, medicine.color), summary, edit, remove, heading,
    entries.length ? history : element("p", t("هنوز مصرفی ثبت نشده است.")));
  $("medicine-details").showModal();
}

function renderDose(medicine, dose, variant) {
  const dayCard = Boolean(variant);
  const featured = variant === "featured";
  const compactDay = dayCard && !featured;
  const card = element("article", "", dayCard ? "medicine dose-card day-card" : "medicine dose-card");
  const unit = dose.unit ?? medicine?.unit ?? "";
  const color = medicine?.color ?? dose.color ?? "gold";
  card.dataset.color = color;
  card.dataset.ink = color;
  const heading = element("h3", dose.name || medicine?.name || t("دارو"));
  heading.dir = "auto";
  const instructions = dose.instructions ?? medicine?.instructions;
  const planned = dose.planned === null ? "" : `${amountText(dose.planned)} ${doseUnit(unit, dose.planned)}`;
  let recorded = doseStates[dose.status] ?? t("در انتظار ثبت");
  if (dose.status === "taken" && dose.actual !== null) recorded += `${listSeparator}${amountText(dose.actual)} ${doseUnit(unit, dose.actual)}`;
  const badge = element("p", recorded);
  badge.className = "badge";
  badge.dataset.status = dose.status ?? "pending";
  const info = element("div");
  info.className = "dose-info";
  if (featured) {
    const due = dose.snoozeUntil || doseTime(dose.day, dose.minute);
    const eyebrow = element("p", dose.status === "snoozed" ? t("نوبت به‌تعویق‌افتاده") : due >= Date.now() ? t("نوبت بعدی") : t("نوبت ثبت‌نشده"));
    eyebrow.className = "hero-kicker";
    const time = dose.snoozeUntil ? new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(due) : localDigits(timeText(dose.minute));
    const meta = element("div");
    meta.className = "dose-meta";
    meta.append(eyebrow, element("p", time));
    info.append(meta, heading);
  } else info.append(heading, element("p", t("ساعت {0}", localDigits(timeText(dose.minute)))));
  const header = element("div");
  header.className = dayCard ? "dose-header day-card-content" : "dose-header";
  if (dayCard) {
    const art = medicationBanner(medicine?.icon ?? dose.icon, color);
    art.classList.add("day-card-art");
    art.removeAttribute("aria-hidden");
    art.append(element("span", t("دارو"), "day-card-kind"));
    card.append(art);
  } else header.append(medicationBadge(medicine?.icon ?? dose.icon, color));
  header.append(info);
  card.append(header);
  const result = element("div");
  result.className = "dose-result";
  if (!featured) result.append(badge);
  if (planned) result.append(element("p", planned));
  if (instructions) result.append(element("p", instructions));
  if (result.childElementCount) info.append(result);
  if (dose.day > today() || !medicine || medicine.paused) return card;
  const canSnooze = slotsFor(medicine, dose.day).some(slot => slot.minuteOfDay === dose.minute);
  const label = element("label", t("مقدار مصرف واقعی"));
  const amount = element("input");
  amount.dir = "ltr";
  amount.inputMode = "decimal";
  amount.maxLength = 11;
  if (dose.actual != null) amount.value = amountText(dose.actual);
  if (dose.planned != null) amount.placeholder = amountText(dose.planned);
  label.append(amount);
  async function record(status) {
    try {
      const entered = status === "taken" ? quantity(amount, true) : null;
      if (entered === 0) throw new Error(t("مقدار مصرف باید بیشتر از صفر باشد."));
      await mutate(state => {
        const saved = state.medicines[medicine.id];
        if (!saved || saved.paused) throw new Error(t("برنامهٔ این دارو متوقف شده است."));
        const id = doseId(saved, dose.day, dose.minute);
        const existing = state.doses[id];
        const active = slotsFor(saved, dose.day).find(slot => slot.minuteOfDay === dose.minute);
        if ((!existing || status === "snoozed") && !active) throw new Error(t("برنامهٔ این نوبت تغییر کرده است. صفحه را تازه کنید."));
        const planned = existing ? existing.planned : active.milliUnits;
        const actual = status === "taken" ? entered ?? existing?.actual ?? planned : null;
        const scheduled = doseTime(dose.day, dose.minute);
        const tracked = saved.stock !== null && (existing?.unit ?? saved.unit) === saved.unit && scheduled >= (saved.stockTrackedFrom ?? 0);
        if (tracked && status === "taken" && actual === null) {
          throw new Error(t("برای کم‌کردن از موجودی، مقدار مصرف را وارد کنید."));
        }
        const debit = tracked ? actual ?? 0 : 0;
        if (saved.stock !== null) saved.stock = engine.updateStock(saved.stock, existing?.debit ?? 0, debit, 0);
        const snoozeUntil = status === "snoozed" ? Math.max(Date.now(), scheduled, existing?.snoozeUntil ?? 0) +
          (state.medicationSnoozeMinutes ?? 10) * minuteMs : 0;
        const resolvedAt = status === "taken" || status === "skipped" ? existing?.resolvedAt ?? Date.now() : null;
        state.doses[id] = { ...existing, medicineId: saved.id, day: dose.day, minute: dose.minute, planned, status, actual, debit, snoozeUntil, resolvedAt };
      }, status === "snoozed" ? t("نوبت به تعویق افتاد.") : t("وضعیت نوبت ثبت شد."), true, dose.day);
    } catch (error) {
      $("status").textContent = error.message;
    }
  }

  const controls = element("div");
  controls.className = "buttons";
  const pending = !dose.status || dose.status === "snoozed";
  const taken = action(dose.status === "taken" ? t("اصلاح ثبت مصرف") : t("مصرف کردم"), () => record("taken"), !pending);
  const snooze = () => action(t("{0} دقیقه بعد", localDigits(care.medicationSnoozeMinutes ?? 10)), () => record("snoozed"), true);
  const skipped = action(t("مصرف نکردم"), () => record("skipped"), true);
  controls.append(...(pending || dayCard ? [skipped] : [taken, skipped]));
  if ((!pending || compactDay) && canSnooze) controls.append(snooze());
  if (dose.status) controls.append(action(t("برگشت ثبت"), () => record(null), true));
  if (dayCard) {
    const footer = element("div", "", "day-card-actions");
    taken.className = "secondary";
    const options = dayCardOptions(t("گزینه‌های نوبت"), label, controls);
    if (compactDay) {
      if (!pending) controls.prepend(taken);
      footer.append(options);
      if (pending) footer.append(taken);
    } else {
      footer.append(taken);
      if (pending && canSnooze) footer.append(snooze());
      footer.append(options);
    }
    card.append(footer);
  } else {
    const actual = element("details", "", "dose-options");
    const more = element("summary", "⋮");
    more.setAttribute("aria-label", t("گزینه‌های نوبت"));
    actual.append(more, label, controls);
    card.append(actual);
    if (pending) {
      const quick = element("div", "", "action-pair dose-quick");
      quick.append(taken);
      if (canSnooze) quick.append(snooze());
      card.append(quick);
    }
  }
  if (dose.status === "snoozed") {
    const reminder = element("p", t("یادآوری بعدی {0}", new Intl.DateTimeFormat(locale, {
      dateStyle: "medium", timeStyle: "short"
    }).format(dose.snoozeUntil)));
    reminder.className = "dose-snoozed";
    (compactDay ? info : card).append(reminder);
  }
  return card;
}

let indexedState;
let indexedDay;
let careIndex;
const percentFormat = new Intl.NumberFormat(locale, { style: "percent" });

function currentIndex() {
  const zone = localZone();
  const day = today();
  if (indexedState !== care || indexedDay !== day || careIndex.zone !== zone) {
    indexedState = care;
    indexedDay = day;
    careIndex = createCareIndex(care, engine, zone, day);
  }
  return careIndex;
}

function renderMedications(daily) {
  const medicines = Object.values(care.medicines);
  $("cabinet-count").textContent = medicines.length === 1 ? t("۱ دارو") : t("{0} دارو", localDigits(medicines.length));
  const noPlans = element("p", t("برنامهٔ دارویی ثبت نشده است."), "empty");
  $("plans").replaceChildren(...(medicines.length ? medicines.map(renderMedicine) : [noPlans]));
  filterCabinet();
  const consumed = daily.filter(dose => dose.status === "taken").length;
  const doseCard = dose => renderDose(care.medicines[dose.medicineId], dose);
  const percent = daily.length ? Math.round(consumed * 100 / daily.length) : 0;
  $("med-day-summary").hidden = daily.length === 0;
  $("med-day-count").textContent = t("{0} از {1} نوبت", localDigits(consumed), localDigits(daily.length));
  $("med-day-ring").style.setProperty("--percent", percent);
  $("med-day-ring").firstElementChild.textContent = percentFormat.format(percent / 100);
  const noDoses = element("p", t("برای این روز نوبت مصرف دارو ثبت نشده است."));
  noDoses.className = "empty";
  $("med-day-doses").replaceChildren(...(daily.length ? daily.map(doseCard) : [noDoses]));
}

function render() {
  if (!care || !$("day").value) return;
  const day = selectedDay();
  const index = currentIndex();
  const screen = dashboard.screen();
  dashboard.renderWellness(care, day, index);
  if (screen === "medications") renderMedications(index.dosesOn(day));
  else if (screen === "routines") routines.renderPanel(care, index, day);
  else if (screen === "today") {
    const entries = index.routinesOn(day);
    renderToday(care, day, today(), index.dosesOn(day), dashboard.dayVisits(index, day), entries, index.waterTotal(day), renderDose, routines.card);
  }
}

async function reload() {
  if (busy) return;
  const snapshot = care;
  try {
    const latest = await accessCare(undefined, { snapshot });
    if (busy || care !== snapshot) return;
    care = latest;
    render();
  } catch {
    $("status").textContent = t("خواندن سوابق محلی انجام نشد.");
  }
}

$("day").addEventListener("change", render);
$("cabinet-search").addEventListener("input", () => {
  filterCabinet();
  $("plans").scrollLeft = 0;
});
$("today-dates").append($("day-controls"));
$("open-quick").addEventListener("click", () => {
  $("quick-dialog").querySelector("[data-open-water]").disabled = selectedDay() > today();
  $("quick-dialog").showModal();
});
for (const item of document.querySelectorAll("[data-from-quick]")) {
  item.addEventListener("click", () => $("quick-dialog").close(), { capture: true });
}
const nextLanguage = language === "fa" ? "en" : "fa";
for (const control of document.querySelectorAll("[data-language-switch]")) {
  control.lang = nextLanguage;
  control.setAttribute("aria-label", language === "fa" ? "Switch to English" : "تغییر زبان به فارسی");
  const caption = control.querySelector("span");
  if (caption) caption.textContent = nextLanguage.toUpperCase();
  else control.textContent = language === "fa" ? "English" : "فارسی";
  control.addEventListener("click", () => selectLanguage(nextLanguage));
}
for (const control of document.querySelectorAll("[data-open-medication]")) control.addEventListener("click", () => openEditor());
for (const control of document.querySelectorAll("[data-close]")) control.addEventListener("click", () => $(control.dataset.close).close());
$("add-phase").addEventListener("click", () => {
  const last = $("phases").lastElementChild;
  const end = last.querySelector(".end").value;
  const weekly = last.querySelector(".repeat").value === "weekly";
  const repeat = last.querySelector(".interval");
  const interval = weekly && repeat.validity.valid ? Number(repeat.value) : 1;
  const mask = weekly ? [...last.querySelectorAll(".weekdays input:checked")].reduce((days, input) => days | Number(input.value), 0) : 127;
  const slots = Array.from(last.querySelectorAll(".time"), field => ({ minute: clockMinute(field.value), amount: null }));
  const start = end ? dayNumber(end) + 1 : dayNumber(last.querySelector(".start").value) + interval * 7;
  const fieldset = addPhase({ start, end: null, interval, mask, slots });
  updateEditorMode();
  fieldset.querySelector(".picker-field").focus();
});
for (const mode of [$("regular-mode"), $("phased-mode")]) mode.addEventListener("change", () => {
  const firstRepeat = $("phases").querySelector(".repeat");
  if ($("phased-mode").checked) {
    restoreExactMode = firstRepeat.value === "dates";
    if (restoreExactMode) firstRepeat.value = "daily";
  } else if (restoreExactMode) {
    firstRepeat.value = "dates";
    restoreExactMode = false;
  }
  updateEditorMode();
});
$("phases").addEventListener("click", event => {
  const preset = event.target.closest("[data-dose-value]");
  if (!preset) return;
  const field = preset.closest(".slot").querySelector(".amount");
  field.value = amountText(Number(preset.dataset.doseValue));
  field.dispatchEvent(new Event("input", { bubbles: true }));
});
$("unit").addEventListener("input", updateDoseUnits);
$("stock").addEventListener("input", updateStockOptions);
$("editor").addEventListener("input", event => {
  if (!event.target.matches("input, select, textarea")) return;
  clearEditorFieldError();
  $("editor-status").textContent = "";
});
window.addEventListener("focus", () => {
  if (!engine || !care) return;
  void reload();
  void syncReminders(true, care);
});
const selectedDay = () => $("day").value ? dayNumber($("day").value) : today();
const dashboard = wellness({
  getState: () => care, selectedDay, today, render, mutate, requestDeletion, renderDose,
  refreshFields: container => pickers.refresh(container), renderRoutine: (entry, day) => routines.card(entry, day)
});
const pickers = installPickers({ selectedDay, today, dashboard });
const routines = installRoutines({
  getState: () => care, today, mutate, render, requestDeletion, formatDay: dashboard.formatDay,
  refreshFields: pickers.refresh
});
const defaultUnit = shape => shape === "sachet" ? t("ساشه") : shape === "powder" ? "" : t("قرص");
const updateAppearance = installAppearance((previous, shape) => {
  if (editing || $("unit").value !== defaultUnit(previous)) return;
  $("unit").value = defaultUnit(shape);
  updateDoseUnits();
});
const openAccount = installAccount();
const params = new URLSearchParams(location.search);
const view = params.get("view");
if (view === "account") void openAccount();

installBackupRestore(mutate, phases => engine.validMedicationPhases(compilePhases(engine, phases)));

function showIntro() {
  const hasRecords = Object.keys(care.medicines).length || Object.keys(care.doses).length ||
    care.water?.length || Object.keys(care.visits ?? {}).length || Object.keys(care.routines ?? {}).length ||
    Object.keys(care.routineLogs ?? {}).length || care.reminders ||
    care.theme || care.calendar || care.waterGoal;
  if (care.intro === "done" || hasRecords) return;
  function show(step) {
    document.querySelector(".app-bar").hidden = step !== "done";
    $("app").hidden = step !== "done";
    $("welcome-screen").hidden = step !== "welcome";
    $("permission-screen").hidden = step !== "permission";
  }
  async function advance(step) {
    if (await mutate(state => { state.intro = step; }, "")) {
      show(step);
      return true;
    }
    return false;
  }
  $("welcome-start").addEventListener("click", () => void advance("permission"));
  $("intro-later").addEventListener("click", () => void advance("done"));
  $("intro-notifications").addEventListener("click", async () => {
    if (await advance("done")) dashboard.show("settings", true);
  });
  show(care.intro ?? "welcome");
}

try {
  [engine, care] = await Promise.all([import("/care-engine/care-core.mjs"), accessCare()]);
  const day = params.get("day");
  $("day").value = /^\d{4}-\d{2}-\d{2}$/.test(day ?? "") ? day : isoDay(today());
  if (!$("day").value) $("day").value = isoDay(today());
  render();
  $("app").hidden = false;
  $("boot-status").hidden = true;
  showIntro();
  if (!$("app").hidden && ["water", "appointments", "routines"].includes(view)) dashboard.show(view);
  const routineId = params.get("routine");
  if (!$("app").hidden && view === "routines" && validRoutineId(routineId) && day === $("day").value) {
    const date = selectedDay();
    routines.openReminder(currentIndex().routinesOn(date).find(entry => entry.id === routineId), date);
    params.delete("routine");
    history.replaceState(history.state, "", `?${params}`);
  }
  if (!location.search && !$("app").hidden) void showPromotion();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/medication/sw.js").catch(() => {});
  void initializeReminders();
} catch {
  $("boot-status").textContent = t("موتور برنامهٔ دارو یا فضای ذخیرهٔ محلی در دسترس نیست.");
}
