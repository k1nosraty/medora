import { renderMonthGrid } from "./MonthGrid";
import {
  listSeparator,
  localDigits,
  t,
} from "../../product-assets/public/medication/shared/i18n/locale.js";
import { useRef, useState, type FormEvent } from "react";
import { paintFeature } from "./renderer";

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id)! as T;
const dayMs = 86_400_000;
const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / dayMs;
const isoDay = (day: number) =>
  new Date(day * dayMs).toISOString().slice(0, 10);
const twoDigits = (value: number) => String(value).padStart(2, "0");

interface Options {
  today(): number;
  selectedDay(): number;
  dashboard: {
    yearStart(day: number): number;
    monthStart(day: number): number;
    formatMonth(day: number): string;
    formatShortMonth(day: number): string;
    formatDay(day: number, long?: boolean): string;
    formatDayNumber(day: number): string;
    formatYear(day: number): string;
    dateLimit(): number;
    chooseDay(day: number): void;
  };
}

export function installPickers({ today, selectedDay, dashboard }: Options) {
  const fields = new WeakMap<HTMLInputElement, HTMLButtonElement>();
  const dateSheet = $<HTMLDialogElement>("date-picker");
  const timeSheet = $<HTMLDialogElement>("time-picker");
  let shownMonth: number;
  let pickedDay: number;
  let focusedDay: number;
  let dateLimit: number;
  let onPickDate: ((day: number | null) => void) | undefined;
  let timeRequest = 0;
  const birthJump = $("picker-birth-jump");
  const birthYear = $<HTMLSelectElement>("picker-birth-year");
  const birthMonth = $<HTMLSelectElement>("picker-birth-month");

  function setBirthMonths() {
    const year = dashboard.yearStart(shownMonth);
    birthYear.value = String(year);
    const months = [];
    for (
      let month = year;
      months.length < 12 && month <= dateLimit;
      month = dashboard.monthStart(month + 32)
    ) {
      months.push(new Option(dashboard.formatShortMonth(month), String(month)));
    }
    birthMonth.replaceChildren(...months);
    birthMonth.value = String(shownMonth);
  }

  for (const control of [birthYear, birthMonth])
    control.addEventListener("change", () => {
      shownMonth = Number(control.value);
      drawDate();
    });

  function drawDate() {
    $("picker-month").textContent = dashboard.formatMonth(shownMonth);
    const currentDay = today();
    $("picker-today").hidden =
      currentDay > dateLimit ||
      (pickedDay === currentDay &&
        shownMonth === dashboard.monthStart(currentDay));
    if (!birthJump.hidden) setBirthMonths();
    const end = dashboard.monthStart(shownMonth + 32);
    const grid = $("picker-days");
    renderMonthGrid(grid, {
      start: shownMonth,
      end: end - 1,
      selected: pickedDay,
      active: focusedDay,
      today: today(),
      last: dateLimit,
      minCells: 42,
      formatDay: dashboard.formatDay,
      formatNumber: dashboard.formatDayNumber,
      onSelect(day) {
        pickedDay = focusedDay = day;
        drawDate();
      },
      onMove(day) {
        focusedDay = day;
        shownMonth = dashboard.monthStart(day);
        drawDate();
        grid
          .querySelector<HTMLButtonElement>('button[tabindex="0"]')
          ?.focus({ preventScroll: true });
      },
    });
    $<HTMLButtonElement>("picker-date-confirm").disabled =
      pickedDay > dateLimit ||
      (!birthJump.hidden && dashboard.monthStart(pickedDay) !== shownMonth);
    $<HTMLButtonElement>("picker-next-month").disabled =
      !birthJump.hidden && end > dateLimit;
  }

  function openDate(
    day: number,
    max: number,
    select: (day: number | null) => void,
    optional = false,
    birthday = false,
  ) {
    pickedDay = focusedDay = day;
    shownMonth = dashboard.monthStart(day);
    dateLimit = max;
    onPickDate = select;
    birthJump.hidden = !birthday;
    if (birthday) {
      const years = [];
      for (
        let start = dashboard.yearStart(max);
        years.length <= 131;
        start = dashboard.yearStart(start - 1)
      ) {
        years.push(new Option(dashboard.formatYear(start), String(start)));
      }
      birthYear.replaceChildren(...years);
    }
    $("picker-clear-date").hidden = !optional;
    drawDate();
    dateSheet.showModal();
    $("picker-days")
      .querySelector<HTMLButtonElement>('button[tabindex="0"]')
      ?.focus({ preventScroll: true });
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
    $("picker-days")
      .querySelector<HTMLButtonElement>('button[tabindex="0"]')
      ?.focus({ preventScroll: true });
  });
  $("picker-date-confirm").addEventListener("click", () => {
    dateSheet.close();
    onPickDate?.(pickedDay);
  });
  $("picker-clear-date").addEventListener("click", () => {
    dateSheet.close();
    onPickDate?.(null);
  });
  $("pick-day").addEventListener("click", () =>
    openDate(selectedDay(), dashboard.dateLimit(), (day) => {
      if (day !== null) dashboard.chooseDay(day);
    }),
  );

  function openTime(field: HTMLInputElement) {
    paintFeature(
      timeSheet,
      <TimePicker
        key={++timeRequest}
        initial={field.value || "08:00"}
        close={() => timeSheet.close()}
        choose={(value) => {
          timeSheet.close();
          setValue(field, value);
        }}
      />,
    );
    timeSheet.showModal();
    $<HTMLInputElement>("keyboard-hour").select();
  }

  function setValue(field: HTMLInputElement, value: string) {
    field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    const dialog = field.closest("dialog");
    if (dialog) refresh(dialog);
  }

  function refresh(container: HTMLElement) {
    for (const field of container.querySelectorAll<HTMLInputElement>(
      'input[type="date"], input[type="time"]',
    )) {
      let control = fields.get(field);
      const label = field.closest("label");
      if (!label) continue;
      if (!control) {
        // React forms supply the corresponding button and own the DOM structure.
        const supplied =
          label.parentElement?.hasAttribute("data-picker-host") &&
          label.parentElement.querySelector<HTMLButtonElement>(
            ":scope > button.picker-field",
          );
        control = supplied || document.createElement("button");
        if (!supplied) {
          control.type = "button";
          control.className = "secondary picker-field";
          const wrapper = document.createElement("div");
          wrapper.className = label.classList.contains("phase-only")
            ? "picker-control phase-only"
            : "picker-control";
          label.replaceWith(wrapper);
          wrapper.append(label, control);
        }
        if (field.id || field.classList[0])
          control.dataset.for = field.id || field.classList[0]!;
        control.addEventListener("click", () => {
          if (field.type === "time") {
            openTime(field);
          } else {
            const max = field.max ? dayNumber(field.max) : Infinity;
            openDate(
              field.value ? dayNumber(field.value) : today(),
              max,
              (day) => setValue(field, day === null ? "" : isoDay(day)),
              !field.required,
              field.id === "profile-birth-date",
            );
          }
        });
        field.hidden = true;
        fields.set(field, control);
      }
      const formatted =
        field.value &&
        (field.type === "date"
          ? dashboard.formatDay(dayNumber(field.value))
          : localDigits(field.value.slice(0, 5)));
      const caption = label.textContent.trim();
      control.textContent =
        formatted || t(field.type === "date" ? "انتخاب تاریخ" : "انتخاب ساعت");
      control.setAttribute(
        "aria-label",
        caption + listSeparator + control.textContent,
      );
    }
  }

  return {
    refresh,
    chooseDate: (day: number, select: (day: number) => void) =>
      openDate(day, Infinity, (picked) => {
        if (picked !== null) select(picked);
      }),
  };
}
function TimePicker({
  initial,
  close,
  choose,
}: {
  initial: string;
  close(): void;
  choose(value: string): void;
}) {
  const [hour, minute] = localDigits(initial).split(":");
  const hourInput = useRef<HTMLInputElement>(null);
  const minuteInput = useRef<HTMLInputElement>(null);
  const [invalid, setInvalid] = useState<boolean[]>([]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = [hourInput.current!, minuteInput.current!];
    const parts = fields.map((field) => {
      const text = field.value
        .trim()
        .replace(/[۰-۹٠-٩]/g, (digit) => String(digit.charCodeAt(0) & 15));
      return /^\d{1,2}$/.test(text) ? Number(text) : NaN;
    });
    const outOfRange = parts.map(
      (value, i) => !(value >= 0 && value < (i === 0 ? 24 : 60)),
    );
    setInvalid(outOfRange);
    const firstError = fields[outOfRange.indexOf(true)];
    if (firstError) {
      firstError.focus();
      firstError.select();
      return;
    }
    choose(parts.map(twoDigits).join(":"));
  }
  const hasError = invalid.includes(true);
  return (
    <form id="time-form" className="sheet-form sheet-body" onSubmit={submit}>
      <h2 id="time-picker-title">{t("ui.choose-a-time")}</h2>
      <p className="quiet time-hint">
        {t("ui.enter-the-time-in-24-hour-format")}
      </p>
      <div className="time-inputs" dir="ltr">
        <label dir="auto">
          {t("ui.time")}
          <input
            id="keyboard-hour"
            dir="ltr"
            inputMode="numeric"
            maxLength={2}
            autoComplete="off"
            defaultValue={hour}
            ref={hourInput}
            aria-invalid={invalid[0]}
            aria-describedby={invalid[0] ? "time-error" : undefined}
          />
        </label>
        <span aria-hidden="true">:</span>
        <label dir="auto">
          {t("ui.minutes")}
          <input
            id="keyboard-minute"
            dir="ltr"
            inputMode="numeric"
            maxLength={2}
            autoComplete="off"
            defaultValue={minute}
            ref={minuteInput}
            aria-invalid={invalid[1]}
            aria-describedby={invalid[1] ? "time-error" : undefined}
          />
        </label>
      </div>
      <p id="time-error" className="field-error" role="alert">
        {hasError ? t("ui.check-the-hour-and-minute") : ""}
      </p>
      <div className="action-pair picker-actions">
        <button
          type="button"
          className="secondary"
          data-close="time-picker"
          onClick={close}
        >
          {t("ui.cancel")}
        </button>
        <button type="submit" id="picker-time-confirm">
          {t("ui.select")}
        </button>
      </div>
    </form>
  );
}
