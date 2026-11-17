import { showFeedback } from "../../shared/ui/controls.js";
import { defaultCalendar, language, locale, selectLanguage, t } from "../../shared/i18n/locale.js";
import { $, element, fitDialogToViewport } from "../../shared/ui/dom.js";
import { integer } from "../../shared/ui/input-values.js";
import { appointmentDefaults, localZone, waterDefaults } from "../../domain/care-plan.js";
import { installTimeZonePicker, timeZoneCity } from "../../shared/ui/time-zone-picker.js";
import { accentOf, accentLabel } from "../../styles/theme.js";
import { canEnableCycle, cycleIsEnabled, finishOf, genders, ageAt, validPersonalProfile } from "../../domain/profile.js";
import { installCycleSettings } from "../cycle/settings.js";
import { sleepDefaults, sleepIsEnabled, validSleepSettings } from "../../domain/sleep.js";
import { familyPlacementOf } from "../../domain/family.js";

const numbers = new Intl.NumberFormat(locale);
const profileInputs = { firstName: "profile-first-name", lastName: "profile-last-name", birthDate: "profile-birth-date", heightCm: "profile-height", weightKg: "profile-weight" };
function clockText(value) { return value.replace(/\d/g, digit => numbers.format(Number(digit))); }

export function installSettings({ getState, mutate, refreshFields }) {
  const settingsPanels = {
    "profile-settings": [t("ui.profile"), t("ui.personal-information-and-cycle")],
    "display-settings": [t("ui.appearance-and-language"), t("ui.theme-calendar-and-app-language")],
    "notification-settings": [t("ui.notifications-on-this-device"), t("ui.medicine-water-appointment-and-routine-reminders")],
    "cycle-settings": [t("ui.cycle-tracking-settings"), t("ui.cycle-share-summary")],
    "sleep-settings": [t("ui.sleep"), t("ui.sleep-settings-subtitle")],
    "water-settings": [t("ui.water"), t("ui.daily-goal-and-reminder-times")],
    "snooze-settings": [t("ui.medication-reminder-snooze"), t("ui.medication-snooze-duration")],
    "appointment-settings": [t("ui.appointment-settings"), t("ui.appointment-settings-description")],
    "backup-settings": [t("ui.backups"), t("ui.create-or-restore-an-encrypted-backup")]
  };
  const settings = $("settings-dialog");
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  const sleepDays = Array.from({ length: 7 }, (_, index) => {
    const day = (index + (language === "fa" ? 6 : 0)) % 7;
    const input = element("input");
    input.type = "checkbox";
    input.value = String(1 << day);
    const label = element("label");
    label.append(input, " " + weekday.format(Date.UTC(2026, 10, 15 + day)));
    $("sleep-weekday-options").append(label);
    return input;
  });
  const settingsLinks = [...settings.querySelectorAll("[data-settings-panel]")];
  const loadedSettings = new Set();
  let settingsSession = 0;
  let settingsHomeScroll = 0;
  const fitSettings = fitDialogToViewport(settings);
  const snoozePresets = [...document.querySelectorAll('[name="snooze-preset"]')];
  const gender = $("profile-gender");
  const cycle = $("profile-cycle-enabled");
  const saveAppointmentSettings = $("save-appointment-settings");
  const automaticClinicZone = $("clinic-zone-automatic");
  const clinicZonePicker = installTimeZonePicker($("clinic-zone-search"), $("clinic-zone-options"), $("clinic-zone-empty"));
  function showClinicZonePicker() {
    $("clinic-zone-custom").hidden = automaticClinicZone.checked;
    if (!automaticClinicZone.checked && !clinicZonePicker.value) {
      clinicZonePicker.load(getState().clinicTimeZone, localZone() ?? "UTC", Date.now());
    }
  }
  automaticClinicZone.addEventListener("change", showClinicZonePicker);
  function updateProfileAge() {
    const age = ageAt($("profile-birth-date").value, new Date());
    $("profile-age").textContent = age === null ? "—" : t("ui.value-years-old", numbers.format(age));
  }
  $("profile-birth-date").addEventListener("input", updateProfileAge);
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
      const option = new Option(t("ui.value-min", numbers.format(value)), value);
      option.dataset.restored = "";
      select.add(option);
    }
    select.value = value;
  }
  function settingsFeedback(message = "", state = "") {
    showFeedback($("settings-status"), message, state);
  }
  function refreshSettingsHome(data) {
    $("settings-open-cycle").hidden = !cycleIsEnabled(data);
    $("settings-sleep-summary").textContent = t(sleepIsEnabled(data) ? "ui.sleep-settings-subtitle" : "ui.sleep-disabled");
    const water = data.waterReminders ?? waterDefaults;
    const waterStatus = !water.enabled ? t("ui.reminders-off") : water.pauseUntil > Date.now() ? t("ui.reminders-paused") : t("ui.reminders-on");
    $("settings-water-summary").textContent = t("ui.goal-value-ml", numbers.format(data.waterGoal ?? 2000)) + " · " + waterStatus;
    $("settings-snooze-summary").textContent = t("ui.value-min", numbers.format(data.medicationSnoozeMinutes ?? 10));
    const appointment = data.appointmentReminders ?? appointmentDefaults;
    const clinic = timeZoneCity(data.clinicTimeZone ?? localZone() ?? "UTC");
    $("settings-appointment-summary").textContent = [clinic, t("ui.from-value-value", clockText(appointment.start),
      appointment.interval === 60 ? t("ui.every-hour") : t("ui.every-two-hours"))].join(" · ");
    const theme = { system: t("ui.system"), light: t("ui.light"), dark: t("ui.dark") }[data.theme] ?? t("ui.system");
    const calendar = (data.calendar ?? defaultCalendar) === "persian" ? t("ui.solar-hijri") : t("ui.gregorian");
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
      $("settings-family-placement").value = familyPlacementOf(data.familyPlacement);
      $("app-language").value = language;
    }
    if (panel === "profile-settings") {
      for (const [key, id] of Object.entries(profileInputs)) $(id).value = data.personalProfile?.[key] ?? "";
      $("profile-birth-date").max = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      refreshFields($("profile-form"));
      updateProfileAge();
      gender.value = genders.includes(data.gender) ? data.gender : "";
      cycle.checked = cycleIsEnabled(data);
      updateCycleControl();
    }
    if (panel === "cycle-settings") loadCycle();
    if (panel === "sleep-settings") {
      const prefs = data.sleepSettings ?? sleepDefaults;
      $("sleep-enabled").checked = sleepIsEnabled(data);
      $("sleep-card-size").value = data.sleepCardSize ?? "wide";
      $("sleep-goal").value = prefs.goal ? prefs.goal / 60 : "";
      $("sleep-reminder-bed").value = prefs.bedtime;
      $("sleep-reminder-wake").value = prefs.wake;
      $("sleep-reminder-pause").checked = prefs.paused;
      for (const input of sleepDays) input.checked = Boolean(prefs.mask & Number(input.value));
      refreshFields($("sleep-settings-form"));
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
      const device = localZone() ?? "UTC";
      automaticClinicZone.checked = !data.clinicTimeZone;
      $("clinic-zone-automatic-label").textContent = t("ui.clinic-zone-follow-device-value", timeZoneCity(device));
      if (data.clinicTimeZone) clinicZonePicker.load(data.clinicTimeZone, device, Date.now());
      else $("clinic-zone-options").replaceChildren();
      showClinicZonePicker();
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
    saveAppointmentSettings.hidden = panel !== "appointment-settings";
    $("settings-back").hidden = !panel;
    $("settings-home").hidden = Boolean(panel);
    const [title, subtitle] = settingsPanels[panel] ?? [t("ui.medora-settings"), t("ui.appearance-reminders-and-data")];
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
        settingsFeedback(saved ? success : t("ui.could-not-save-try-again"), saved ? "success" : "error");
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
    $("water-reminders-pause").textContent = paused ? t("ui.resume-reminders") : t("ui.pause-for-one-hour");
    $("water-pause-status").textContent = paused
      ? t("ui.water-reminders-are-paused-until-value", new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(pauseUntil))
      : t("ui.water-reminders-resume-automatically-after-one-hour");
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
    }, paused ? t("ui.water-reminders-resumed") : t("ui.water-reminders-paused-for-one-hour"), true);
    updateWaterPause();
  });
  $("water-goal-form").addEventListener("submit", async event => {
    event.preventDefault();
    const goal = integer($("water-goal").value);
    if (!(goal >= 1 && goal <= 20000)) {
      settingsFeedback(t("ui.enter-a-water-goal-from-1-to-20-000-ml"), "error");
      $("water-goal").focus();
      return;
    }
    const enabled = $("water-reminders-enabled").checked;
    const start = $("water-reminders-start").value;
    const end = $("water-reminders-end").value;
    const interval = Number($("water-reminders-interval").value);
    const repeat = Number($("water-reminders-repeat").value);
    if (enabled && (!start || !end || start >= end)) {
      settingsFeedback(t("ui.the-end-time-must-be-after-the-start-time"), "error");
      $("water-goal-form").querySelector('[data-for="water-reminders-end"]').focus();
      return;
    }
    if (enabled && !(interval >= 15 && interval <= 240 && repeat >= 0 && repeat < interval)) {
      settingsFeedback(t("ui.the-follow-up-must-come-before-the-next-reminder"), "error");
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
    }, t("ui.water-settings-saved"), true);
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
      settingsFeedback(t("ui.enter-a-snooze-duration-from-1-to-1-440-minutes"), "error");
      $("snooze-minutes").focus();
      return;
    }
    await saveSettings(event.submitter ?? $("snooze-form").querySelector('[type="submit"]'),
      state => { state.medicationSnoozeMinutes = minutes; }, t("ui.snooze-duration-saved"));
  });
  $("appointment-settings-form").addEventListener("submit", async event => {
    event.preventDefault();
    const start = $("appointment-reminders-start").value;
    const interval = Number($("appointment-reminders-interval").value);
    const zone = automaticClinicZone.checked ? null : clinicZonePicker.value;
    if (!start || ![60, 120].includes(interval)) {
      settingsFeedback(t("ui.check-the-reminder-start-time-and-interval"), "error");
      return;
    }
    if (zone === undefined) {
      settingsFeedback(t("ui.clinic-zone-choose-city"), "error");
      $("clinic-zone-search").focus();
      return;
    }
    await saveSettings(event.submitter ?? saveAppointmentSettings,
      state => {
        state.appointmentReminders = { start, interval };
        if (zone) state.clinicTimeZone = zone;
        else delete state.clinicTimeZone;
      }, t("ui.appointment-settings-saved"), true);
  });
  $("sleep-settings-form").addEventListener("submit", async event => {
    event.preventDefault();
    const enabled = $("sleep-enabled").checked;
    const cardSize = $("sleep-card-size").value;
    const mask = sleepDays.reduce((value, input) => value | (input.checked ? Number(input.value) : 0), 0);
    const settings = { goal: Number($("sleep-goal").value) * 60, mask,
      bedtime: $("sleep-reminder-bed").value, wake: $("sleep-reminder-wake").value, paused: $("sleep-reminder-pause").checked };
    if (!validSleepSettings(settings)) {
      settingsFeedback(t("ui.sleep-check-settings"), "error");
      return;
    }
    await saveSettings(event.submitter, state => {
      state.sleepEnabled = enabled;
      state.sleepCardSize = cardSize;
      state.sleepSettings = settings;
    }, t("ui.sleep-settings-saved"), true);
  });
  $("display-form").addEventListener("submit", async event => {
    event.preventDefault();
    const theme = event.currentTarget.elements.theme.value;
    const accent = event.currentTarget.elements.accent.value;
    const finish = finishOf($("settings-finish").value);
    const familyPlacement = familyPlacementOf($("settings-family-placement").value);
    const selectedCalendar = $("calendar-setting").value;
    const nextLanguage = $("app-language").value;
    if (await saveSettings(event.submitter ?? $("display-form").querySelector('[type="submit"]'),
      state => {
        state.theme = theme;
        state.accent = accentOf(accent, cycleIsEnabled(state));
        state.calendar = selectedCalendar;
        state.finish = finish;
        state.familyPlacement = familyPlacement;
      }, t("ui.display-settings-saved"))) selectLanguage(nextLanguage);
  });
  gender.addEventListener("change", updateCycleControl);
  $("profile-form").addEventListener("submit", async event => {
    event.preventDefault();
    const profile = Object.fromEntries(Object.entries(profileInputs).flatMap(([key, id]) => {
      const input = $(id);
      const value = input.value.trim();
      return value ? [[key, input.type === "number" ? input.valueAsNumber : value]] : [];
    }));
    if (!validPersonalProfile(profile)) {
      settingsFeedback(t("ui.check-your-name-date-of-birth-height-and-weight"), "error");
      return;
    }
    const selectedGender = genders.includes(gender.value) ? gender.value : "";
    const enabled = cycle.checked && canEnableCycle({ gender: selectedGender });
    await saveSettings(event.submitter ?? $("profile-form").querySelector('[type="submit"]'), state => {
      state.personalProfile = profile;
      state.gender = selectedGender;
      state.cycleEnabled = enabled;
      loadedSettings.delete("display-settings");
    }, t("ui.profile-saved"), true);
  });

  const loadCycle = installCycleSettings({ getState, saveSettings, refreshFields, mutate });

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
