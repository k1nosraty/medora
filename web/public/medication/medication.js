import { accessCare } from "./storage.js";
import { changeReminderRevision, initializeReminders, syncReminders } from "./reminders.js";
import { wellness } from "./wellness.js";
import { installPickers } from "./pickers.js";
import { localZone, minuteMs } from "./care-plan.js";
import { maxBackupBytes, readAndroidBackup } from "./android-backup.js";
import { installAppearance, medicationBadge, medicationBanner } from "./medication-art.js";
import { installAccount } from "./account.js";

const $ = id => document.getElementById(id);
const dayLength = 86_400_000;
const weekdays = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
const weekdayBits = [5, 6, 0, 1, 2, 3, 4];
let engine;
let care;
let editing;
let editingRevision;
let editorStep = 0;
let busy = false;
let deletion;
const doseStates = { taken: "مصرف شد", skipped: "مصرف نشد", snoozed: "به تعویق افتاد" };

function dayNumber(iso) {
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(ms) || !/^\d{4}-\d{2}-\d{2}$/.test(iso) || new Date(ms).toISOString().slice(0, 10) !== iso) {
    throw new Error("تاریخ را کامل وارد کنید.");
  }
  return ms / dayLength;
}
const isoDay = number => new Date(number * dayLength).toISOString().slice(0, 10);
const persianDigits = text => String(text).replace(/[0-9.]/g, char => char === "." ? "٫" : "۰۱۲۳۴۵۶۷۸۹"[Number(char)]);
const timeText = minute => [Math.floor(minute / 60), minute % 60].map(part => String(part).padStart(2, "0")).join(":");
const amountText = value => persianDigits(engine.quantityToText(value));
const today = () => {
  const now = new Date();
  return dayNumber([now.getFullYear(), now.getMonth() + 1, now.getDate()].map(n => String(n).padStart(2, "0")).join("-"));
};

function quantity(input, optional = false) {
  if (optional && !input.value.trim()) return null;
  const amount = engine.quantityFromText(input.value);
  if (amount === null) throw new Error("مقدار را به‌صورت عدد با حداکثر سه رقم اعشار وارد کنید.");
  return amount;
}

function rules(phases) {
  return phases.map(phase => new engine.WebPhase(
    phase.start, phase.end, phase.interval, phase.mask,
    phase.slots.map(slot => new engine.WebSlot(slot.minute, slot.amount))
  ));
}
function slotsFor(medicine, day) {
  if (medicine.dates?.length && !medicine.dates.includes(day)) return [];
  return engine.medicationSlots(rules(medicine.phases), day);
}

function addSlot(container, slot = { minute: 480, amount: null }) {
  if (container.children.length >= 12) return;
  const row = $("slot-template").content.firstElementChild.cloneNode(true);
  row.querySelector(".time").value = timeText(slot.minute);
  row.querySelector(".amount").value = slot.amount === null ? "" : amountText(slot.amount);
  row.querySelector(".remove-slot").addEventListener("click", () => {
    if (container.children.length > 1) row.remove();
  });
  container.append(row);
}

function addPhase(phase = { start: today(), end: null, interval: 1, mask: 127, slots: [{ minute: 480, amount: null }] }) {
  if ($("phases").children.length >= 50) return;
  const fieldset = $("phase-template").content.firstElementChild.cloneNode(true);
  fieldset.querySelector(".start").value = isoDay(phase.start);
  fieldset.querySelector(".end").value = phase.end === null ? "" : isoDay(phase.end - 1);
  fieldset.querySelector(".interval").value = phase.interval;
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
    addSlot(slots);
    pickers.refresh($("editor"));
  });
  fieldset.querySelector(".remove-phase").addEventListener("click", () => {
    if ($("phases").children.length > 1) fieldset.remove();
  });
  $("phases").append(fieldset);
}

