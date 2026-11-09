import { accessCare } from "./storage.js";
import { changeReminderRevision, initializeReminders, syncReminders } from "./reminders.js";
import { wellness } from "./wellness.js";

const $ = id => document.getElementById(id);
const dayLength = 86_400_000;
const weekdays = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
const weekdayBits = [5, 6, 0, 1, 2, 3, 4];
let engine;
let care;
let editing;
let editingRevision;
let busy = false;
const medicineIcons = { pill: "pill", capsule: "capsule", drops: "water", syrup: "syrup", injection: "injection" };

function dayNumber(iso) {
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(ms) || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error("تاریخ را کامل وارد کنید.");
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
  fieldset.querySelector(".add-slot").addEventListener("click", () => addSlot(slots));
  fieldset.querySelector(".remove-phase").addEventListener("click", () => {
    if ($("phases").children.length > 1) fieldset.remove();
  });
  $("phases").append(fieldset);
}

function openEditor(medicine) {
  editing = medicine?.id;
  editingRevision = medicine?.revision;
  $("editor-title").textContent = medicine ? "ویرایش دارو" : "داروی جدید";
  $("name").value = medicine?.name ?? "";
  $("instructions").value = medicine?.instructions ?? "";
  $("medicine-icon").value = medicine?.icon ?? "pill";
  $("medicine-color").value = medicine?.color ?? "gold";
  $("medicine-appearance").open = false;
  $("unit").value = medicine?.unit ?? "قرص";
  $("unit").readOnly = Boolean(medicine);
  $("stock").value = medicine?.stock == null ? "" : amountText(medicine.stock);
  $("stock").readOnly = medicine?.stock != null;
  $("threshold").value = amountText(medicine?.threshold ?? 2000);
  $("editor-status").textContent = "";
  $("phases").replaceChildren();
  if (medicine) medicine.phases.forEach(addPhase);
  else addPhase();
  $("basic-time").value = $("phases").querySelector(".time").value;
  $("basic-start").textContent = `شروع از ${dashboard.formatDay(medicine?.phases[0].start ?? today())}`;
  $("advanced-plan").open = Boolean(medicine && !simpleSchedule());
  $("inventory-options").open = false;
  updateEditorMode();
  $("medication-dialog").showModal();
}

function simpleSchedule() {
  const phases = $("phases");
  const first = phases.firstElementChild;
  return phases.children.length === 1 && !first.querySelector(".end").value &&
    first.querySelector(".interval").value === "1" && first.querySelectorAll(".weekdays input:checked").length === 7 &&
    first.querySelectorAll(".time").length === 1 && !first.querySelector(".amount").value.trim();
}

function updateEditorMode() {
  if (!$("phases").children.length) return;
  const simple = !$("advanced-plan").open && simpleSchedule();
  $("basic-schedule").hidden = !simple;
  $("basic-time").disabled = !simple;
  if (simple) $("basic-time").value = $("phases").querySelector(".time").value;
}

