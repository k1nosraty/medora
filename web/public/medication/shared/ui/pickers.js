import { renderMonthGrid } from "./month-grid.js";
import { listSeparator, localDigits, t } from "../i18n/locale.js";
const $ = id => document.getElementById(id);
const dayMs = 86_400_000;
const dayNumber = iso => Date.parse(`${iso}T00:00:00Z`) / dayMs;
const isoDay = day => new Date(day * dayMs).toISOString().slice(0, 10);
const twoDigits = value => String(value).padStart(2, "0");

export function installPickers({ today, selectedDay, dashboard }) {
  const fields = new WeakMap();
  const dateSheet = $("date-picker");
  const timeSheet = $("time-picker");
  const timeInputs = [$("keyboard-hour"), $("keyboard-minute")];
  let shownMonth;
  let pickedDay;
  let focusedDay;
  let dateLimit;
  let onPickDate;
  let timeField;
  const birthJump = $("picker-birth-jump");
  const birthYear = $("picker-birth-year");
  const birthMonth = $("picker-birth-month");

  function setBirthMonths() {
    const year = dashboard.yearStart(shownMonth);
    birthYear.value = year;
    const months = [];
    for (let month = year; months.length < 12 && month <= dateLimit; month = dashboard.monthStart(month + 32)) {
      months.push(new Option(dashboard.formatShortMonth(month), month));
    }
    birthMonth.replaceChildren(...months);
    birthMonth.value = shownMonth;
  }

  for (const control of [birthYear, birthMonth]) control.addEventListener("change", () => {
    shownMonth = Number(control.value);
    drawDate();
  });

  function drawDate() {
    $("picker-month").textContent = dashboard.formatMonth(shownMonth);
    const currentDay = today();
    $("picker-today").hidden = currentDay > dateLimit ||
      (pickedDay === currentDay && shownMonth === dashboard.monthStart(currentDay));
    if (!birthJump.hidden) setBirthMonths();
    const end = dashboard.monthStart(shownMonth + 32);
    const grid = $("picker-days");
    renderMonthGrid(grid, {
      start: shownMonth, end: end - 1, selected: pickedDay, active: focusedDay, today: today(), last: dateLimit, minCells: 42,
      formatDay: dashboard.formatDay, formatNumber: dashboard.formatDayNumber,
      onSelect(day) {
        pickedDay = focusedDay = day;
        drawDate();
      },
      onMove(day) {
        focusedDay = day;
        shownMonth = dashboard.monthStart(day);
        drawDate();
        grid.querySelector('button[tabindex="0"]')?.focus({ preventScroll: true });
      }
    });
    $("picker-date-confirm").disabled = pickedDay > dateLimit || (!birthJump.hidden && dashboard.monthStart(pickedDay) !== shownMonth);
    $("picker-next-month").disabled = !birthJump.hidden && end > dateLimit;
  }

  function openDate(day, max, select, optional = false, birthday = false) {
    pickedDay = focusedDay = day;
    shownMonth = dashboard.monthStart(day);
    dateLimit = max;
    onPickDate = select;
    birthJump.hidden = !birthday;
    if (birthday) {
      const years = [];
      for (let start = dashboard.yearStart(max); years.length <= 131; start = dashboard.yearStart(start - 1)) {
        years.push(new Option(dashboard.formatYear(start), start));
      }
      birthYear.replaceChildren(...years);
    }
    $("picker-clear-date").hidden = !optional;
    drawDate();
    dateSheet.showModal();
    $("picker-days").querySelector('button[tabindex="0"]')?.focus({ preventScroll: true });
  }

  $("picker-previous-month").addEventListener("click", () => {
    shownMonth = dashboard.monthStart(shownMonth - 1);
    drawDate();
  });
  $("picker-next-month").addEventListener("click", () => {
    shownMonth = dashboard.monthStart(shownMonth + 32);
    drawDate();
  });
  $("picker-today").addEventListener("click", () => {
    pickedDay = focusedDay = Math.min(today(), dateLimit);
    shownMonth = dashboard.monthStart(pickedDay);
    drawDate();
    $("picker-days").querySelector('button[tabindex="0"]')?.focus({ preventScroll: true });
  });
  $("picker-date-confirm").addEventListener("click", () => {
    dateSheet.close();
    onPickDate(pickedDay);
  });
  $("picker-clear-date").addEventListener("click", () => {
    dateSheet.close();
    onPickDate(null);
  });
  $("pick-day").addEventListener("click", () => openDate(selectedDay(), dashboard.dateLimit(), dashboard.chooseDay));

  function openTime(field) {
    timeField = field;
    const parts = localDigits(field.value || "08:00").split(":");
    timeInputs.forEach((input, index) => {
      input.value = parts[index];
      input.removeAttribute("aria-invalid");
    });
    $("time-error").textContent = "";
    timeSheet.showModal();
    timeInputs[0].select();
  }

  $("time-form").addEventListener("submit", event => {
    event.preventDefault();
    const parts = timeInputs.map(input => {
      const text = input.value.trim().replace(/[۰-۹٠-٩]/g, char => String(char.charCodeAt(0) & 15));
      return /^\d{1,2}$/.test(text) ? Number(text) : NaN;
    });
    const invalid = parts.map((value, index) => !(value >= 0 && value < (index === 0 ? 24 : 60)));
    timeInputs.forEach((input, index) => input.setAttribute("aria-invalid", String(invalid[index])));
    const firstError = invalid.indexOf(true);
    if (firstError !== -1) {
      $("time-error").textContent = t("ui.check-the-hour-and-minute");
      timeInputs[firstError].focus();
      timeInputs[firstError].select();
      return;
    }
    timeSheet.close();
    setValue(timeField, parts.map(twoDigits).join(":"));
  });

  function setValue(field, value) {
    field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    refresh(field.closest("dialog"));
  }

  function refresh(container) {
    for (const field of container.querySelectorAll('input[type="date"], input[type="time"]')) {
      let control = fields.get(field);
      const label = field.closest("label");
      if (!label) continue;
      if (!control) {
        control = document.createElement("button");
        control.type = "button";
        control.className = "secondary picker-field";
        control.dataset.for = field.id || field.classList[0];
        control.addEventListener("click", () => {
          if (field.type === "time") {
            openTime(field);
          } else {
            const max = Number.isInteger(dayNumber(field.max)) ? dayNumber(field.max) : Infinity;
            openDate(Number.isInteger(dayNumber(field.value)) ? dayNumber(field.value) : today(), max,
              day => setValue(field, day === null ? "" : isoDay(day)), !field.required, field.id === "profile-birth-date");
          }
        });
        field.hidden = true;
        const wrapper = document.createElement("div");
        wrapper.className = label.classList.contains("phase-only") ? "picker-control phase-only" : "picker-control";
        label.replaceWith(wrapper);
        wrapper.append(label, control);
        fields.set(field, control);
      }
      const formatted = field.value && (field.type === "date" ? dashboard.formatDay(dayNumber(field.value)) :
        localDigits(field.value.slice(0, 5)));
      const caption = label.textContent.trim();
      control.textContent = formatted || t(field.type === "date" ? "انتخاب تاریخ" : "انتخاب ساعت");
      control.setAttribute("aria-label", caption + listSeparator + control.textContent);
    }
  }

  return { refresh, chooseDate: (day, select) => openDate(day, Infinity, select) };
}