function openEditor(medicine) {
  editing = medicine?.id;
  editingRevision = medicine?.revision;
  $("delete-edited-medication").hidden = !medicine;
  $("editor-title").textContent = medicine ? "ویرایش دارو" : "داروی جدید";
  $("name").value = medicine?.name ?? "";
  $("instructions").value = medicine?.instructions ?? "";
  $("medicine-icon").value = medicine?.icon ?? "capsule";
  $("medicine-color").value = medicine?.color ?? "gold";
  updateAppearance();
  $("unit").value = medicine?.unit ?? "قرص";
  $("unit").readOnly = medicine?.stock != null;
  $("stock").value = medicine?.stock == null ? "" : amountText(medicine.stock);
  $("stock").readOnly = medicine?.stock != null;
  $("threshold").value = amountText(medicine?.threshold ?? 2000);
  $("editor-status").textContent = "";
  $("phases").replaceChildren();
  if (medicine) medicine.phases.forEach(addPhase);
  else addPhase();
  $("specific-dose-dates").value = (medicine?.dates ?? []).map(isoDay).join(", ");
  $("phased-mode").checked = Boolean(medicine?.phased || needsPhases());
  $("advanced-plan").open = $("phased-mode").checked;
  $("inventory-options").open = false;
  updateEditorMode();
  showEditorStep(0, false);
  $("medication-dialog").showModal();
}

function showEditorStep(step, focus = true) {
  editorStep = step;
  for (const panel of document.querySelectorAll("[data-editor-step]")) panel.hidden = Number(panel.dataset.editorStep) !== step;
  Array.from($("editor-steps").children).forEach((label, index) => {
    label.dataset.complete = String(index < step);
    if (index === step) label.setAttribute("aria-current", "step");
    else label.removeAttribute("aria-current");
  });
  $("editor-back").hidden = step === 0;
  $("editor-next").textContent = step === 2 ? "ذخیرهٔ دارو" : "ادامه";
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
  for (const phase of phases) {
    const range = phase.end === null ? `از ${dashboard.formatDay(phase.start)}` :
      `${dashboard.formatDay(phase.start)} تا ${dashboard.formatDay(phase.end - 1)}`;
    const days = weekdays.filter((_, index) => phase.mask & (1 << weekdayBits[index]));
    const repeat = dates.length ? dates.map(day => dashboard.formatDay(day)).join("، ") : [
      range, phase.interval > 1 ? `هر ${persianDigits(phase.interval)} روز` : days.length === 7 ? "هر روز" : "",
      days.length === 7 ? "" : days.join("، ")
    ].filter(Boolean).join(" · ");
    const row = element("li");
    row.append(element("strong", repeat));
    for (const slot of phase.slots) {
      const line = element("p");
      const time = element("bdi", persianDigits(timeText(slot.minute)));
      line.append(time);
      if (slot.amount !== null) line.append(` · ${amountText(slot.amount)} ${unit}`);
      row.append(line);
    }
    list.append(row);
  }
  const review = $("editor-review");
  review.replaceChildren(title, element("p", phased ? "برنامهٔ چندمرحله‌ای" : "برنامهٔ مصرف"), list);
  if (instructions) review.append(element("p", instructions));
  if ($("stock").readOnly) review.append(element("p", `هشدار موجودی در ${amountText(threshold)} ${unit}`));
  else if (stock !== null) review.append(element("p", `موجودی اولیه ${amountText(stock)} ${unit} · هشدار در ${amountText(threshold)} ${unit}`));
}

function needsPhases() {
  const phases = $("phases");
  const first = phases.firstElementChild;
  return phases.children.length > 1 || Boolean(first.querySelector(".end").value) || first.querySelector(".interval").value !== "1";
}

function updateEditorMode() {
  if (!$("phases").children.length) return;
  const phased = $("phased-mode").checked;
  $("editor").dataset.phased = String(phased);
  const simple = !phased && !$("advanced-plan").open;
  $("basic-schedule").hidden = !simple;
  $("basic-time").disabled = !simple;
  $("basic-dose").disabled = !simple;
  $("phase-mode-warning").hidden = phased || !needsPhases();
  if (simple) {
    const first = $("phases").firstElementChild;
    const times = Array.from(first.querySelectorAll(".time"), field => field.value);
    $("basic-time").value = times[0];
    $("basic-dose").value = first.querySelector(".amount").value;
    $("basic-extra-times").hidden = times.length === 1;
    $("basic-extra-times").textContent = times.slice(1).map(persianDigits).join(" · ");
    const days = [...first.querySelectorAll(".weekdays label")].filter(field => field.querySelector("input").checked);
    const exact = $("specific-dose-dates").value.split(/[,،\s]+/).filter(Boolean);
    $("basic-repeat").textContent = exact.length ? `${persianDigits(exact.length)} تاریخ مشخص` :
      days.length === 7 ? "هر روز" : days.map(day => day.textContent).join(" · ");
    const start = first.querySelector(".start").value;
    $("basic-start").textContent = start ? `شروع از ${dashboard.formatDay(dayNumber(start))}` : "";
  }
  pickers.refresh($("editor"));
}