function editorPhases() {
  return Array.from($("phases").children, fieldset => {
    const field = name => fieldset.querySelector(name);
    const slots = Array.from(field(".slots").children, row => {
      const [hour, minute] = row.querySelector(".time").value.split(":").map(Number);
      const amount = quantity(row.querySelector(".amount"), true);
      if (amount === 0) throw new Error("مقدار نوبت باید بیشتر از صفر باشد.");
      return { minute: hour * 60 + minute, amount };
    }).sort((a, b) => a.minute - b.minute);
    return {
      start: dayNumber(field(".start").value),
      end: field(".end").value ? dayNumber(field(".end").value) + 1 : null,
      interval: Number(field(".interval").value),
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

$("editor").addEventListener("submit", async event => {
  event.preventDefault();
  if (busy) return;
  const id = editing ?? crypto.randomUUID();
  try {
    $("editor-status").textContent = "";
    if (!Array.from($("phases").querySelectorAll("input")).every(field => field.validity.valid)) {
      $("advanced-plan").open = true;
      throw new Error("تاریخ شروع، فاصلهٔ تکرار و ساعت هر مرحله را بررسی کنید.");
    }
    const phases = editorPhases();
    if (!engine.validMedicationPhases(rules(phases))) {
      throw new Error("ترتیب تاریخ‌ها، هم‌پوشانی مرحله‌ها، روزهای هفته و ساعت‌های تکراری را بررسی کنید.");
    }
    const name = $("name").value.trim();
    const unit = $("unit").value.trim();
    if (!name || !unit) throw new Error("نام دارو و واحد مصرف را وارد کنید.");
    const stock = $("stock").readOnly ? null : quantity($("stock"), true);
    const threshold = quantity($("threshold"));
    if ((stock !== null || $("stock").readOnly) && phases.some(phase => phase.slots.some(slot => slot.amount === null))) {
      throw new Error("برای پیگیری موجودی، مقدار همهٔ نوبت‌ها را مشخص کنید.");
    }
    if (await mutate(state => {
      const saved = state.medicines[id];
      if (editing && (!saved || saved.revision !== editingRevision)) {
        throw new Error("این برنامه در پنجرهٔ دیگری تغییر کرده است. دوباره آن را باز کنید.");
      }
      state.medicines[id] = {
        ...saved,
        id, name, unit: saved?.unit ?? unit, phases, stock: saved?.stock ?? stock, threshold,
        instructions: $("instructions").value.trim(), icon: $("medicine-icon").value, color: $("medicine-color").value,
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

function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const use = document.createElementNS(svg.namespaceURI, "use");
  use.setAttribute("href", `#i-${name}`);
  svg.setAttribute("aria-hidden", "true");
  svg.append(use);
  return svg;
}

const doseId = (med, day, minute) => `${med.id}|${day}|${minute}`;
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
  const info = element("div");
  info.append(heading, element("p", `${persianDigits(medicine.phases.length)} مرحلهٔ مصرف`));
  const controls = element("div");
  controls.className = "buttons";
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
  controls.append(toggle, action("ویرایش", () => openEditor(medicine), true));
  const top = element("div");
  top.className = "feature-head";
  top.append(icon(medicineIcons[medicine.icon] ?? "pill"), info, controls);
  card.append(top);
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
    card.append(purchase);
  }
  return card;
}

function openMedicine(medicine) {
  $("medicine-details-title").textContent = medicine.name;
  const entries = Object.values(care.doses).filter(dose => dose.medicineId === medicine.id && dose.status)
    .sort((a, b) => b.day - a.day || b.minute - a.minute);
  const summary = element("p", medicine.instructions || "دستور مصرف ثبت نشده است.");
  const edit = action("ویرایش دارو", () => { $("medicine-details").close(); openEditor(medicine); });
  const heading = element("h3", "سابقهٔ مصرف");
  const history = element("ul");
  history.className = "dose-history";
  for (const dose of entries) {
    const status = dose.status === "taken" ? "مصرف شد" : "مصرف نشد";
    history.append(element("li", `${dashboard.formatDay(dose.day)}، ${persianDigits(timeText(dose.minute))} · ${status}`));
  }
  $("medicine-details-body").replaceChildren(summary, edit, heading, entries.length ? history : element("p", "هنوز مصرفی ثبت نشده است."));
  $("medicine-details").showModal();
}

function renderDose(medicine, dose) {
  const card = element("article");
  card.className = "medicine dose-card";
  card.dataset.color = medicine.color ?? "gold";
  const heading = element("h3", medicine.name);
  heading.dir = "auto";
  const planned = dose.planned === null ? medicine.instructions : `${amountText(dose.planned)} ${medicine.unit}`;
  const states = { taken: "مصرف شد", skipped: "مصرف نشد" };
  let recorded = states[dose.status] ?? "در انتظار ثبت";
  if (dose.status === "taken" && dose.actual !== null) recorded += `، ${amountText(dose.actual)} ${medicine.unit}`;
  const badge = element("p", recorded);
  badge.className = "badge";
  badge.dataset.status = dose.status ?? "pending";
  const info = element("div");
  info.append(heading, element("p", `ساعت ${persianDigits(timeText(dose.minute))}`));
  const header = element("div");
  header.className = "dose-header";
  header.append(icon(medicineIcons[medicine.icon] ?? "pill"), info);
  card.append(header);
  const result = element("div");
  result.className = "dose-result";
  result.append(badge);
  if (planned) result.append(element("p", planned));
  card.append(result);
  if (dose.day > today() || medicine.paused) return card;
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
        if (saved.paused) throw new Error("برنامهٔ این دارو متوقف شده است.");
        const id = doseId(saved, dose.day, dose.minute);
        const existing = state.doses[id];
        const active = engine.medicationSlots(rules(saved.phases), dose.day).find(slot => slot.minuteOfDay === dose.minute);
        if (!existing && !active) throw new Error("برنامهٔ این نوبت تغییر کرده است. صفحه را تازه کنید.");
        const planned = existing ? existing.planned : active.milliUnits;
        const actual = status === "taken" ? entered ?? planned : null;
        if (saved.stock !== null && status === "taken" && actual === null) {
          throw new Error("برای کم‌کردن از موجودی، مقدار مصرف را وارد کنید.");
        }
        const debit = saved.stock === null ? 0 : actual ?? 0;
        if (saved.stock !== null) saved.stock = engine.updateStock(saved.stock, existing?.debit ?? 0, debit, 0);
        state.doses[id] = { medicineId: saved.id, day: dose.day, minute: dose.minute, planned, status, actual, debit };
      }, "وضعیت نوبت ثبت شد.", true);
    } catch (error) {
      $("status").textContent = error.message;
    }
  }

  const controls = element("div");
  controls.className = "buttons";
  const taken = action(dose.status === "taken" ? "اصلاح ثبت مصرف" : "مصرف کردم", () => record("taken"), Boolean(dose.status));
  const skipped = action("مصرف نکردم", () => record("skipped"), true);
  controls.append(...(dose.status ? [taken, skipped] : [skipped]));
  if (dose.status) controls.append(action("برگشت ثبت", () => record(null), true));
  actual.append(controls);
  if (!dose.status) card.append(taken);
  return card;
}

function render() {
  const medicines = Object.values(care.medicines);
  $("plans").replaceChildren(...(medicines.length ? medicines.map(renderMedicine) : [element("p", "هنوز دارویی اضافه نشده است.")]));
  if (!$("day").value) return;
  const day = dayNumber($("day").value);
  dashboard.renderWellness(care, day);
  const doses = new Map();
  for (const medicine of medicines) {
    if (medicine.paused) continue;
    for (const slot of engine.medicationSlots(rules(medicine.phases), day)) {
      doses.set(doseId(medicine, day, slot.minuteOfDay), { medicineId: medicine.id, day, minute: slot.minuteOfDay, planned: slot.milliUnits });
    }
  }
  for (const [id, dose] of Object.entries(care.doses)) {
    if (dose.day === day && (dose.status || doses.has(id))) doses.set(id, dose);
  }
  const daily = [...doses.values()].sort((a, b) => a.minute - b.minute);
  const doseCard = dose => renderDose(care.medicines[dose.medicineId], dose);
  const consumed = daily.filter(dose => dose.status === "taken").length;
  const percent = daily.length ? Math.round(consumed * 100 / daily.length) : 0;
  $("med-day-count").textContent = `${persianDigits(consumed)} از ${persianDigits(daily.length)} نوبت`;
  $("med-day-ring").style.setProperty("--percent", percent);
  $("med-day-ring").firstElementChild.textContent = `${persianDigits(percent)}٪`;
  $("med-day-doses").replaceChildren(...(daily.length ? daily.map(doseCard) : [element("p", "برای این روز نوبت دارویی ندارید.")]));
  const events = daily.map(dose => ({ minute: dose.minute, card: doseCard(dose) }));
  events.push(...dashboard.dayVisits(care, day));
  events.sort((a, b) => a.minute - b.minute);
  const empty = element("p", "برای این روز دارو یا قراری ثبت نشده است.");
  empty.className = "empty";
  $("doses").replaceChildren(...(events.length ? events.map(({ card }) => {
    const row = element("div");
    row.className = "timeline-event";
    if (card.classList.contains("visit")) row.classList.add("timeline-visit");
    row.append(card);
    return row;
  }) : [empty]));
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
$("add-phase").addEventListener("click", () => addPhase());
$("advanced-plan").addEventListener("toggle", updateEditorMode);
$("basic-time").addEventListener("input", () => { $("phases").querySelector(".time").value = $("basic-time").value; });
window.addEventListener("focus", () => { void reload(); void syncReminders(true); });
const dashboard = wellness({ getState: () => care, selectedDay: () => $("day").value ? dayNumber($("day").value) : today(), today, render, mutate });

try {
  engine = await import("/care-engine/care-core.mjs");
  const day = new URLSearchParams(location.search).get("day");
  $("day").value = /^\d{4}-\d{2}-\d{2}$/.test(day ?? "") ? day : isoDay(today());
  if (!$("day").value) $("day").value = isoDay(today());
  care = await accessCare();
  render();
  $("app").hidden = false;
  $("boot-status").hidden = true;
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/medication/sw.js").catch(() => {});
  void initializeReminders();
} catch {
  $("boot-status").textContent = "موتور برنامهٔ دارو یا فضای ذخیرهٔ محلی در دسترس نیست.";
}
