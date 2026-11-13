import { defaultCalendar, language, locale, selectLanguage, t } from "../../shared/i18n/locale.js";
import { $, fitDialogToViewport } from "../../shared/ui/dom.js";
import { integer } from "../../shared/ui/input-values.js";
import { appointmentDefaults, waterDefaults } from "../../domain/care-plan.js";
import { accentOf, accentLabel } from "../../styles/theme.js";
import { canEnableCycle, cycleIsEnabled, finishOf, genders } from "../../domain/profile.js";

const numbers = new Intl.NumberFormat(locale);
function clockText(value) { return value.replace(/\d/g, digit => numbers.format(Number(digit))); }

export function installSettings({ getState, mutate, refreshFields }) {
  const settingsPanels = {
    "profile-settings": [t("پروفایل"), t("جنسیت و نمایش چرخه")],
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
  const gender = $("profile-gender");
  const cycle = $("profile-cycle-enabled");
  function updateCycleControl() {
    cycle.disabled = !canEnableCycle({ gender: gender.value });
    if (cycle.disabled) cycle.checked = false;
    $("profile-cycle-hint").textContent = t(cycle.disabled
      ? "با انتخاب «آقا»، چرخه غیرفعال است."
      : "چرخه اختیاری است. خاموش‌کردن آن سوابق را پاک نمی‌کند.");
  }
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
    const finish = t(finishOf(data.finish) === "glass" ? "شیشه‌ای" : "سه‌بعدی مات");
    $("settings-display-summary").textContent = [theme, t(accentLabel(accentOf(data.accent, cycleIsEnabled(data)))), calendar, language === "fa" ? "فارسی" : "English", finish].join(" · ");
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
      const enabled = cycleIsEnabled(data);
      $("settings-berry-choice").hidden = !enabled;
      $("settings-berry-choice").querySelector("input").disabled = !enabled;
      $("display-form").elements.accent.value = accentOf(data.accent, enabled);
      $("settings-finish").value = finishOf(data.finish);
      $("app-language").value = language;
    }
    if (panel === "profile-settings") {
      gender.value = genders.includes(data.gender) ? data.gender : "";
      cycle.checked = cycleIsEnabled(data);
      updateCycleControl();
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
    const accent = event.currentTarget.elements.accent.value;
    const finish = finishOf($("settings-finish").value);
    const selectedCalendar = $("calendar-setting").value;
    const nextLanguage = $("app-language").value;
    if (await saveSettings(event.submitter ?? $("display-form").querySelector('[type="submit"]'),
      state => {
        state.theme = theme;
        state.accent = accentOf(accent, cycleIsEnabled(state));
        state.calendar = selectedCalendar;
        state.finish = finish;
      }, t("تنظیمات نمایش ذخیره شد."))) selectLanguage(nextLanguage);
  });
  gender.addEventListener("change", updateCycleControl);
  $("profile-form").addEventListener("submit", async event => {
    event.preventDefault();
    const selectedGender = genders.includes(gender.value) ? gender.value : "";
    const enabled = cycle.checked && canEnableCycle({ gender: selectedGender });
    await saveSettings(event.submitter ?? $("profile-form").querySelector('[type="submit"]'), state => {
      state.gender = selectedGender;
      state.cycleEnabled = enabled;
      loadedSettings.delete("display-settings");
    }, t("پروفایل ذخیره شد."));
  });

  function open(notifications) {
    settingsSession += 1;
    loadedSettings.clear();
    settingsHomeScroll = 0;
    selectSettings(notifications ? "notification-settings" : "");
    settings.showModal();
    fitSettings();
    updateWaterPause();
  }

  return open;
}