function editorPhases() {
  const phased = $("phased-mode").checked;
  const active = phased ? Array.from($("phases").children) : [$("phases").firstElementChild];
  return active.map(fieldset => {
    const field = name => fieldset.querySelector(name);
    const slots = Array.from(field(".slots").children, row => {
      const [hour, minute] = row.querySelector(".time").value.split(":").map(Number);
      const amount = quantity(row.querySelector(".amount"), true);
      if (amount === 0) throw new Error("مقدار نوبت باید بیشتر از صفر باشد.");
      return { minute: hour * 60 + minute, amount };
    }).sort((a, b) => a.minute - b.minute);
    return {
      start: dayNumber(field(".start").value),
      end: phased && field(".end").value ? dayNumber(field(".end").value) + 1 : null,
      interval: phased ? Number(field(".interval").value) : 1,
      mask: Array.from(field(".weekdays").querySelectorAll(":checked")).reduce((mask, input) => mask | Number(input.value), 0),
      slots
    };
  });
}

async function mutate(change, success, scheduleChanged = false) {
  if (busy) return false;
  busy = true;
  $("app").setAttribute("aria-busy", "true");
  try {
    care = await accessCare(state => {
      change(state);
      if (scheduleChanged) changeReminderRevision(state);
    });
    render();
    $("status").textContent = success;
    if (scheduleChanged) void syncReminders();
    return true;
  } catch (error) {
    $("status").textContent = error instanceof Error && error.name === "Error" ? error.message : "ذخیره انجام نشد. دوباره تلاش کنید.";
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
    const name = $("name").value.trim();
    if (editorStep === 0) {
      if (!name) {
        $("name").focus();
        throw new Error("نام دارو را وارد کنید.");
      }
      showEditorStep(1);
      return;
    }
    const phased = $("phased-mode").checked;
    const active = phased ? $("phases") : $("phases").firstElementChild;
    const selector = phased ? "input" : "input:not(.end, .interval)";
    if (!Array.from(active.querySelectorAll(selector)).every(field => field.validity.valid)) {
      $("advanced-plan").open = true;
      throw new Error("تاریخ شروع، فاصلهٔ تکرار و ساعت هر مرحله را بررسی کنید.");
    }
    const phases = editorPhases();
    const dates = phased ? [] : [...new Set($("specific-dose-dates").value.split(/[,،\s]+/).filter(Boolean).map(dayNumber))].sort((a, b) => a - b);
    if (dates.length) phases[0].mask = 127;
    if (!engine.validMedicationPhases(rules(phases))) {
      throw new Error("ترتیب تاریخ‌ها، هم‌پوشانی مرحله‌ها، روزهای هفته و ساعت‌های تکراری را بررسی کنید.");
    }
    const unit = $("unit").value.trim();
    if (!name || (!unit && phases.some(phase => phase.slots.some(slot => slot.amount !== null)))) {
      throw new Error("نام دارو را وارد کنید و برای دوز عددی واحد مصرف را مشخص کنید.");
    }
    const stock = $("stock").readOnly ? null : quantity($("stock"), true);
    const threshold = quantity($("threshold"));
    if ((stock !== null || $("stock").readOnly) && phases.some(phase => phase.slots.some(slot => slot.amount === null))) {
      throw new Error("برای پیگیری موجودی، مقدار همهٔ نوبت‌ها را مشخص کنید.");
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
        throw new Error("این برنامه در پنجرهٔ دیگری تغییر کرده است. دوباره آن را باز کنید.");
      }
      state.medicines[id] = {
        ...saved,
        id, name, unit: saved?.stock != null ? saved.unit : unit, phases, dates, stock: saved?.stock ?? stock, threshold,
        instructions, icon: $("medicine-icon").value, color: $("medicine-color").value, phased,
        revision: (saved?.revision ?? 0) + 1
      };
    }, "برنامهٔ دارو ذخیره شد.", true)) {
      $("medication-dialog").close();
      editing = null;
    } else $("editor-status").textContent = $("status").textContent;
  } catch (error) {
    $("editor-status").textContent = error.message;
  }
});

