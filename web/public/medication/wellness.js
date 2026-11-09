import { defaultCalendar, listSeparator, locale, shortWeek, t, weekIndex } from "./locale.js";
import { appointmentDefaults, appointmentOffsets, localZone, visitInstant, waterDefaults } from "./care-plan.js";
import { localWall, timezone } from "./wall-clock.js";

const $ = id => document.getElementById(id);
const dayMs = 86_400_000;
const numbers = new Intl.NumberFormat(locale);
const titles = { today: t("امروز"), medications: t("داروها"), appointments: t("قرارها"), insights: t("گزارش و تقویم"), water: t("آب") };
const iso = day => new Date(day * dayMs).toISOString().slice(0, 10);
const minutes = value => {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
};

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(text, click) {
  const node = element("button", text, "secondary");
  node.type = "button";
  node.addEventListener("click", click);
  return node;
}
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

export function wellness({ getState, selectedDay, today, render, mutate, requestDeletion, scheduledDoses, renderDose, refreshFields }) {
  let screen = "today";
  let mainScreen = "today";
  let editingVisit = null;
  let editingWater = null;
  let visitFilter = "all";
  let insight = "calendar";
  let calendarSelection = today();
  let calendarMonth = calendarSelection;
  let reportSpan = 30;
  let calendar;
  let weekdayText;
  let shortDate;
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
    $("day").value = iso(day);
    render();
    if (restoreFocus) $(restoreFocus).querySelector('[aria-current="date"]')?.focus();
  }
  const settingsPanels = {
    "display-settings": t("زبان و تقویم"),
    "notification-settings": t("اعلان‌ها"),
    "water-settings": t("آب"),
    "snooze-settings": t("دارو"),
    "appointment-settings": t("قرارها"),
    "backup-settings": t("پشتیبان‌گیری")
  };
  let waterPauseUntil = 0;
  const settings = $("settings-dialog");
  function fitSettings() {
    const viewport = window.visualViewport;
    if (!settings.open || !viewport) return;
    const zoomed = viewport.scale !== 1;
    settings.style.setProperty("--settings-visible-height", `${zoomed ? window.innerHeight : viewport.height}px`);
    settings.style.setProperty("--settings-visible-top", `${zoomed ? 0 : viewport.offsetTop}px`);
  }
  window.visualViewport?.addEventListener("resize", fitSettings);
  window.visualViewport?.addEventListener("scroll", fitSettings);
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
  function selectSettings(panel) {
    settings.dataset.panel = panel || "";
    $("settings-mark").toggleAttribute("hidden", Boolean(panel));
    $("settings-back").hidden = !panel;
    $("settings-subtitle").textContent = settingsPanels[panel] ?? t("یادآوری‌ها مطابق برنامهٔ روزانهٔ شما");
    $("settings-status").textContent = "";
    for (const id of Object.keys(settingsPanels)) $(id).open = panel === id;
    const data = getState();
    if (panel === "display-settings") {
      $("calendar-setting").value = data.calendar ?? defaultCalendar;
      $("theme-setting").value = data.theme ?? "system";
    }
    if (panel === "backup-settings") $("android-restore").reset();
    if (panel === "water-settings") {
      const water = data.waterReminders ?? waterDefaults;
      $("water-goal").value = data.waterGoal ?? 2000;
      $("water-reminders-enabled").checked = water.enabled;
      $("water-reminder-fields").hidden = !water.enabled;
      $("water-reminders-start").value = water.start;
      $("water-reminders-end").value = water.end;
      setOption("water-reminders-interval", water.interval);
      setOption("water-reminders-repeat", water.repeat);
      waterPauseUntil = water.pauseUntil;
      updateWaterPause();
      refreshFields($("water-goal-form"));
    }
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
    $("settings-content").scrollTop = 0;
  }
  for (const id of Object.keys(settingsPanels)) {
    $(id).querySelector("summary").addEventListener("click", event => {
      event.preventDefault();
      selectSettings(id);
      $("settings-back").focus({ preventScroll: true });
    });
  }
  $("settings-back").addEventListener("click", () => {
    const selected = $("settings-dialog").dataset.panel;
    selectSettings();
    $(selected)?.querySelector("summary").focus();
  });
  settings.addEventListener("close", () => $("android-restore").reset());
  function show(destination, notifications = false) {
    if (destination === "settings") {
      selectSettings(notifications ? "notification-settings" : null);
      settings.showModal();
      fitSettings();
      return;
    }
    if (!Object.hasOwn(titles, destination)) return;
    if (destination === "water") $("day").value = iso(today());
    if (destination === "insights") {
      calendarMonth = calendarSelection = today();
      openInsight("calendar");
    }
    if (!["water", "insights"].includes(destination)) mainScreen = destination;
    screen = destination;
    const dayControls = $("day-controls");
    if (screen === "medications") $("med-day-title").after(dayControls);
    else if (screen === "water") document.querySelector('[data-screen="water"]').prepend(dayControls);
    else $("today-dates").append(dayControls);
    $("today-story").hidden = screen !== "today";
    $("app").dataset.activeScreen = screen;
    for (const view of document.querySelectorAll("[data-screen]")) view.hidden = view.dataset.screen !== screen;
    for (const item of document.querySelectorAll(".dock [data-destination]")) {
      if (item.dataset.destination === (screen === "water" ? "today" : screen)) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    }
    $("screen-title").textContent = titles[screen];
    $("screen-back").hidden = !["water", "insights"].includes(screen);
    document.querySelector(".brand-mark").hidden = !$("screen-back").hidden;
    dayControls.hidden = !["today", "water", "medications"].includes(screen);
    dayControls.classList.toggle("single-date", screen !== "today");
    render();
    scrollTo(0, 0);
  }
  $("screen-back").addEventListener("click", () => show(mainScreen));
  for (const button of document.querySelectorAll("[data-destination]")) {
    button.addEventListener("click", () => show(button.dataset.destination, button.hasAttribute("data-open-notifications")));
  }
  for (const [id, delta] of [["previous-day", -1], ["next-day", 1]]) {
    $(id).addEventListener("click", () => {
      chooseDay(selectedDay() + delta);
    });
  }

  function addWater(amount, day = selectedDay(), time = localClock(), id = null) {
    if (!Number.isInteger(amount) || amount < 1 || amount > 10000 || !Number.isInteger(day) || day > today()) {
      $("water-error").textContent = day > today() ? t("برای روز آینده نمی‌شود آب ثبت کرد.") : t("مقدار آب باید از ۱ تا ۱۰٬۰۰۰ میلی‌لیتر باشد.");
      return false;
    }
    const entry = { id: id ?? crypto.randomUUID(), day, time, amount };
    return mutate(state => {
      const list = state.water ??= [];
      const index = list.findIndex(item => item.id === entry.id);
      if (index >= 0) list[index] = entry;
      else if (id) throw new Error(t("این ثبت آب حذف شده است."));
      else list.push(entry);
    }, t("آب ثبت شد."), true);
  }
  for (const button of document.querySelectorAll("[data-water-add]")) {
    button.addEventListener("click", () => addWater(Number(button.dataset.waterAdd)));
  }
  function updateWaterSelection() {
    const value = integer($("water-amount").value);
    $("water-selection").textContent = Number.isFinite(value) ? t("{0} میلی‌لیتر", numbers.format(value)) : "";
    for (const control of document.querySelectorAll("[data-water-preset]")) {
      control.setAttribute("aria-pressed", String(Number(control.dataset.waterPreset) === value));
    }
  }
  function openWater(entry, custom = false) {
    editingWater = entry?.id ?? null;
    $("water-dialog-title").textContent = entry ? t("ویرایش ثبت آب") : t("ثبت آب");
    $("water-amount").value = entry?.amount ?? "250";
    $("water-log-day").value = iso(entry?.day ?? selectedDay());
    $("water-log-day").max = iso(today());
    $("water-log-time").value = entry?.time ?? localClock();
    $("water-error").textContent = "";
    $("water-options").open = Boolean(entry || custom);
    updateWaterSelection();
    refreshFields($("water-dialog"));
    $("water-dialog").showModal();
  }
  for (const control of document.querySelectorAll("[data-open-water]")) {
    control.addEventListener("click", () => openWater(null, control.id === "water-custom-action"));
  }
  $("water-custom-preset").addEventListener("click", () => {
    $("water-options").open = true;
    $("water-amount").focus();
    $("water-amount").select();
  });
  $("water-amount").addEventListener("input", updateWaterSelection);
  for (const control of document.querySelectorAll("[data-water-preset]")) control.addEventListener("click", () => {
    $("water-amount").value = control.dataset.waterPreset;
    $("water-error").textContent = "";
    updateWaterSelection();
  });
  $("water-custom").addEventListener("submit", async event => {
    event.preventDefault();
    const value = integer($("water-amount").value);
    const day = Date.parse(`${$("water-log-day").value}T00:00:00Z`) / dayMs;
    if (await addWater(value, day, $("water-log-time").value, editingWater)) $("water-dialog").close();
    else if (!$("water-error").textContent) $("water-error").textContent = $("status").textContent;
  });
  function updateWaterPause() {
    $("water-reminders-pause").textContent = waterPauseUntil > Date.now() ? t("ازسرگیری یادآوری") : t("توقف برای یک ساعت");
  }
  $("water-reminders-enabled").addEventListener("change", () => {
    $("water-reminder-fields").hidden = !$("water-reminders-enabled").checked;
  });
  $("water-reminders-pause").addEventListener("click", () => {
    waterPauseUntil = waterPauseUntil > Date.now() ? 0 : Date.now() + 3_600_000;
    updateWaterPause();
  });
  $("water-goal-form").addEventListener("submit", async event => {
    event.preventDefault();
    const goal = integer($("water-goal").value);
    if (!(goal >= 1 && goal <= 20000)) {
      $("settings-status").textContent = t("هدف آب باید از ۱ تا ۲۰٬۰۰۰ میلی‌لیتر باشد.");
      return;
    }
    const start = $("water-reminders-start").value;
    const end = $("water-reminders-end").value;
    const interval = Number($("water-reminders-interval").value);
    const repeat = Number($("water-reminders-repeat").value);
    if (!start || !end || start >= end || repeat >= interval) {
      $("settings-status").textContent = t("شروع باید قبل از پایان باشد و تکرار از فاصلهٔ یادآوری کمتر باشد.");
      return;
    }
    await mutate(state => {
      state.waterGoal = goal;
      state.waterReminders = { start, end, interval, repeat, pauseUntil: waterPauseUntil, enabled: $("water-reminders-enabled").checked };
    }, t("تنظیمات آب ذخیره شد."), true);
    $("settings-status").textContent = $("status").textContent;
  });
  for (const control of snoozePresets) control.addEventListener("change", () => {
    $("snooze-custom-row").hidden = control.value !== "custom";
  });
  $("snooze-form").addEventListener("submit", async event => {
    event.preventDefault();
    const choice = snoozePresets.find(control => control.checked).value;
    const minutes = integer(choice === "custom" ? $("snooze-minutes").value : choice);
    if (!(minutes >= 1 && minutes <= 1440)) {
      $("settings-status").textContent = t("مدت تعویق باید از ۱ تا ۱٬۴۴۰ دقیقه باشد.");
      return;
    }
    await mutate(state => { state.medicationSnoozeMinutes = minutes; }, t("مدت تعویق ذخیره شد."));
    $("settings-status").textContent = $("status").textContent;
  });
  $("appointment-settings-form").addEventListener("submit", async event => {
    event.preventDefault();
    const start = $("appointment-reminders-start").value;
    const interval = Number($("appointment-reminders-interval").value);
    await mutate(state => { state.appointmentReminders = { start, interval }; }, t("تنظیمات قرار ذخیره شد."), true);
    $("settings-status").textContent = $("status").textContent;
  });
  $("display-form").addEventListener("submit", async event => {
    event.preventDefault();
    const theme = $("theme-setting").value;
    const selectedCalendar = $("calendar-setting").value;
    await mutate(state => { state.theme = theme; state.calendar = selectedCalendar; }, t("تنظیمات نمایش ذخیره شد."));
    $("settings-status").textContent = $("status").textContent;
  });

  function openVisit(visit, date = selectedDay()) {
    editingVisit = visit?.id ?? null;
    $("delete-edited-visit").hidden = !visit;
    $("visit-form-title").textContent = visit ? t("ویرایش قرار") : t("قرار جدید");
    $("visit-name").value = visit?.name ?? "";
    $("visit-day").value = iso(visit?.day ?? date);
    $("visit-time").value = visit?.time ?? localClock();
    $("visit-place").value = visit?.place ?? "";
    $("visit-note").value = visit?.note ?? "";
    $("visit-contact").value = visit?.contact ?? "";
    $("visit-zone").value = visit?.zone ?? localZone();
    $("visit-editor").querySelector("details").open = Boolean(visit?.note || visit?.contact || visit?.zone && visit.zone !== localZone());
    for (const field of visitOffsetFields) field.checked = (visit?.offsets ?? [60]).includes(Number(field.value));
    const preferences = getState().appointmentReminders ?? appointmentDefaults;
    $("visit-reminder-summary").textContent = t("از ساعت {0} روز قرار، هر {1} ساعت تا زمان قرار یادآوری می‌کنیم.", clockText(preferences.start), numbers.format(preferences.interval / 60));
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
  $("visit-editor").addEventListener("submit", async event => {
    event.preventDefault();
    const name = $("visit-name").value.trim();
    const day = Date.parse(`${$("visit-day").value}T00:00:00Z`) / dayMs;
    const time = $("visit-time").value;
    if (!name || !Number.isInteger(day) || !/^\d{2}:\d{2}$/.test(time)) {
      $("visit-error").textContent = t("عنوان، تاریخ و ساعت قرار را کامل کنید.");
      return;
    }
    const id = editingVisit ?? crypto.randomUUID();
    const place = $("visit-place").value.trim();
    const note = $("visit-note").value.trim();
    const contact = $("visit-contact").value.trim();
    const zone = $("visit-zone").value.trim() || localZone();
    try { timezone(zone); } catch {
      $("visit-editor").querySelector("details").open = true;
      $("visit-error").textContent = t("منطقهٔ زمانی مطب را به‌شکل Asia/Tehran وارد کنید.");
      return;
    }
    if (await mutate(state => {
      const visits = state.visits ??= {};
      if (editingVisit && !visits[id]) throw new Error(t("این قرار حذف شده است."));
      const offsets = [...(visits[id]?.offsets ?? []).filter(offset => !appointmentOffsets.includes(offset)),
        ...visitOffsetFields.filter(field => field.checked).map(field => Number(field.value))];
      visits[id] = { id, name, day, time, place, note, contact, zone, offsets, cancelled: visits[id]?.cancelled ?? false };
    }, t("قرار ذخیره شد."), true)) $("visit-dialog").close();
    else $("visit-error").textContent = $("status").textContent;
  });

  function displayVisit(visit) {
    const zone = localZone();
    const instant = visitInstant(visit, zone);
    const wall = localWall(instant, timezone(zone));
    return { day: Math.floor(wall / dayMs), time: new Date(wall).toISOString().slice(11, 16), instant };
  }
  function visitCard(visit, actionable = false) {
    const card = element("article", "", "visit");
    const title = element("h3", visit.name, "visit-title");
    title.dir = "auto";
    const local = displayVisit(visit);
    card.append(title, element("p", `${shortDate.format(local.day * dayMs)} · ${clockText(local.time)}`));
    if (visit.zone && visit.zone !== localZone()) {
      card.append(element("p", t("ساعت مطب {0}، {1} ({2})", formatDay(visit.day), clockText(visit.time), visit.zone), "quiet"));
    }
    if (visit.place) card.append(element("p", t("مکان: {0}", visit.place), "quiet"));
    if (visit.cancelled) card.append(element("p", t("قرار لغو شده"), "badge"));
    if (visit.note) card.append(element("p", visit.note));
    if (visit.contact) card.append(element("p", t("تماس: {0}", visit.contact), "quiet"));
    if (actionable) {
      const controls = element("div", "", "buttons");
      controls.append(button(t("ویرایش"), () => openVisit(visit)), button(visit.cancelled ? t("فعال‌کردن قرار") : t("لغو قرار"), () => {
        void mutate(state => {
          const saved = state.visits[visit.id];
          if (saved) saved.cancelled = !saved.cancelled;
        }, t("وضعیت قرار ذخیره شد."), true);
      }));
      const remove = button(t("حذف قرار"), () => deleteVisit(visit.id));
      remove.className = "text-button danger-link";
      controls.append(remove);
      card.append(controls);
    }
    return card;
  }

  function dayVisits(state, day) {
    return Object.values(state.visits ?? {}).filter(visit => !visit.cancelled)
      .map(visit => ({ visit, local: displayVisit(visit) }))
      .filter(({ local }) => local.day === day)
      .map(({ visit, local }) => ({ minute: minutes(local.time), card: visitCard(visit, day <= today()) }));
  }

  function renderVisits(state) {
    const now = Date.now();
    const visits = Object.values(state.visits ?? {}).map(visit => ({ visit, at: displayVisit(visit).instant })).sort((a, b) => a.at - b.at);
    const upcoming = visits.filter(({ visit, at }) => !visit.cancelled && at >= now).map(({ visit }) => visit);
    const past = visits.filter(({ visit, at }) => visit.cancelled || at < now).reverse().map(({ visit }) => visit);
    const content = [];
    if (upcoming.length && visitFilter !== "past") {
      content.push(element("h2", t("نزدیک‌ترین قرار")), ...upcoming.map(visit => visitCard(visit, true)));
    }
    if (past.length && visitFilter !== "upcoming") {
      if (visitFilter === "all") content.push(element("h2", t("گذشته و لغوشده")));
      content.push(...past.map(visit => visitCard(visit, true)));
    }
    $("visits").replaceChildren(...(content.length ? content : [empty(t("در این بخش قراری ندارید."))]));
  }

  function dateButton(day, selected, choose) {
    const control = button(dayText.format(day * dayMs), () => choose(day));
    control.setAttribute("aria-label", formatDay(day, true));
    if (day === selected) control.setAttribute("aria-current", "date");
    return control;
  }

  function monthStart(day) {
    return day - Number(dayIndex.formatToParts(day * dayMs).find(part => part.type === "day").value) + 1;
  }

  function renderCalendar(state, totals) {
    const day = calendarSelection;
    const start = monthStart(calendarMonth);
    const month = monthText.format(start * dayMs);
    const slots = shortWeek.map(label => element("span", label, "quiet"));
    for (let offset = 0; offset < weekIndex(start); offset++) slots.push(element("span"));
    const visits = Object.values(state.visits ?? {}).filter(visit => !visit.cancelled);
    const visitDays = new Set(visits.map(visit => displayVisit(visit).day));
    for (let date = start; monthText.format(date * dayMs) === month; date++) {
      const control = dateButton(date, day, selected => {
        calendarSelection = selected;
        render();
        $("calendar-days").querySelector('[aria-current="date"]')?.focus();
      });
      const dots = element("span", "", "calendar-dots");
      dots.setAttribute("aria-hidden", "true");
      for (const [exists, kind, label] of [
        [totals.has(date), "water", t("ثبت آب")], [scheduledDoses(state, date).length, "medicine", t("نوبت دارو")], [visitDays.has(date), "visit", t("قرار پزشکی")]
      ]) if (exists) {
        dots.append(element("i", "", kind));
        control.setAttribute("aria-label", control.getAttribute("aria-label") + listSeparator + label);
      }
      control.append(dots);
      slots.push(control);
    }
    $("calendar-month").textContent = month;
    $("calendar-days").replaceChildren(...slots);
    const entries = [
      ...(totals.has(day) ? [element("article", t("{0} میلی‌لیتر آب", numbers.format(totals.get(day))), "water")] : []),
      ...scheduledDoses(state, day).map(dose => renderDose(state.medicines[dose.medicineId], dose)),
      ...Object.values(state.visits ?? {}).filter(visit => displayVisit(visit).day === day).map(visit => visitCard(visit, true))
    ];
    const add = button(t("قرار جدید"), () => openVisit(null, day));
    add.className = "block-action";
    $("calendar-activity").replaceChildren(element("h2", formatDay(day, true)),
      ...(entries.length ? entries : [empty(t("فعالیتی ثبت نشده است."))]), add);
  }

  function renderReports(day, goal, totals, doses) {
    const last = Math.min(day, today());
    const first = last - reportSpan + 1;
    const range = Array.from({ length: reportSpan }, (_, i) => totals.get(first + i) ?? 0);
    const average = range.reduce((sum, amount) => sum + amount, 0) / reportSpan;
    const recorded = doses.filter(dose => dose.day >= first && dose.day <= last);
    const taken = recorded.filter(dose => dose.status === "taken").length;
    $("report-dates").textContent = t("از {0} تا {1}", shortDate.format(first * dayMs), shortDate.format(last * dayMs));
    $("report-average").textContent = t("میانگین روزانه {0} میلی‌لیتر", numbers.format(Math.round(average)));
    $("report-doses").textContent = t("{0} از {1} نوبت ثبت‌شده، مصرف شد.", numbers.format(taken), numbers.format(recorded.length));
    const bucketSize = reportSpan === 365 ? 30 : 1;
    const bars = [];
    for (let i = 0; i < range.length; i += bucketSize) {
      const group = range.slice(i, i + bucketSize);
      bars.push(group.reduce((sum, amount) => sum + amount, 0) / group.length);
    }
    const max = Math.max(goal, ...bars);
    const chart = $("report-chart");
    chart.setAttribute("aria-label", t("نمودار مصرف آب؛ {0}", $("report-average").textContent));
    chart.style.setProperty("--goal", `${goal / max * 100}%`);
    chart.replaceChildren(...bars.map((value, i) => {
      const bar = element("div");
      bar.style.setProperty("--bar", `${value / max * 100}%`);
      bar.title = t("{0} · {1} میلی‌لیتر", shortDate.format((first + i * bucketSize) * dayMs), numbers.format(Math.round(value)));
      return bar;
    }));
    $("report-chart-dates").replaceChildren(element("span", shortDate.format(first * dayMs)), element("span", shortDate.format(last * dayMs)));
  }

  function renderWellness(state, day) {
    setCalendar(state.calendar ?? defaultCalendar);
    document.body.dataset.theme = state.theme ?? "system";
    const dark = state.theme === "dark" || (state.theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.querySelector('meta[name="theme-color"]').content = dark ? "#151b20" : "#f4f3fa";
    const totals = new Map();
    for (const entry of state.water ?? []) totals.set(entry.day, (totals.get(entry.day) ?? 0) + entry.amount);
    const total = totals.get(day) ?? 0;
    const goal = state.waterGoal ?? 2000;
    const future = day > today();
    const progress = Math.min(1, total / goal);
    $("day-label").textContent = screen === "today" ? monthText.format(day * dayMs) : day === today() ? t("امروز") : formatDay(day);
    $("pick-day").setAttribute("aria-label", t("انتخاب تاریخ، {0}", formatDay(day, true)));
    if (screen === "today") {
      const visitDays = new Set(Object.values(state.visits ?? {}).filter(visit => !visit.cancelled).map(visit => displayVisit(visit).day));
      $("day-week").replaceChildren(...Array.from({ length: 7 }, (_, index) => {
        const date = day - 3 + index;
        const control = dateButton(date, day, selected => chooseDay(selected, "day-week"));
        const marks = element("span", "", "calendar-dots");
        marks.setAttribute("aria-hidden", "true");
        if (scheduledDoses(state, date).length) marks.append(element("i", "", "medicine"));
        if (visitDays.has(date)) marks.append(element("i", "", "visit"));
        if (totals.has(date)) marks.append(element("i", "", "water"));
        control.append(element("span", shortWeek[weekIndex(date)]), marks);
        return control;
      }));
    }
    $("header-date").textContent = screen === "today" ? formatDay(day, true) : "";
    $("today-water").hidden = future;
    $("future-schedule").hidden = !future;
    $("open-water-history").hidden = future;
    $("today-actions").hidden = future;
    $("water-custom-action").hidden = future;
    $("today-water-label").textContent = day === today() ? t("مصرف آب امروز") : t("مصرف آب این روز");
    $("water-entry").hidden = future;
    $("today-water-total").textContent = numbers.format(total);
    $("today-water-goal").textContent = numbers.format(goal);
    $("today-water-remaining").textContent = total >= goal ? t("هدف این روز کامل شد.") : t("{0} میلی‌لیتر تا هدف", numbers.format(goal - total));
    $("today-water-progress").value = progress;
    $("water-progress").value = progress;
    $("water-date").textContent = day === today() ? t("امروز") : shortDate.format(day * dayMs);
    $("water-total").textContent = numbers.format(total);
    $("water-goal-label").textContent = numbers.format(goal);
    $("water-remaining").textContent = $("today-water-remaining").textContent;
    const level = 90 - 78 * progress;
    for (const glass of document.querySelectorAll(".glass-water")) {
      glass.setAttribute("d", progress ? `M0 ${level}C30 ${level - 7} 65 ${level + 8} 100 ${level}V100H0Z` : "");
    }

    if (screen === "water") {
      const entries = (state.water ?? []).filter(entry => entry.day === day).reverse();
      $("water-entries").replaceChildren(...(entries.length ? entries.map(entry => {
        const row = element("article", "", "entry-row");
        row.append(element("span", t("{0} میلی‌لیتر · {1}", numbers.format(entry.amount), clockText(entry.time))), button(t("ویرایش"), () => openWater(entry)),
          button(t("حذف ثبت"), () => {
            if (confirm(t("این ثبت آب حذف شود؟"))) void mutate(data => { data.water = data.water.filter(item => item.id !== entry.id); },
              t("ثبت آب حذف شد."), true);
          }));
        return row;
      }) : [empty(t("برای این روز آبی ثبت نشده است."))]));
    }

    if (screen === "appointments") renderVisits(state);

    if (screen === "insights") {
      const doses = Object.values(state.doses).filter(dose => dose.status === "taken" || dose.status === "skipped");
      if (insight === "calendar") renderCalendar(state, totals);
      else renderReports(today(), goal, totals, doses);
    }
  }

  function chooseOption(attribute, change) {
    const options = document.querySelectorAll(`[data-${attribute}]`);
    for (const option of options) option.addEventListener("click", () => {
      for (const item of options) item.setAttribute("aria-pressed", String(item === option));
      change(option.getAttribute(`data-${attribute}`));
      renderWellness(getState(), selectedDay());
    });
  }
  chooseOption("visit-filter", value => { visitFilter = value; });
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
    dayVisits, renderWellness, monthStart, chooseDay, show,
    formatDay,
    formatMonth: day => monthText.format(day * dayMs),
    formatDayNumber: day => dayText.format(day * dayMs),
    dateLimit: () => screen === "water" ? today() : Infinity
  };
}
