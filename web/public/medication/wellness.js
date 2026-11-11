import { defaultCalendar, language, listSeparator, localDigits, locale, selectLanguage, shortWeek, t, weekIndex } from "./locale.js";
import { appointmentDefaults, appointmentOffsets, appointmentReminders, localZone, visitInstant, waterDefaults, waterGoalReached } from "./care-plan.js";
import { localWall, timezone } from "./wall-clock.js";
import { appearanceColors } from "./medication-art.js";
import { $, button, element, fitDialogToViewport } from "./dom.js";
import { appointmentView, visitIllustration } from "./appointments-view.js";
import { renderCalendar, renderReports } from "./insights-view.js";
import { changeReminderRevision } from "./reminders.js";
import { accentOf, applyDisplay } from "./display.js";

const dayMs = 86_400_000;
const numbers = new Intl.NumberFormat(locale);
const percent = new Intl.NumberFormat(locale, { style: "percent" });
const titles = { today: t("امروز"), medications: t("داروها"), appointments: t("قرارها"), routines: t("روتین‌ها"), insights: t("گزارش و تقویم"), water: t("آب") };
const accents = { blue: t("آبی"), green: t("سبز"), lilac: t("یاسی"), coral: t("مرجانی") };
const visitColorOf = color => Object.hasOwn(appearanceColors, color) ? color : "purple";
const iso = day => new Date(day * dayMs).toISOString().slice(0, 10);
function empty(text) { return element("p", text, "empty"); }
function integer(input) {
  const digits = input.trim().replace(/[۰-۹٠-٩]/g, char => String((char.charCodeAt(0) & 15)));
  return /^\d{1,5}$/.test(digits) ? Number(digits) : NaN;
}
function localClock() {
  const now = new Date();
  return [now.getHours(), now.getMinutes()].map(n => String(n).padStart(2, "0")).join(":");
}
function clockText(value) { return value.replace(/\d/g, digit => numbers.format(Number(digit))); }