function element(tag, text) {
  const item = document.createElement(tag);
  if (text) item.textContent = text;
  return item;
}
function action(label, click, secondary = false) {
  const button = element("button", label);
  button.type = "button";
  if (secondary) button.className = "secondary";
  button.addEventListener("click", click);
  return button;
}

const doseId = (med, day, minute) => `${med.id}|${day}|${minute}`;
const doseTime = (day, minute) => new Date(`${isoDay(day)}T${timeText(minute)}:00`).getTime();

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
      $("delete-error").textContent = "حذف انجام نشد. دوباره تلاش کنید.";
    }
  } finally {
    confirm.disabled = cancel.disabled = false;
  }
});

function deleteMedicine(id, parent) {
  const medicine = care.medicines[id];
  if (!medicine) return;
  requestDeletion({
    title: "حذف دارو",
    message: `برنامهٔ «${medicine.name}» حذف شود؟ سوابق مصرف حفظ می‌شوند.`,
    success: "برنامهٔ دارو حذف شد.",
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

function nextAmount(medicine) {
  const now = new Date();
  const todayDay = today();
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  for (const phase of medicine.phases) {
    const compiled = rules([phase]);
    const first = Math.max(phase.start, todayDay);
    // One complete 52-week cycle plus a week covers the longest allowed repeat.
    const end = Math.min(phase.end ?? Infinity, first + 371);
    for (let day = first; day < end; day++) {
      if (medicine.dates?.length && !medicine.dates.includes(day)) continue;
      const upcoming = engine.medicationSlots(compiled, day).find(slot =>
        (day !== todayDay || slot.minuteOfDay >= currentMinute) &&
        !care.doses[doseId(medicine, day, slot.minuteOfDay)]?.status
      );
      if (upcoming) return upcoming.milliUnits ?? 0;
    }
  }
  return null;
}

function renderMedicine(medicine) {
  const card = element("article");
  card.className = "medicine treatment";
  card.dataset.color = medicine.color ?? "gold";
  const heading = action(medicine.name, () => openMedicine(medicine));
  heading.dir = "auto";
  heading.className = "text-button treatment-name";
  const toggle = element("input");
  toggle.type = "checkbox";
  toggle.role = "switch";
  toggle.checked = !medicine.paused;
  toggle.setAttribute("aria-label", `برنامهٔ ${medicine.name} فعال است`);
  toggle.addEventListener("change", async () => {
    const paused = !toggle.checked;
    if (!await mutate(state => {
      const saved = state.medicines[medicine.id];
      saved.paused = paused;
      saved.revision += 1;
    }, paused ? "برنامهٔ دارو متوقف شد." : "برنامهٔ دارو فعال شد.", true)) toggle.checked = !toggle.checked;
  });
  const top = element("div");
  top.className = "feature-head";
  top.append(heading, toggle);
  const status = element("p", medicine.paused ? "برنامه متوقف است" : "برنامه فعال است");
  status.className = "quiet";
  const profile = element("div");
  profile.className = "treatment-profile";
  profile.append(medicationBanner(medicine.icon, medicine.color), top, status);
  if (medicine.instructions) profile.append(element("p", medicine.instructions));
  if (medicine.phased || medicine.phases.length > 1) profile.append(element("p", `${persianDigits(medicine.phases.length)} مرحلهٔ مصرف`));
  else profile.append(element("p", `ساعت‌های مصرف: ${medicine.phases[0].slots.map(slot => persianDigits(timeText(slot.minute))).join(" · ")}`));
  profile.append(element("p", `شروع از ${dashboard.formatDay(medicine.phases[0].start)}`));
  card.append(profile);
  if (medicine.stock !== null) {
    const upcoming = medicine.paused ? null : nextAmount(medicine);
    const low = upcoming !== null && engine.isLowStock(medicine.stock, medicine.threshold, upcoming);
    const balance = element("p", `موجودی ${amountText(medicine.stock)} ${medicine.unit}${low ? "، زمان تهیهٔ دارو" : ""}`);
    balance.dataset.warning = String(low);
    card.append(balance);
    const purchase = element("form");
    const label = element("label", "مقدار خریداری‌شده");
    const amount = element("input");
    amount.dir = "ltr";
    amount.inputMode = "decimal";
    amount.maxLength = 11;
    amount.required = true;
    label.append(amount);
    const submit = element("button", "خریدم");
    submit.type = "submit";
    purchase.append(label, submit);
    purchase.addEventListener("submit", event => {
      event.preventDefault();
      try {
        const added = quantity(amount);
        if (added === 0) throw new Error("مقدار خرید باید بیشتر از صفر باشد.");
        void mutate(state => {
          const saved = state.medicines[medicine.id];
          saved.stock = engine.updateStock(saved.stock, 0, 0, added);
        }, "موجودی خریداری‌شده ثبت شد.");
      } catch (error) {
        $("status").textContent = error.message;
      }
    });
    const refill = element("details");
    refill.className = "editor-options refill";
    refill.append(element("summary", "ثبت خرید"), purchase);
    card.append(refill);
  }
  const edit = action("ویرایش", () => openEditor(medicine), true);
  edit.className = "text-button";
  const remove = action("حذف دارو", () => deleteMedicine(medicine.id));
  remove.className = "text-button danger-link";
  const actions = element("div");
  actions.className = "buttons";
  actions.append(edit, remove);
  card.append(actions);
  return card;
}

function openMedicine(medicine) {
  $("medicine-details-title").textContent = medicine.name;
  $("medicine-details-icon").replaceChildren(medicationBadge(medicine.icon, medicine.color));
  const entries = Object.values(care.doses).filter(dose => dose.medicineId === medicine.id && dose.status)
    .sort((a, b) => b.day - a.day || b.minute - a.minute);
  const summary = element("p", medicine.instructions || "دستور مصرف ثبت نشده است.");
  const edit = action("ویرایش دارو", () => { $("medicine-details").close(); openEditor(medicine); });
  const heading = element("h3", "سابقهٔ مصرف");
  const history = element("ul");
  history.className = "dose-history";
  for (const dose of entries) {
    const status = doseStates[dose.status];
    history.append(element("li", `${dashboard.formatDay(dose.day)}، ${persianDigits(timeText(dose.minute))} · ${status}`));
  }
  const remove = action("حذف دارو", () => deleteMedicine(medicine.id, "medicine-details"));
  remove.className = "text-button danger-link";
  $("medicine-details-body").replaceChildren(medicationBanner(medicine.icon, medicine.color), summary, edit, remove, heading,
    entries.length ? history : element("p", "هنوز مصرفی ثبت نشده است."));
  $("medicine-details").showModal();
}

function renderDose(medicine, dose, featured = false) {
  const card = element("article");
  card.className = featured ? "medicine dose-card studio-hero" : "medicine dose-card";
  const unit = dose.unit ?? medicine?.unit ?? "";
  card.dataset.color = medicine?.color ?? dose.color ?? "gold";
  const heading = element("h3", dose.name || medicine?.name || "دارو");
  heading.dir = "auto";
  const instructions = dose.instructions ?? medicine?.instructions;
  const planned = dose.planned === null ? "" : `${amountText(dose.planned)} ${unit}`;
  let recorded = doseStates[dose.status] ?? "در انتظار ثبت";
  if (dose.status === "taken" && dose.actual !== null) recorded += `، ${amountText(dose.actual)} ${unit}`;
  const badge = element("p", recorded);
  badge.className = "badge";
  badge.dataset.status = dose.status ?? "pending";
  const info = element("div");
  if (featured) {
    const due = dose.snoozeUntil || doseTime(dose.day, dose.minute);
    const eyebrow = element("p", dose.status === "snoozed" ? "نوبت به‌تعویق‌افتاده" : due >= Date.now() ? "نوبت بعدی" : "نوبت ثبت‌نشده");
    eyebrow.className = "hero-kicker";
    const time = dose.snoozeUntil ? new Intl.DateTimeFormat("fa-IR", { timeStyle: "short" }).format(due) : persianDigits(timeText(dose.minute));
    info.append(eyebrow, element("p", time), heading);
    card.append(medicationBanner(medicine?.icon ?? dose.icon, medicine?.color ?? dose.color));
  } else info.append(heading, element("p", `ساعت ${persianDigits(timeText(dose.minute))}`));
  const header = element("div");
  header.className = "dose-header";
  if (!featured) header.append(medicationBadge(medicine?.icon ?? dose.icon, medicine?.color ?? dose.color));
  header.append(info);
  card.append(header);
  const result = element("div");
  result.className = "dose-result";
  result.append(badge);
  if (planned) result.append(element("p", planned));
  if (instructions) result.append(element("p", instructions));
  card.append(result);
  if (dose.day > today() || !medicine || medicine.paused) return card;
  const canSnooze = slotsFor(medicine, dose.day).some(slot => slot.minuteOfDay === dose.minute);
  const label = element("label", "مقدار مصرف واقعی");
  const amount = element("input");
  amount.dir = "ltr";
  amount.inputMode = "decimal";
  amount.maxLength = 11;
  if (dose.actual != null) amount.value = amountText(dose.actual);
  if (dose.planned != null) amount.placeholder = amountText(dose.planned);
  label.append(amount);
  const actual = element("details");
  const more = element("summary", "⋮");
  more.setAttribute("aria-label", "گزینه‌های نوبت");
  actual.className = "dose-options";
  actual.append(more, label);
  card.append(actual);

  async function record(status) {
    try {
      const entered = status === "taken" ? quantity(amount, true) : null;
      if (entered === 0) throw new Error("مقدار مصرف باید بیشتر از صفر باشد.");
      await mutate(state => {
        const saved = state.medicines[medicine.id];
        if (!saved || saved.paused) throw new Error("برنامهٔ این دارو متوقف شده است.");
        const id = doseId(saved, dose.day, dose.minute);
        const existing = state.doses[id];
        const active = slotsFor(saved, dose.day).find(slot => slot.minuteOfDay === dose.minute);
        if ((!existing || status === "snoozed") && !active) throw new Error("برنامهٔ این نوبت تغییر کرده است. صفحه را تازه کنید.");
        const planned = existing ? existing.planned : active.milliUnits;
        const actual = status === "taken" ? entered ?? existing?.actual ?? planned : null;
        const scheduled = doseTime(dose.day, dose.minute);
        const tracked = saved.stock !== null && (existing?.unit ?? saved.unit) === saved.unit && scheduled >= (saved.stockTrackedFrom ?? 0);
        if (tracked && status === "taken" && actual === null) {
          throw new Error("برای کم‌کردن از موجودی، مقدار مصرف را وارد کنید.");
        }
        const debit = tracked ? actual ?? 0 : 0;
        if (saved.stock !== null) saved.stock = engine.updateStock(saved.stock, existing?.debit ?? 0, debit, 0);
        const snoozeUntil = status === "snoozed" ? Math.max(Date.now(), scheduled, existing?.snoozeUntil ?? 0) +
          (state.medicationSnoozeMinutes ?? 10) * minuteMs : 0;
        state.doses[id] = { ...existing, medicineId: saved.id, day: dose.day, minute: dose.minute, planned, status, actual, debit, snoozeUntil };
      }, status === "snoozed" ? "نوبت به تعویق افتاد." : "وضعیت نوبت ثبت شد.", true);
    } catch (error) {
      $("status").textContent = error.message;
    }
  }

  const controls = element("div");
  controls.className = "buttons";
  const pending = !dose.status || dose.status === "snoozed";
  const taken = action(dose.status === "taken" ? "اصلاح ثبت مصرف" : "مصرف کردم", () => record("taken"), !pending);
  const snooze = () => action(`${persianDigits(care.medicationSnoozeMinutes ?? 10)} دقیقه بعد`, () => record("snoozed"), true);
  const skipped = action("مصرف نکردم", () => record("skipped"), true);
  controls.append(...(pending ? [skipped] : [taken, skipped]));
  if (!pending && canSnooze) controls.append(snooze());
  if (dose.status) controls.append(action("برگشت ثبت", () => record(null), true));
  actual.append(controls);
  if (pending) {
    const quick = element("div");
    quick.className = "action-pair dose-quick";
    quick.append(taken);
    if (canSnooze) quick.append(snooze());
    card.append(quick);
  }
  if (dose.status === "snoozed") card.append(element("p", `یادآوری بعدی ${new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium", timeStyle: "short"
  }).format(dose.snoozeUntil)}`));
  return card;
}

function scheduledDoses(state, day) {
  const doses = new Map();
  for (const medicine of Object.values(state.medicines)) {
    if (medicine.paused) continue;
    for (const slot of slotsFor(medicine, day)) {
      const scheduled = doseTime(day, slot.minuteOfDay);
      if (scheduled < (medicine.effectiveFrom ?? 0)) continue;
      doses.set(doseId(medicine, day, slot.minuteOfDay), { medicineId: medicine.id, day, minute: slot.minuteOfDay, planned: slot.milliUnits });
    }
  }
  for (const [id, dose] of Object.entries(state.doses)) {
    if (dose.day === day && (dose.imported || dose.status || doses.has(id) || !state.medicines[dose.medicineId])) doses.set(id, dose);
  }
  return [...doses.values()].sort((a, b) => a.minute - b.minute);
}

function render() {
  if (!$("day").value) return;
  const day = dayNumber($("day").value);
  dashboard.renderWellness(care, day);
  const medicines = Object.values(care.medicines);
  const noPlans = element("p", "برنامهٔ دارویی ثبت نشده است.");
  noPlans.className = "empty";
  $("plans").replaceChildren(...(medicines.length ? medicines.map(renderMedicine) : [noPlans]));
  const daily = scheduledDoses(care, day);
  const doseCard = dose => renderDose(care.medicines[dose.medicineId], dose);
  const consumed = daily.filter(dose => dose.status === "taken").length;
  const percent = daily.length ? Math.round(consumed * 100 / daily.length) : 0;
  $("med-day-summary").hidden = daily.length === 0;
  $("med-day-count").textContent = `${persianDigits(consumed)} از ${persianDigits(daily.length)} نوبت`;
  $("med-day-ring").style.setProperty("--percent", percent);
  $("med-day-ring").firstElementChild.textContent = `${persianDigits(percent)}٪`;
  const noDoses = element("p", "برای این روز نوبت مصرف دارو ثبت نشده است.");
  noDoses.className = "empty";
  $("med-day-doses").replaceChildren(...(daily.length ? daily.map(doseCard) : [noDoses]));
  const now = Date.now();
  const pending = day === today() ? daily.filter(dose => {
    const medicine = care.medicines[dose.medicineId];
    return medicine && !medicine.paused && (!dose.status || dose.status === "snoozed");
  }).map(dose => ({ dose, time: dose.snoozeUntil || doseTime(dose.day, dose.minute) })).sort((a, b) => a.time - b.time) : [];
  const focused = (pending.find(item => item.time >= now) ?? pending.at(-1))?.dose;
  const focus = $("today-focus");
  focus.replaceChildren();
  if (focused) focus.append(renderDose(care.medicines[focused.medicineId], focused, true));
  else if (day === today()) {
    const hero = element("div");
    hero.className = "studio-hero studio-rest";
    const copy = element("div");
    copy.append(element("p", "برنامهٔ امروز"), element("h2", daily.length ? "همهٔ نوبت‌ها بررسی شدند" : "روزتان را بچینید"),
      element("p", daily.length ? `${persianDigits(consumed)} نوبت مصرف‌شده` : "با افزودن اولین دارو، زمان مصرف را اینجا ببینید."));
    const add = action("افزودن دارو", () => openEditor());
    hero.append(medicationBanner("capsule", "green"), copy, add);
    focus.append(hero);
  }
  focus.hidden = day !== today() || document.querySelector('[data-screen="today"]').hidden;
  const events = daily.filter(dose => dose !== focused).map(dose => ({ minute: dose.minute, card: doseCard(dose) }));
  events.push(...dashboard.dayVisits(care, day));
  events.sort((a, b) => a.minute - b.minute);
  const empty = element("p", focused ? "نوبت دیگری برای امروز ثبت نشده است." : "برای این روز دارو یا قراری ثبت نشده است.");
  empty.className = "empty";
  $("doses").replaceChildren(...(events.length ? events.map(({ card }) => card) : [empty]));
}

async function reload() {
  if (busy) return;
  try {
    care = await accessCare();
    render();
  } catch {
    $("status").textContent = "خواندن سوابق محلی انجام نشد.";
  }
}

$("day").addEventListener("change", render);
for (const control of document.querySelectorAll("[data-open-medication]")) control.addEventListener("click", () => openEditor());
for (const control of document.querySelectorAll("[data-close]")) control.addEventListener("click", () => $(control.dataset.close).close());
$("add-phase").addEventListener("click", () => {
  addPhase();
  pickers.refresh($("editor"));
});
$("advanced-plan").addEventListener("toggle", updateEditorMode);
$("phased-mode").addEventListener("change", () => {
  $("advanced-plan").open = $("phased-mode").checked;
  updateEditorMode();
});
$("basic-time").addEventListener("input", () => { $("phases").querySelector(".time").value = $("basic-time").value; });
$("basic-dose").addEventListener("input", () => { $("phases").querySelector(".amount").value = $("basic-dose").value; });
window.addEventListener("focus", () => {
  if (!engine || !care) return;
  void reload();
  void syncReminders(true);
});
const selectedDay = () => $("day").value ? dayNumber($("day").value) : today();
const dashboard = wellness({
  getState: () => care, selectedDay, today, render, mutate, requestDeletion, scheduledDoses, renderDose,
  refreshFields: container => pickers.refresh(container)
});
const pickers = installPickers({ selectedDay, today, dashboard });
const updateAppearance = installAppearance();
installAccount();

const backupForm = $("android-restore");
const backupInput = $("android-backup-file");
const emptyBackupFilename = $("android-backup-filename").textContent;

function backupFeedback(message, state) {
  const status = $("android-restore-status");
  status.dataset.state = state;
  status.textContent = message;
  if (message) status.scrollIntoView({ block: "nearest" });
}

backupForm.addEventListener("reset", () => {
  $("android-backup-filename").textContent = emptyBackupFilename;
  backupFeedback("", "");
});
backupInput.addEventListener("change", () => {
  const file = backupInput.files[0];
  $("android-backup-filename").textContent = file?.name ?? emptyBackupFilename;
  backupFeedback("", "");
});

backupForm.addEventListener("submit", async event => {
  event.preventDefault();
  const file = backupInput.files[0];
  const field = $("android-backup-password");
  const submit = $("android-restore-submit");
  if (submit.disabled) return;
  if (!file || file.size > maxBackupBytes) {
    backupFeedback("یک فایل پشتیبان با حجم حداکثر ۱۶ مگابایت انتخاب کنید.", "error");
    return;
  }
  const password = field.value;
  field.value = "";
  const isCurrent = () => $("settings-dialog").open && $("settings-dialog").dataset.panel === "backup-settings" &&
    backupInput.files[0] === file;
  submit.disabled = true;
  backupFeedback("در حال بررسی فایل…", "busy");
  try {
    const backup = await readAndroidBackup(new Uint8Array(await file.arrayBuffer()), password,
      phases => engine.validMedicationPhases(rules(phases)), localZone());
    if (!isCurrent()) return;
    if (!$("android-backup-confirm").checked) {
      backupFeedback("", "");
      return;
    }
    const success = await mutate(state => {
      changeReminderRevision(state);
      if (state.reminders) state.reminders.enabled = false;
      Object.assign(state, backup);
    }, "سوابق اندروید بازیابی شد.", true);
    if (!isCurrent()) return;
    if (success) {
      backupForm.reset();
      backupFeedback("سوابق بازیابی شدند. اعلان‌ها را در تنظیمات دوباره فعال کنید.", "success");
    } else {
      backupFeedback("ذخیرهٔ سوابق انجام نشد. دوباره تلاش کنید.", "error");
    }
  } catch {
    if (isCurrent()) backupFeedback("فایل یا رمز معتبر نیست، یا این نسخه از فایل پشتیبانی نمی‌شود.", "error");
  } finally {
    submit.disabled = false;
  }
});

function showIntro() {
  const hasRecords = Object.keys(care.medicines).length || Object.keys(care.doses).length ||
    care.water?.length || Object.keys(care.visits ?? {}).length || care.reminders ||
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
  engine = await import("/care-engine/care-core.mjs");
  const params = new URLSearchParams(location.search);
  const day = params.get("day");
  $("day").value = /^\d{4}-\d{2}-\d{2}$/.test(day ?? "") ? day : isoDay(today());
  if (!$("day").value) $("day").value = isoDay(today());
  care = await accessCare();
  render();
  $("app").hidden = false;
  $("boot-status").hidden = true;
  showIntro();
  const view = params.get("view");
  if (!$("app").hidden && ["water", "appointments"].includes(view)) dashboard.show(view);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/medication/sw.js").catch(() => {});
  void initializeReminders();
} catch {
  $("boot-status").textContent = "موتور برنامهٔ دارو یا فضای ذخیرهٔ محلی در دسترس نیست.";
}
