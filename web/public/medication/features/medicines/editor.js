import { listSeparator, localDigits, t } from "../../shared/i18n/locale.js";
import { $, action, element } from "../../shared/ui/dom.js";
import { dayNumber, today } from "../../shared/ui/dates.js";
import { clockMinute } from "../../domain/care-plan.js";
import { compilePhases, isoDay, timeText, trackSchedule } from "../../domain/care-index.js";
import * as engine from "../../domain/medication-rules.js";
import { defaultMedicineIcon, installAppearance, medicineColorOf } from "./appearance.js";
import { amountText, doseUnit, quantity } from "./quantity.js";
import { nextPlannedDose } from "./next-dose.js";

const weekdays = [t("ui.saturday"), t("ui.sunday"), t("ui.monday"), t("ui.tuesday"), t("ui.wednesday"), t("ui.thursday"), t("ui.friday")];
const weekdayBits = [5, 6, 0, 1, 2, 3, 4];
const editorChapters = [t("ui.name-form-and-color"), t("ui.simple-or-multi-stage-schedule"), t("ui.review-save")];

export function installMedicineEditor({ getState, isBusy, mutate, removeMedicine, pickers, formatDay }) {
  let editing;
  let delegation;
  let editingRevision;
  let editorStep = 0;
  let editorDates = [];
  let restoreExactMode = false;

  function updateSlotLabels(container) {
    Array.from(container.children).forEach((row, index, rows) => {
      row.querySelector(".slot-heading strong").textContent = t("ui.dose-value", localDigits(index + 1));
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
      field.querySelector("legend").textContent = t("ui.stage-value", localDigits(index + 1));
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

  function openEditor(medicine, target) {
    delegation = target;
    $("medication-dialog").toggleAttribute("data-family-editor", Boolean(target));
    editing = medicine?.id;
    editingRevision = medicine?.revision;
    $("delete-edited-medication").hidden = !medicine;
    $("editor-title").textContent = target ? t("ui.add-for-value", target.name) : medicine ? t("ui.edit-medicine") : t("ui.new-medicine");
    $("name").value = medicine?.name ?? "";
    $("instructions").value = medicine?.instructions ?? "";
    $("medicine-icon").value = medicine?.icon ?? defaultMedicineIcon;
    $("medicine-color").value = medicineColorOf(medicine?.color);
    updateAppearance();
    $("unit").value = medicine?.unit ?? t("ui.tablet");
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
    if (target) first.querySelector(".start").value = isoDay(target.day);
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
    $("editor-identity").focus({ preventScroll: true });
  }

  function showEditorStep(step, focus = true) {
    editorStep = step;
    $("editor").dataset.step = String(step);
    for (const panel of document.querySelectorAll("[data-editor-step]")) panel.hidden = Number(panel.dataset.editorStep) !== step;
    Array.from($("editor-steps").children).forEach((label, index) => {
      label.dataset.complete = String(index < step);
      if (index === step) label.setAttribute("aria-current", "step");
      else label.removeAttribute("aria-current");
    });
    $("editor-back").hidden = step === 0;
    $("editor-next").textContent = step === 2 ? delegation ? t("ui.save-for-value", delegation.name) : t("ui.save-medicine") : t("ui.continue");
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
      const range = phase.end === null ? t("ui.from-value", formatDay(phase.start)) :
        t("ui.value-to-value", formatDay(phase.start), formatDay(phase.end - 1));
      const days = weekdays.filter((_, index) => phase.mask & (1 << weekdayBits[index]));
      const repeat = dates.length ? dates.map(day => formatDay(day)).join(listSeparator) :
        phase.interval > 1 ? t("ui.every-value-weeks", localDigits(phase.interval)) :
          days.length === 7 ? t("ui.every-day") : t("ui.every-week");
      const row = element("li");
      if (phased) row.append(element("h5", t("ui.stage-value", localDigits(index + 1))));
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
    const notBefore = getState().medicines[editing]?.effectiveFrom ?? 0;
    const next = nextPlannedDose(phases, dates, notBefore);
    const upcoming = element("p", next ? t("ui.next-scheduled-dose-value-at-value", formatDay(next.day), localDigits(timeText(next.slot.minuteOfDay))) :
      t("ui.this-schedule-has-no-upcoming-doses"));
    upcoming.className = "review-upcoming";
    review.replaceChildren(title, upcoming, list);
    if (instructions) review.append(element("p", instructions));
    const thresholdUnit = doseUnit(unit, threshold);
    if ($("stock").readOnly) review.append(element("p", t("ui.low-stock-alert-at-value-value", amountText(threshold), thresholdUnit)));
    else if (stock !== null) review.append(element("p", t("ui.initial-stock-value-value-alert-at-value-value", amountText(stock), doseUnit(unit, stock), amountText(threshold), thresholdUnit)));
  }

  function renderExactDates(fieldset) {
    fieldset.querySelector(".exact-days").replaceChildren(...editorDates.map(day => {
      const remove = action(formatDay(day) + " ×", () => {
        editorDates = editorDates.filter(value => value !== day);
        renderExactDates(fieldset);
        fieldset.querySelector(".add-exact-day").focus();
      });
      remove.className = "secondary";
      remove.setAttribute("aria-label", t("ui.remove-date-value", formatDay(day)));
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
    warning.textContent = phased && restoreExactMode ? t("ui.selected-dates-apply-only-to-a-fixed-schedule") :
      !phased && phases.length > 1 ? t("ui.saving-as-a-fixed-schedule-keeps-only-the-first-stage") : "";
    warning.hidden = !warning.textContent;
    updatePhaseLabels();
    updateDoseUnits();
    pickers.refresh($("editor"));
  }

  function updateDoseUnits() {
    const unit = $("unit").value.trim();
    for (const link of $("phases").querySelectorAll(".dose-unit-link")) {
      link.textContent = unit ? t("ui.unit-value", doseUnit(unit, 1000)) : t("ui.choose-a-unit");
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
      invalidEditorField(active[0].querySelector(".add-exact-day"), t("ui.choose-at-least-one-date"));
    }
    const starts = active.map(fieldset => {
      if (exact) return editorDates[0];
      const field = fieldset.querySelector(".start");
      if (!field.value) invalidEditorField(field, t("ui.choose-a-start-date"));
      return dayNumber(field.value);
    });
    const phases = active.map((fieldset, index) => {
      const field = name => fieldset.querySelector(name);
      const weekly = field(".repeat").value === "weekly";
      const checkedDays = [...fieldset.querySelectorAll(".weekdays input:checked")];
      if (weekly && !checkedDays.length) invalidEditorField(field(".weekdays input"), t("ui.choose-at-least-one-day-of-the-week"));
      if (weekly && !field(".interval").validity.valid) invalidEditorField(field(".interval"), t("ui.the-interval-must-be-between-1-and-52-weeks"));
      const next = starts[index + 1] ?? null;
      const start = starts[index];
      const endValue = !exact ? field(".end").value : "";
      const end = endValue ? dayNumber(endValue) + 1 : next;
      if (next !== null && next <= start) invalidEditorField(active[index + 1].querySelector(".start"), t("ui.this-stage-must-start-after-the-previous-stage"));
      if (end !== null && end <= start) invalidEditorField(field(".end"), t("ui.the-end-date-must-be-on-or-after-the-start-date"));
      if (next !== null && end > next) invalidEditorField(field(".end"), t("ui.this-stage-overlaps-the-start-of-the-next-stage"));
      const seen = new Set();
      const slots = Array.from(field(".slots").children, row => {
        const time = row.querySelector(".time");
        const dose = row.querySelector(".amount");
        if (!time.value) invalidEditorField(time, t("ui.choose-a-time-for-this-dose"));
        const minute = clockMinute(time.value);
        if (seen.has(minute)) invalidEditorField(time, t("ui.another-dose-already-uses-this-time"));
        seen.add(minute);
        let amount;
        try { amount = quantity(dose, true); }
        catch (error) { invalidEditorField(dose, error.message); }
        if (amount === 0) invalidEditorField(dose, t("ui.enter-a-dose-greater-than-zero"));
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

  $("editor-back").addEventListener("click", () => showEditorStep(editorStep - 1));
  $("editor").addEventListener("submit", async event => {
    event.preventDefault();
    if (isBusy()) return;
    const id = editing ?? crypto.randomUUID();
    try {
      $("editor-status").textContent = "";
      clearEditorFieldError();
      const name = $("name").value.trim();
      if (editorStep === 0) {
        if (!name) {
          $("name").focus();
          throw new Error(t("ui.enter-the-medicine-name"));
        }
        showEditorStep(1);
        return;
      }
      const phased = $("phased-mode").checked;
      const { phases, dates } = editorPhases();
      if (!engine.validMedicationPhases(compilePhases(engine, phases))) {
        throw new Error(t("ui.check-the-date-order-overlapping-stages-selected-days-and"));
      }
      const unit = $("unit").value.trim();
      if (!name || (!unit && phases.some(phase => phase.slots.some(slot => slot.amount !== null)))) {
        invalidEditorField($("unit"), t("ui.enter-the-unit-for-the-dose-amount"));
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
        if (missing) invalidEditorField(missing, t("ui.set-an-amount-for-each-dose-to-track-stock"));
      }
      const instructions = $("instructions").value.trim();
      if (editorStep === 1) {
        reviewMedicine({ name, phases, dates, stock, unit, threshold, phased, instructions });
        showEditorStep(2);
        return;
      }
      const plan = { id, name, unit, phases, dates, stock, threshold, instructions, icon: $("medicine-icon").value,
        color: $("medicine-color").value, phased, revision: 1 };
      if (delegation) {
        const save = $("editor-next");
        save.disabled = true;
        try { await delegation.save(plan); }
        finally { save.disabled = false; }
        return;
      }
      if (await mutate(state => {
        const saved = state.medicines[id];
        if (editing && (!saved || saved.revision !== editingRevision)) {
          throw new Error(t("ui.this-schedule-changed-in-another-window-reopen-it-to-edit"));
        }
        state.medicines[id] = {
          ...saved,
          ...plan, unit: saved?.stock != null ? saved.unit : unit, stock: saved?.stock ?? stock,
          ...(saved && saved.stock == null && stock !== null ? { stockTrackedFrom: Date.now() } : {}),
          revision: (saved?.revision ?? 0) + 1
        };
        trackSchedule(state, "medicines", saved, state.medicines[id], Date.now());
      }, t("ui.medication-schedule-saved"), true)) {
        $("medication-dialog").close();
        editing = null;
      } else $("editor-status").textContent = $("status").textContent;
    } catch (error) {
      $("editor-status").textContent = error.message;
    }
  });

  $("delete-edited-medication").addEventListener("click", () => removeMedicine(editing, "medication-dialog"));

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
  const defaultUnit = shape => shape === "sachet" ? t("ui.sachet") : shape === "powder" ? "" : t("ui.tablet");
  const updateAppearance = installAppearance((previous, shape) => {
    if (editing || $("unit").value !== defaultUnit(previous)) return;
    $("unit").value = defaultUnit(shape);
    updateDoseUnits();
  });
  return openEditor;
}