export function wellness({ getState, selectedDay, today, render, mutate, requestDeletion, renderDose, renderRoutine, refreshFields }) {
  let screen = "today";
  const selectedDates = new Map();
  let editingVisit = null;
  let editingWater = null;
  let quickWaterEntry;
  const dayWeek = $("day-week");
  let weekSlide;
  let insight = "calendar";
  let calendarSelection = today();
  let calendarMonth = calendarSelection;
  let reportSpan = 30;
  let reportTimer;
  let calendar;
  let weekdayText;
  let shortDate;
  let shortMonth;
  let monthText;
  let dayText;
  let dayIndex;
  let fullDate;

  function setCalendar(next) {
    if (next === calendar) return;
    calendar = next;
    const format = options => new Intl.DateTimeFormat(`${locale}-u-ca-${calendar}`, { ...options, timeZone: "UTC" });
    weekdayText = format({ weekday: "long" });
    shortDate = format({ day: "numeric", month: "short" });
    shortMonth = format({ month: "short" });
    monthText = format({ month: "long", year: "numeric" });
    dayText = format({ day: "numeric" });
    fullDate = format({ dateStyle: "long" });
    dayIndex = new Intl.DateTimeFormat(`en-u-ca-${calendar}-nu-latn`, { day: "numeric", timeZone: "UTC" });
  }
  function formatDay(day, includeWeekday = false) {
    const date = day * dayMs;
    if (locale === "en-US") return includeWeekday ? weekdayText.format(date) + listSeparator + fullDate.format(date) : fullDate.format(date);
    const parts = monthText.formatToParts(date);
    const month = parts.find(part => part.type === "month").value;
    const year = parts.find(part => part.type === "year").value;
    const label = `${dayText.format(date)} ${month} ${year}`;
    return includeWeekday ? `${weekdayText.format(date)}، ${label}` : label;
  }
  function chooseDay(day, restoreFocus) {
    if (screen === "today" || screen === "medications") {
      if (day === today()) selectedDates.delete(screen);
      else selectedDates.set(screen, day);
    }
    $("day").value = iso(day);
    render();
    if (restoreFocus) $(restoreFocus).querySelector('[aria-current="date"]')?.focus();
  }
  const settingsPanels = {
    "display-settings": [t("ظاهر و زبان"), t("تم، تقویم و زبان برنامه")],
    "notification-settings": [t("اعلان‌های این دستگاه"), t("یادآوری دارو، آب، قرار و روتین")],
    "water-settings": [t("آب"), t("هدف روزانه و زمان یادآوری")],
    "snooze-settings": [t("تعویق یادآوری دارو"), t("مدت تعویق اعلان دارو")],
    "appointment-settings": [t("یادآوری قرارها"), t("زمان شروع و تکرار یادآوری")],
    "backup-settings": [t("پشتیبان‌گیری"), t("ساخت و بازیابی فایل رمزدار")]
  };
  const settings = $("settings-dialog");
  const settingsLinks = [...settings.querySelectorAll("[data-settings-panel]")];
  const loadedSettings = new Set();
  let settingsSession = 0;
  let settingsHomeScroll = 0;
  const fitSettings = fitDialogToViewport(settings);
  const snoozePresets = [...document.querySelectorAll('[name="snooze-preset"]')];
  const visitOffsetFields = [...document.querySelectorAll('[name="visit-offset"]')];
  function setOption(id, value) {
    const select = $(id);
    for (const option of select.querySelectorAll("[data-restored]")) option.remove();
    if (![...select.options].some(option => Number(option.value) === value)) {
      const option = new Option(t("{0} دقیقه", numbers.format(value)), value);
      option.dataset.restored = "";
      select.add(option);
    }
    select.value = value;
  }
  function settingsFeedback(message = "", state = "") {
    const status = $("settings-status");
    status.textContent = message;
    status.dataset.state = state;
  }
  function refreshSettingsHome(data) {
    const water = data.waterReminders ?? waterDefaults;
    const waterStatus = !water.enabled ? t("یادآوری خاموش") : water.pauseUntil > Date.now() ? t("یادآوری متوقف") : t("یادآوری فعال");
    $("settings-water-summary").textContent = t("هدف {0} میلی‌لیتر", numbers.format(data.waterGoal ?? 2000)) + " · " + waterStatus;
    $("settings-snooze-summary").textContent = t("{0} دقیقه", numbers.format(data.medicationSnoozeMinutes ?? 10));
    const appointment = data.appointmentReminders ?? appointmentDefaults;
    $("settings-appointment-summary").textContent = t("از ساعت {0} · {1}", clockText(appointment.start),
      appointment.interval === 60 ? t("هر ساعت") : t("هر دو ساعت"));
    const theme = { system: t("مطابق گوشی"), light: t("روشن"), dark: t("تیره") }[data.theme] ?? t("مطابق گوشی");
    const calendar = (data.calendar ?? defaultCalendar) === "persian" ? t("شمسی") : t("میلادی");
    $("settings-display-summary").textContent = [theme, accents[accentOf(data.accent)], calendar, language === "fa" ? "فارسی" : "English"].join(" · ");
  }
  function loadWaterSettings(data) {
    const water = data.waterReminders ?? waterDefaults;
    $("water-goal").value = data.waterGoal ?? 2000;
    $("water-reminders-enabled").checked = water.enabled;
    $("water-reminder-fields").hidden = !water.enabled;
    $("water-reminders-start").value = water.start;
    $("water-reminders-end").value = water.end;
    setOption("water-reminders-interval", water.interval);
    setOption("water-reminders-repeat", water.repeat);
    refreshFields($("water-goal-form"));
  }
  function loadSettings(panel, data) {
    if (panel === "display-settings") {
      $("calendar-setting").value = data.calendar ?? defaultCalendar;
      $("display-form").elements.theme.value = data.theme ?? "system";
      $("display-form").elements.accent.value = accentOf(data.accent);
      $("app-language").value = language;
    }
    if (panel === "water-settings") loadWaterSettings(data);
    if (panel === "snooze-settings") {
      const minutes = data.medicationSnoozeMinutes ?? 10;
      const preset = [10, 30, 60].includes(minutes) ? String(minutes) : "custom";
      snoozePresets.find(control => control.value === preset).checked = true;
      $("snooze-minutes").value = minutes;
      $("snooze-custom-row").hidden = preset !== "custom";
    }
    if (panel === "appointment-settings") {
      const appointment = data.appointmentReminders ?? appointmentDefaults;
      $("appointment-reminders-start").value = appointment.start;
      $("appointment-reminders-interval").value = appointment.interval;
      refreshFields($("appointment-settings-form"));
    }
  }
  function selectSettings(panel = "") {
    if (settings.dataset.panel === "backup-settings" && panel !== "backup-settings") {
      $("android-restore").reset();
      $("web-backup-export").reset();
    }
    settings.dataset.panel = panel;
    $("settings-mark").toggleAttribute("hidden", Boolean(panel));
    $("settings-back").hidden = !panel;
    $("settings-home").hidden = Boolean(panel);
    const [title, subtitle] = settingsPanels[panel] ?? [t("تنظیمات مدورا"), t("ظاهر، یادآوری‌ها و داده‌ها")];
    $("settings-title").textContent = title;
    $("settings-subtitle").textContent = subtitle;
    settingsFeedback();
    for (const id of Object.keys(settingsPanels)) $(id).hidden = panel !== id;
    const data = getState();
    if (!panel) refreshSettingsHome(data);
    else if (!loadedSettings.has(panel)) {
      loadSettings(panel, data);
      loadedSettings.add(panel);
    }
    if (panel === "water-settings") updateWaterPause();
    $("settings-content").scrollTop = panel ? 0 : settingsHomeScroll;
  }
  for (const link of settingsLinks) {
    link.addEventListener("click", () => {
      settingsHomeScroll = $("settings-content").scrollTop;
      selectSettings(link.dataset.settingsPanel);
      $("settings-title").focus({ preventScroll: true });
    });
  }
  function backToSettings() {
    const selected = settings.dataset.panel;
    selectSettings();
    settingsLinks.find(link => link.dataset.settingsPanel === selected)?.focus({ preventScroll: true });
  }
  $("settings-back").addEventListener("click", backToSettings);
  settings.addEventListener("cancel", event => {
    if (!settings.dataset.panel) return;
    event.preventDefault();
    backToSettings();
  });
  settings.addEventListener("close", () => {
    $("android-restore").reset();
    $("web-backup-export").reset();
    clearTimeout(waterPauseTimer);
  });
  settings.addEventListener("input", () => settingsFeedback());
  function show(destination, notifications = false) {
    if (destination === "settings") {
      settingsSession += 1;
      loadedSettings.clear();
      settingsHomeScroll = 0;
      selectSettings(notifications ? "notification-settings" : "");
      settings.showModal();
      fitSettings();
      updateWaterPause();
      return;
    }
    if (!Object.hasOwn(titles, destination)) return;
    if (destination === "water") $("day").value = iso(Math.min(selectedDay(), today()));
    if (destination === "today" || destination === "medications") $("day").value = iso(selectedDates.get(destination) ?? today());
    if (destination === "insights") {
      calendarMonth = calendarSelection = today();
      openInsight("calendar");
    }
    screen = destination;
    const dayControls = $("day-controls");
    if (screen === "medications") $("med-day-title").after(dayControls);
    else if (screen === "routines") $("routine-dates").append(dayControls);
    else if (screen === "water") document.querySelector('[data-screen="water"]').prepend(dayControls);
    else $("today-dates").append(dayControls);
    $("today-story").hidden = screen !== "today";
    $("app").dataset.activeScreen = screen;
    for (const view of document.querySelectorAll("[data-screen]")) view.hidden = view.dataset.screen !== screen;
    for (const item of document.querySelectorAll(".dock [data-destination]")) {
      if (item.dataset.destination === (screen === "insights" ? "insights" : "today")) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    }
    $("screen-title").textContent = titles[screen];
    if (screen !== "today") $("header-date").textContent = "";
    $("screen-back").hidden = screen === "today" || screen === "insights";
    document.querySelector(".app-bar .brand-mark").hidden = !$("screen-back").hidden;
    dayControls.hidden = !["today", "water", "medications", "routines"].includes(screen);
    dayControls.classList.toggle("single-date", screen !== "today");
    dayControls.classList.toggle("compact-day", screen === "medications" || screen === "routines");
    $("today-reset").hidden = screen !== "today" || selectedDay() === today();
    render();
    scrollTo(0, 0);
  }
  $("screen-back").addEventListener("click", () => show("today"));
  for (const button of document.querySelectorAll("[data-destination]")) {
    button.addEventListener("click", () => show(button.dataset.destination, button.hasAttribute("data-open-notifications")));
  }
  for (const [id, delta] of [["previous-day", -1], ["next-day", 1]]) {
    $(id).addEventListener("click", () => {
      const animate = screen === "today" && !matchMedia("(prefers-reduced-motion: reduce)").matches;
      const outgoing = animate ? dayWeek.children[delta > 0 ? 0 : 6]?.cloneNode(true) : null;
      chooseDay(selectedDay() + delta);
      if (!outgoing) return;
      outgoing.inert = true;
      outgoing.setAttribute("aria-hidden", "true");
      outgoing.classList.add("day-week-ghost");
      outgoing.dataset.edge = delta > 0 ? "start" : "end";
      dayWeek.append(outgoing);
      const direction = document.documentElement.dir === "rtl" ? -1 : 1;
      weekSlide = dayWeek.animate(
        [{ transform: `translateX(${direction * delta * 100 / 7}%)` }, { transform: "none" }],
        { duration: 210, easing: "ease-out" }
      );
      weekSlide.onfinish = () => outgoing.remove();
    });
  }
  $("today-reset").addEventListener("click", () => {
    chooseDay(today(), "day-week");
  });

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
      else if (id) throw new Error(t("این ثبت آب حذف شده است."));
      else list.push(entry);
    }, t("آب ثبت شد."), id ? undefined : day);
    return saved ? entry : null;
  }
  for (const button of document.querySelectorAll("[data-water-add]")) {
    button.addEventListener("click", () => addWater(Number(button.dataset.waterAdd)));
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
  quickWaterButton.addEventListener("click", async () => {
    if (quickWaterButton.disabled || selectedDay() !== today()) return;
    quickWaterButton.disabled = true;
    try {
      const entry = await addWater(250);
      if (!entry) return;
      quickWaterEntry = entry;
      $("today-water-message").textContent = t("{0} میلی‌لیتر ثبت شد.", numbers.format(entry.amount));
      renderQuickWaterFeedback(getState(), selectedDay());
    } finally {
      quickWaterButton.disabled = false;
    }
  });
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
      if (!record) throw new Error(t("این ثبت تغییر کرده یا حذف شده است."));
      state.water = state.water.filter(item => item.id !== entry.id);
    }, t("ثبت آب برگشت داده شد."), entry.day)) quickWaterButton.focus({ preventScroll: true });
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
      ? `${day === today() ? t("امروز") : formatDay(day)} · ${clockText(time)}`
      : "";
  }
  function openWater(entry, custom = false) {
    editingWater = entry?.id ?? null;
    $("water-dialog-title").textContent = entry ? t("ویرایش ثبت آب") : t("ثبت آب");
    $("water-amount").value = localDigits(entry?.amount ?? 250);
    $("water-log-day").value = iso(entry?.day ?? selectedDay());
    $("water-log-day").max = iso(today());
    $("water-log-time").value = entry?.time ?? localClock();
    $("water-error").textContent = "";
    $("water-options").open = Boolean(entry);
    updateWaterSelection();
    updateWaterWhen();
    refreshFields($("water-dialog"));
    $("water-dialog").showModal();
    if (custom) {
      $("water-amount").focus();
      $("water-amount").select();
    }
  }
  for (const control of document.querySelectorAll("[data-open-water]")) {
    control.addEventListener("click", () => openWater(null, control.id === "water-custom-action"));
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
      error.textContent = t("مقدار آب باید از ۱ تا ۱۰٬۰۰۰ میلی‌لیتر باشد.");
      $("water-amount").focus();
      return;
    }
    if (!Number.isInteger(day) || day > today() || !time) {
      error.textContent = day > today() ? t("برای روز آینده نمی‌شود آب ثبت کرد.") : t("تاریخ و ساعت ثبت را انتخاب کنید.");
      $("water-options").open = true;
      return;
    }
    submit.disabled = true;
    try {
      if (await addWater(value, day, time, editingWater)) $("water-dialog").close();
      else error.textContent = t("ذخیره انجام نشد. دوباره تلاش کنید.");
    } finally {
      submit.disabled = false;
    }
  });
  async function saveSettings(control, change, success, scheduleChanged = false) {
    if (control.disabled) return false;
    const session = settingsSession;
    const panel = settings.dataset.panel;
    control.disabled = true;
    settingsFeedback();
    try {
      const saved = await mutate(change, success, scheduleChanged);
      const active = settings.open && settingsSession === session && settings.dataset.panel === panel;
      if (active) {
        settingsFeedback(saved ? success : t("ذخیره انجام نشد. دوباره تلاش کنید."), saved ? "success" : "error");
        control.scrollIntoView({ block: "nearest" });
      }
      if (saved && settings.open && !settings.dataset.panel) refreshSettingsHome(getState());
      return saved && active;
    } finally {
      control.disabled = false;
    }
  }
  let waterPauseTimer;
  function updateWaterPause() {
    clearTimeout(waterPauseTimer);
    const { enabled, pauseUntil } = getState().waterReminders ?? waterDefaults;
    const remaining = pauseUntil - Date.now();
    const paused = remaining > 0;
    $("water-pause-card").hidden = !enabled;
    $("water-reminders-pause").textContent = paused ? t("ازسرگیری یادآوری") : t("توقف برای یک ساعت");
    $("water-pause-status").textContent = paused
      ? t("یادآوری آب تا ساعت {0} متوقف است.", new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(pauseUntil))
      : t("یادآوری آب بعد از یک ساعت خودکار از سر گرفته می‌شود.");
    if (enabled && paused && settings.open) waterPauseTimer = setTimeout(() => {
      updateWaterPause();
      if (!settings.dataset.panel) refreshSettingsHome(getState());
    }, remaining);
  }
  $("water-reminders-enabled").addEventListener("change", () => {
    $("water-reminder-fields").hidden = !$("water-reminders-enabled").checked;
  });
  $("water-reminders-pause").addEventListener("click", async event => {
    const now = Date.now();
    const paused = (getState().waterReminders?.pauseUntil ?? 0) > now;
    await saveSettings(event.currentTarget, state => {
      if (!state.waterReminders?.enabled) throw new Error("water reminders disabled");
      state.waterReminders.pauseUntil = paused ? 0 : now + 3_600_000;
    }, paused ? t("یادآوری آب از سر گرفته شد.") : t("یادآوری آب برای یک ساعت متوقف شد."), true);
    updateWaterPause();
  });
  $("water-goal-form").addEventListener("submit", async event => {
    event.preventDefault();
    const goal = integer($("water-goal").value);
    if (!(goal >= 1 && goal <= 20000)) {
      settingsFeedback(t("هدف آب باید از ۱ تا ۲۰٬۰۰۰ میلی‌لیتر باشد."), "error");
      $("water-goal").focus();
      return;
    }
    const enabled = $("water-reminders-enabled").checked;
    const start = $("water-reminders-start").value;
    const end = $("water-reminders-end").value;
    const interval = Number($("water-reminders-interval").value);
    const repeat = Number($("water-reminders-repeat").value);
    if (enabled && (!start || !end || start >= end)) {
      settingsFeedback(t("ساعت پایان باید بعد از ساعت شروع باشد."), "error");
      $("water-goal-form").querySelector('[data-for="water-reminders-end"]').focus();
      return;
    }
    if (enabled && !(interval >= 15 && interval <= 240 && repeat >= 0 && repeat < interval)) {
      settingsFeedback(t("تکرار یک‌باره باید کوتاه‌تر از فاصلهٔ یادآوری باشد."), "error");
      const repeatField = $("water-reminders-repeat");
      repeatField.closest("details").open = true;
      repeatField.focus();
      return;
    }
    const saved = await saveSettings(event.submitter ?? $("water-goal-form").querySelector('[type="submit"]'), state => {
      state.waterGoal = goal;
      const previous = state.waterReminders ?? waterDefaults;
      state.waterReminders = enabled ? { start, end, interval, repeat, pauseUntil: previous.pauseUntil, enabled }
        : { ...previous, enabled: false };
    }, t("تنظیمات آب ذخیره شد."), true);
    if (saved && !enabled) loadWaterSettings(getState());
    updateWaterPause();
  });
  for (const control of snoozePresets) control.addEventListener("change", () => {
    $("snooze-custom-row").hidden = control.value !== "custom";
  });
  $("snooze-form").addEventListener("submit", async event => {
    event.preventDefault();
    const choice = snoozePresets.find(control => control.checked).value;
    const minutes = integer(choice === "custom" ? $("snooze-minutes").value : choice);
    if (!(minutes >= 1 && minutes <= 1440)) {
      settingsFeedback(t("مدت تعویق باید از ۱ تا ۱٬۴۴۰ دقیقه باشد."), "error");
      $("snooze-minutes").focus();
      return;
    }
    await saveSettings(event.submitter ?? $("snooze-form").querySelector('[type="submit"]'),
      state => { state.medicationSnoozeMinutes = minutes; }, t("مدت تعویق ذخیره شد."));
  });
  $("appointment-settings-form").addEventListener("submit", async event => {
    event.preventDefault();
    const start = $("appointment-reminders-start").value;
    const interval = Number($("appointment-reminders-interval").value);
    if (!start || ![60, 120].includes(interval)) {
      settingsFeedback(t("ساعت شروع و فاصلهٔ یادآوری را بررسی کن."), "error");
      return;
    }
    await saveSettings(event.submitter ?? $("appointment-settings-form").querySelector('[type="submit"]'),
      state => { state.appointmentReminders = { start, interval }; }, t("تنظیمات قرار ذخیره شد."), true);
  });
  $("display-form").addEventListener("submit", async event => {
    event.preventDefault();
    const theme = event.currentTarget.elements.theme.value;
    const accent = accentOf(event.currentTarget.elements.accent.value);
    const selectedCalendar = $("calendar-setting").value;
    const nextLanguage = $("app-language").value;
    if (await saveSettings(event.submitter ?? $("display-form").querySelector('[type="submit"]'),
      state => { state.theme = theme; state.accent = accent; state.calendar = selectedCalendar; }, t("تنظیمات نمایش ذخیره شد."))) selectLanguage(nextLanguage);
  });

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
    $("visit-appearance-preview").replaceChildren(visitIllustration(visitCategory.value));
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
    $("visit-day").value = iso(visit?.day ?? today());
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
    formatDay, formatDayNumber: day => dayText.format(day * dayMs),
    formatShortMonth: day => shortMonth.format(day * dayMs),
    today, openVisit, deleteVisit, mutate, render
  });

  function dateButton(day, selected, choose) {
    const control = button(dayText.format(day * dayMs), () => choose(day));
    control.setAttribute("aria-label", formatDay(day, true));
    if (day === selected) control.setAttribute("aria-current", "date");
    return control;
  }

  function monthStart(day) {
    return day - Number(dayIndex.formatToParts(day * dayMs).find(part => part.type === "day").value) + 1;
  }

  function fillGlass(container, progress) {
    const level = 90 - 78 * progress;
    $(container).querySelector(".glass-water")
      .setAttribute("d", progress ? `M0 ${level}C30 ${level - 7} 65 ${level + 8} 100 ${level}V100H0Z` : "");
  }

  function renderTodayHeader(day) {
    const date = day * dayMs;
    $("story-date").dateTime = iso(day);
    $("story-date").textContent = weekdayText.format(date) + listSeparator + shortDate.format(date);
    $("story-date").setAttribute("aria-label", formatDay(day, true));
    $("story-title").textContent = day === today() ? t("امروز با مدورا") : t("برنامهٔ این روز");
    $("today-reset").hidden = day === today();
    weekSlide?.cancel();
    dayWeek.replaceChildren(...Array.from({ length: 7 }, (_, offset) => {
      const date = day - 3 + offset;
      const control = dateButton(date, day, selected => chooseDay(selected, "day-week"));
      if (date === today()) control.classList.add("calendar-today");
      control.append(element("span", shortWeek[weekIndex(date)]));
      return control;
    }));
    $("header-date").textContent = formatDay(day, true);
  }

  function renderTodayWater(state, day, total, goal, progress) {
    const future = day > today();
    $("today-water").hidden = future;
    $("future-schedule").hidden = !future;
    $("open-water-history").hidden = future;
    $("today-water-label").textContent = day === today() ? t("مصرف آب امروز") : t("مصرف آب این روز");
    $("today-water-total").textContent = numbers.format(total);
    $("today-water-goal").textContent = numbers.format(goal);
    $("today-water-progress").value = progress;
    $("today-water-percent").textContent = percent.format(progress);
    $("today-water").toggleAttribute("data-goal-reached", total >= goal);
    quickWaterButton.hidden = day !== today();
    renderQuickWaterFeedback(state, day);
    fillGlass("today-water", progress);
  }

  function renderWater(day, index, total, goal, progress) {
    $("water-custom-action").hidden = day > today();
    $("water-entry").hidden = day > today();
    $("water-progress").value = progress;
    $("water-date").textContent = day === today() ? t("امروز") : shortDate.format(day * dayMs);
    $("water-total").textContent = numbers.format(total);
    $("water-goal-label").textContent = numbers.format(goal);
    $("water-remaining").textContent = total >= goal ? t("هدف این روز کامل شد.") : t("{0} میلی‌لیتر تا هدف", numbers.format(goal - total));
    fillGlass("water-summary", progress);
    const entries = [...index.waterOn(day)].reverse()
      .sort((a, b) => b.time.localeCompare(a.time));
    $("water-entries").replaceChildren(...(entries.length ? entries.map(entry => {
      const row = element("article", "", "entry-row");
      row.append(element("span", t("{0} میلی‌لیتر · {1}", numbers.format(entry.amount), clockText(entry.time))), button(t("ویرایش"), () => openWater(entry)),
        button(t("حذف ثبت"), () => {
          if (confirm(t("این ثبت آب حذف شود؟"))) void mutateWater(data => {
            data.water = data.water.filter(item => item.id !== entry.id);
          }, t("ثبت آب حذف شد."), entry.day);
        }));
      return row;
    }) : [empty(t("برای این روز آبی ثبت نشده است."))]));
  }

  function renderWellness(state, day, index) {
    clearTimeout(reportTimer);
    setCalendar(state.calendar ?? defaultCalendar);
    applyDisplay(state);
    if (["today", "medications", "water", "routines"].includes(screen)) {
      $("day-label").textContent = screen === "today" ? monthText.format(day * dayMs) : day === today() ? t("امروز") : formatDay(day);
      $("pick-day").setAttribute("aria-label", t("انتخاب تاریخ، {0}", formatDay(day, true)));
    }
    const goal = state.waterGoal ?? 2000;
    if (screen === "today" || screen === "water") {
      const total = index.waterTotal(day);
      const progress = Math.min(1, total / goal);
      if (screen === "today") {
        renderTodayHeader(day);
        renderTodayWater(state, day, total, goal, progress);
      } else renderWater(day, index, total, goal, progress);
    } else if (screen === "appointments") appointments.renderVisits(index);
    else if (screen === "insights") {
      if (insight === "calendar") renderCalendar(state, index, {
        day: calendarSelection, start: monthStart(calendarMonth), today: today(),
        formatMonth: day => monthText.format(day * dayMs), formatDay, dateButton,
        selectDay: day => { calendarSelection = day; render(); },
        renderDose, renderRoutine, visitCard: appointments.visitCard
      });
      else {
        renderReports(today(), goal, index, reportSpan, day => shortDate.format(day * dayMs));
        reportTimer = setTimeout(render, 60_000 - Date.now() % 60_000);
      }
    }
  }

  function chooseOption(attribute, change) {
    const options = document.querySelectorAll(`[data-${attribute}]`);
    for (const option of options) option.addEventListener("click", () => {
      for (const item of options) item.setAttribute("aria-pressed", String(item === option));
      change(option.getAttribute(`data-${attribute}`));
      render();
    });
  }
  chooseOption("visit-filter", appointments.setFilter);
  function openInsight(value) {
    insight = value;
    for (const control of document.querySelectorAll("[data-insight]")) {
      control.setAttribute("aria-pressed", String(control.dataset.insight === value));
    }
    $("calendar-panel").hidden = value !== "calendar";
    $("reports-panel").hidden = value !== "reports";
  }
  chooseOption("insight", openInsight);
  chooseOption("report-range", value => { reportSpan = Number(value); });
  for (const [id, delta] of [["previous-month", -1], ["next-month", 32]]) {
    $(id).addEventListener("click", () => {
      calendarMonth = monthStart(monthStart(calendarMonth) + delta);
      render();
    });
  }
  return {
    dayVisits: appointments.dayVisits, renderWellness, monthStart, chooseDay, show,
    screen: () => screen,
    formatDay,
    formatMonth: day => monthText.format(day * dayMs),
    formatDayNumber: day => dayText.format(day * dayMs),
    dateLimit: () => screen === "water" ? today() : Infinity
  };
}
