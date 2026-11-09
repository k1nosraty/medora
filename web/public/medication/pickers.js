const $ = id => document.getElementById(id);
const dayMs = 86_400_000;
const dayNumber = iso => Date.parse(`${iso}T00:00:00Z`) / dayMs;
const isoDay = day => new Date(day * dayMs).toISOString().slice(0, 10);
const weekdays = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
const digits = new Intl.NumberFormat("fa-IR", { minimumIntegerDigits: 2, useGrouping: false });
const twoDigits = value => String(value).padStart(2, "0");

export function installPickers({ today, selectedDay, dashboard }) {
  const fields = new WeakMap();
  const dateSheet = $("date-picker");
  const timeSheet = $("time-picker");
  let shownMonth;
  let pickedDay;
  let dateLimit;
  let onPickDate;
  let timeField;
  let hour;
  let minute;
  let clockUnit;
  let keyboard;

  function drawDate() {
    $("picker-month").textContent = dashboard.formatMonth(shownMonth);
    const leading = (new Date(shownMonth * dayMs).getUTCDay() + 1) % 7;
    const end = dashboard.monthStart(shownMonth + 32);
    const heading = weekdays.map(label => {
      const cell = document.createElement("span");
      cell.className = "quiet";
      cell.textContent = label;
      return cell;
    });
    const cells = Array.from({ length: 42 }, (_, index) => {
      const day = shownMonth + index - leading;
      if (day < shownMonth || day >= end) return document.createElement("span");
      const control = document.createElement("button");
      control.type = "button";
      control.textContent = dashboard.formatDayNumber(day);
      control.disabled = day > dateLimit;
      control.setAttribute("aria-label", dashboard.formatDay(day));
      control.setAttribute("aria-pressed", String(day === pickedDay));
      control.addEventListener("click", () => {
        pickedDay = day;
        $("picker-days").querySelector('[aria-pressed="true"]')?.setAttribute("aria-pressed", "false");
        control.setAttribute("aria-pressed", "true");
        $("picker-date-confirm").disabled = false;
      });
      return control;
    });
    $("picker-days").replaceChildren(...heading, ...cells);
    $("picker-date-confirm").disabled = pickedDay > dateLimit;
  }

  function openDate(day, max, select, optional = false) {
    pickedDay = day;
    shownMonth = dashboard.monthStart(day);
    dateLimit = max;
    onPickDate = select;
    $("picker-clear-date").hidden = !optional;
    drawDate();
    dateSheet.showModal();
    $("picker-days").querySelector('[aria-pressed="true"]:enabled')?.focus({ preventScroll: true });
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
    pickedDay = Math.min(today(), dateLimit);
    shownMonth = dashboard.monthStart(pickedDay);
    drawDate();
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

  function drawClock() {
    $("clock-hour").textContent = digits.format(hour);
    $("clock-minute").textContent = digits.format(minute);
    $("clock-hour").setAttribute("aria-pressed", String(clockUnit === "hour"));
    $("clock-minute").setAttribute("aria-pressed", String(clockUnit === "minute"));
    const isHour = clockUnit === "hour";
    const count = isHour ? 24 : 12;
    const selected = isHour ? hour : minute;
    const angle = (selected % (isHour ? 12 : 60)) / (isHour ? 12 : 60);
    const hand = document.createElement("span");
    hand.className = "clock-hand";
    hand.style.setProperty("--angle", `${angle}turn`);
    if (isHour && hour >= 12) hand.classList.add("inner");
    hand.setAttribute("aria-hidden", "true");
    const controls = Array.from({ length: count }, (_, index) => {
      const value = isHour ? index : index * 5;
      const at = (value % (isHour ? 12 : 60)) / (isHour ? 12 : 60) * Math.PI * 2;
      const radius = isHour && value >= 12 ? 27 : 41;
      const control = document.createElement("button");
      control.type = "button";
      control.textContent = isHour ? value.toLocaleString("fa-IR") : digits.format(value);
      control.setAttribute("aria-pressed", String(value === selected));
      control.style.left = `${50 + Math.sin(at) * radius}%`;
      control.style.top = `${50 - Math.cos(at) * radius}%`;
      control.addEventListener("click", () => {
        if (isHour) {
          hour = value;
          clockUnit = "minute";
        } else minute = value;
        drawClock();
        if (isHour) $("clock-minute").focus({ preventScroll: true });
        else $("picker-time-confirm").focus({ preventScroll: true });
      });
      return control;
    });
    $("clock-dial").replaceChildren(hand, ...controls);
  }

  function keyboardValues() {
    return [$("keyboard-hour"), $("keyboard-minute")].map(field => {
      const value = field.value.trim().replace(/[۰-۹٠-٩]/g, char => String(char.charCodeAt(0) & 15));
      return /^\d{1,2}$/.test(value) ? Number(value) : NaN;
    });
  }

  function readKeyboard() {
    const [h, m] = keyboardValues();
    if (!(h >= 0 && h < 24 && m >= 0 && m < 60)) {
      $("clock-error").textContent = "ساعت و دقیقه را بررسی کنید.";
      return false;
    }
    hour = h;
    minute = m;
    return true;
  }

  function clockMode(showKeyboard) {
    keyboard = showKeyboard;
    $("clock-error").textContent = "";
    $("clock-keyboard").hidden = !keyboard;
    $("clock-dial").hidden = keyboard;
    $("clock-display").hidden = keyboard;
    $("clock-mode").textContent = keyboard ? "نمای ساعت" : "ورود عددی ساعت";
    if (keyboard) {
      $("keyboard-hour").value = twoDigits(hour);
      $("keyboard-minute").value = twoDigits(minute);
    }
    drawClock();
  }

  function openTime(field) {
    timeField = field;
    [hour, minute] = (field.value || "08:00").split(":").map(Number);
    clockUnit = "hour";
    clockMode(false);
    timeSheet.showModal();
  }

  $("clock-hour").addEventListener("click", () => { clockUnit = "hour"; drawClock(); });
  $("clock-minute").addEventListener("click", () => { clockUnit = "minute"; drawClock(); });
  $("clock-dial").addEventListener("click", event => {
    if (clockUnit !== "minute" || event.target.closest("button")) return;
    const dial = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - dial.left - dial.width / 2;
    const y = event.clientY - dial.top - dial.height / 2;
    if (Math.hypot(x, y) < 12) return;
    minute = (Math.round(Math.atan2(x, -y) / (2 * Math.PI) * 60) + 60) % 60;
    drawClock();
  });
  $("clock-mode").addEventListener("click", () => {
    if (keyboard && !readKeyboard()) return;
    clockMode(!keyboard);
  });
  $("picker-time-confirm").addEventListener("click", () => {
    if (keyboard && !readKeyboard()) return;
    timeSheet.close();
    setValue(timeField, `${twoDigits(hour)}:${twoDigits(minute)}`);
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
              day => setValue(field, day === null ? "" : isoDay(day)), !field.required);
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
        field.value.replace(/\d/g, digit => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]));
      const caption = label.textContent.trim();
      control.textContent = field.id === "basic-time" && formatted ? `نوبت ۱: ساعت ${formatted}` : formatted || caption;
      control.setAttribute("aria-label", formatted ? `${caption}، ${formatted}` : caption);
    }
  }

  return { refresh };
}
