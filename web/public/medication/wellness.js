const $ = id => document.getElementById(id);
const dayMs = 86_400_000;
const numbers = new Intl.NumberFormat("fa-IR");
const titles = { today: "امروز", medications: "داروها", appointments: "قرارها", insights: "گزارش و تقویم", water: "آب" };
const week = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
const iso = day => new Date(day * dayMs).toISOString().slice(0, 10);
const weekIndex = day => (new Date(day * dayMs).getUTCDay() + 1) % 7;
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

export function wellness({ getState, selectedDay, today, render, mutate }) {
  let screen = "today";
  let editingVisit = null;
  let editingWater = null;
  let visitFilter = "all";
  let insight = "calendar";
  let reportSpan = 30;
  let calendar;
  let dateText;
  let shortDate;
  let monthText;
  let dayText;
  let dayIndex;

  function setCalendar(next) {
    if (next === calendar) return;
    calendar = next;
    const format = options => new Intl.DateTimeFormat(`fa-IR-u-ca-${calendar}`, { ...options, timeZone: "UTC" });
    dateText = format({ dateStyle: "full" });
    shortDate = format({ day: "numeric", month: "short" });
    monthText = format({ month: "long", year: "numeric" });
    dayText = format({ day: "numeric" });
    dayIndex = new Intl.DateTimeFormat(`en-u-ca-${calendar}-nu-latn`, { day: "numeric", timeZone: "UTC" });
  }
  function chooseDay(day, restoreFocus) {
    $("day").value = iso(day);
    render();
    if (restoreFocus) $(restoreFocus).querySelector('[aria-current="date"]')?.focus();
  }
  function show(destination, notifications = false) {
    if (destination === "settings") {
      $("settings-status").textContent = "";
      $("notification-settings").open = notifications;
      $("settings-dialog").showModal();
      return;
    }
    if (!Object.hasOwn(titles, destination)) return;
    screen = destination;
    const dayControls = $("day-controls");
    const plansHeading = $("plans-heading");
    if (screen === "medications") plansHeading.after(dayControls);
    else $("app").prepend(dayControls);
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
  $("screen-back").addEventListener("click", () => show("today"));
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
      $("water-error").textContent = day > today() ? "برای روز آینده نمی‌شود آب ثبت کرد." : "مقدار آب باید از ۱ تا ۱۰٬۰۰۰ میلی‌لیتر باشد.";
      return false;
    }
    const entry = { id: id ?? crypto.randomUUID(), day, time, amount };
    return mutate(state => {
      const list = state.water ??= [];
      const index = list.findIndex(item => item.id === entry.id);
      if (index >= 0) list[index] = entry;
      else if (id) throw new Error("این ثبت آب حذف شده است.");
      else list.push(entry);
    }, "آب ثبت شد.");
  }
  for (const button of document.querySelectorAll("[data-water-add]")) {
    button.addEventListener("click", () => addWater(Number(button.dataset.waterAdd)));
  }
  function updateWaterSelection() {
    const value = integer($("water-amount").value);
    $("water-selection").textContent = Number.isFinite(value) ? `${numbers.format(value)} میلی‌لیتر` : "";
    for (const control of document.querySelectorAll("[data-water-preset]")) {
      control.setAttribute("aria-pressed", String(Number(control.dataset.waterPreset) === value));
    }
  }
  function openWater(entry, custom = false) {
    editingWater = entry?.id ?? null;
    $("water-dialog-title").textContent = entry ? "ویرایش ثبت آب" : "ثبت آب";
    $("water-amount").value = entry?.amount ?? "250";
    $("water-log-day").value = iso(entry?.day ?? selectedDay());
    $("water-log-day").max = iso(today());
    $("water-log-time").value = entry?.time ?? localClock();
    $("water-error").textContent = "";
    $("water-options").open = Boolean(entry || custom);
    updateWaterSelection();
    $("water-dialog").showModal();
  }
  for (const control of document.querySelectorAll("[data-open-water]")) {
    control.addEventListener("click", () => openWater(null, control.id === "water-custom-action"));
  }
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
  $("water-goal-form").addEventListener("submit", async event => {
    event.preventDefault();
    const goal = integer($("water-goal").value);
    if (!(goal >= 1 && goal <= 20000)) {
      $("settings-status").textContent = "هدف آب باید از ۱ تا ۲۰٬۰۰۰ میلی‌لیتر باشد.";
      return;
    }
    await mutate(state => { state.waterGoal = goal; }, "هدف آب ذخیره شد.");
    $("settings-status").textContent = $("status").textContent;
  });
  $("display-form").addEventListener("submit", async event => {
    event.preventDefault();
    const theme = $("theme-setting").value;
    const selectedCalendar = $("calendar-setting").value;
    await mutate(state => { state.theme = theme; state.calendar = selectedCalendar; }, "تنظیمات نمایش ذخیره شد.");
    $("settings-status").textContent = $("status").textContent;
  });

  function openVisit(visit) {
    editingVisit = visit?.id ?? null;
    $("visit-form-title").textContent = visit ? "ویرایش قرار" : "قرار جدید";
    $("visit-name").value = visit?.name ?? "";
    $("visit-day").value = iso(visit?.day ?? selectedDay());
    $("visit-time").value = visit?.time ?? localClock();
    $("visit-place").value = visit?.place ?? "";
    $("visit-note").value = visit?.note ?? "";
    $("visit-editor").querySelector("details").open = Boolean(visit?.note);
    $("visit-error").textContent = "";
    $("visit-dialog").showModal();
  }
  for (const control of document.querySelectorAll("[data-open-visit]")) control.addEventListener("click", () => openVisit());
  $("visit-editor").addEventListener("submit", async event => {
    event.preventDefault();
    const name = $("visit-name").value.trim();
    const day = Date.parse(`${$("visit-day").value}T00:00:00Z`) / dayMs;
    const time = $("visit-time").value;
    if (!name || !Number.isInteger(day) || !/^\d{2}:\d{2}$/.test(time)) {
      $("visit-error").textContent = "عنوان، تاریخ و ساعت قرار را کامل کنید.";
      return;
    }
    const id = editingVisit ?? crypto.randomUUID();
    const place = $("visit-place").value.trim();
    const note = $("visit-note").value.trim();
    if (await mutate(state => {
      const visits = state.visits ??= {};
      if (editingVisit && !visits[id]) throw new Error("این قرار حذف شده است.");
      visits[id] = { id, name, day, time, place, note, cancelled: visits[id]?.cancelled ?? false };
    }, "قرار ذخیره شد.")) $("visit-dialog").close();
    else $("visit-error").textContent = $("status").textContent;
  });

  function visitCard(visit, details = false) {
    const card = element("article", "", "visit");
    const title = element("h3", visit.name, "visit-title");
    title.dir = "auto";
    card.append(title, element("p", `${shortDate.format(visit.day * dayMs)} · ${clockText(visit.time)}`));
    if (visit.place) card.append(element("p", visit.place, "quiet"));
    if (visit.cancelled) card.append(element("p", "قرار لغو شده", "badge"));
    if (details) {
      if (visit.note) card.append(element("p", visit.note));
      const controls = element("div", "", "buttons");
      controls.append(button("ویرایش", () => openVisit(visit)), button(visit.cancelled ? "فعال‌کردن قرار" : "لغو قرار", () => {
        void mutate(state => {
          const saved = state.visits[visit.id];
          if (saved) saved.cancelled = !saved.cancelled;
        }, "وضعیت قرار ذخیره شد.");
      }), button("حذف", () => {
        if (confirm("این قرار حذف شود؟")) void mutate(state => { delete state.visits[visit.id]; }, "قرار حذف شد.");
      }));
      card.append(controls);
    }
    return card;
  }

  function dayVisits(state, day) {
    return Object.values(state.visits ?? {}).filter(visit => visit.day === day && !visit.cancelled)
      .map(visit => ({ minute: minutes(visit.time), card: visitCard(visit) }));
  }

  function renderVisits(state) {
    const now = localClock();
    const visits = Object.values(state.visits ?? {}).sort((a, b) => a.day - b.day || minutes(a.time) - minutes(b.time));
    const upcoming = visits.filter(visit => !visit.cancelled && (visit.day > today() || (visit.day === today() && visit.time >= now)));
    const past = visits.filter(visit => !upcoming.includes(visit)).reverse();
    const content = [];
    if (upcoming.length && visitFilter !== "past") {
      content.push(element("h2", "نزدیک‌ترین قرار"), visitCard(upcoming[0], true));
      if (upcoming.length > 1) content.push(element("h2", "قرارهای پیش‌رو"), ...upcoming.slice(1).map(visit => visitCard(visit, true)));
    }
    if (past.length && visitFilter !== "upcoming") content.push(element("h2", "گذشته و لغوشده"), ...past.map(visit => visitCard(visit, true)));
    $("visits").replaceChildren(...(content.length ? content : [empty("در این بخش قراری ندارید.")]));
  }

  function dateButton(day, selected, container) {
    const control = button(dayText.format(day * dayMs), () => chooseDay(day, container));
    control.setAttribute("aria-label", dateText.format(day * dayMs));
    if (day === selected) control.setAttribute("aria-current", "date");
    return control;
  }

  function monthStart(day) {
    return day - Number(dayIndex.formatToParts(day * dayMs).find(part => part.type === "day").value) + 1;
  }

  function renderCalendar(state, day, totals, doses) {
    const start = monthStart(day);
    const month = monthText.format(start * dayMs);
    const slots = week.map(label => element("span", label, "quiet"));
    for (let offset = 0; offset < weekIndex(start); offset++) slots.push(element("span"));
    const visits = Object.values(state.visits ?? {}).filter(visit => !visit.cancelled);
    const visitDays = new Set(visits.map(visit => visit.day));
    const doseDays = new Set(doses.map(dose => dose.day));
    for (let date = start; monthText.format(date * dayMs) === month; date++) {
      const control = dateButton(date, day, "calendar-days");
      const dots = element("span", "", "calendar-dots");
      dots.setAttribute("aria-hidden", "true");
      for (const [exists, kind, label] of [
        [totals.has(date), "water", "ثبت آب"], [doseDays.has(date), "medicine", "ثبت دارو"], [visitDays.has(date), "visit", "قرار پزشکی"]
      ]) if (exists) {
        dots.append(element("i", "", kind));
        control.setAttribute("aria-label", `${control.getAttribute("aria-label")}، ${label}`);
      }
      control.append(dots);
      slots.push(control);
    }
    $("calendar-month").textContent = month;
    $("calendar-days").replaceChildren(...slots);
    const entries = [
      ...(totals.has(day) ? [element("p", `${numbers.format(totals.get(day))} میلی‌لیتر آب`)] : []),
      ...doses.filter(dose => dose.day === day).map(dose => element("p", `${state.medicines[dose.medicineId]?.name ?? "دارو"} · ${dose.status === "taken" ? "مصرف شد" : "مصرف نشد"}`)),
      ...visits.filter(visit => visit.day === day).map(visit => visitCard(visit))
    ];
    $("calendar-activity").replaceChildren(element("h2", "فعالیت این روز"), ...(entries.length ? entries : [empty("فعالیتی ثبت نشده است.")]));
  }

  function renderReports(day, goal, totals, doses) {
    const last = Math.min(day, today());
    const first = last - reportSpan + 1;
    const range = Array.from({ length: reportSpan }, (_, i) => totals.get(first + i) ?? 0);
    const average = range.reduce((sum, amount) => sum + amount, 0) / reportSpan;
    const recorded = doses.filter(dose => dose.day >= first && dose.day <= last);
    const taken = recorded.filter(dose => dose.status === "taken").length;
    $("report-dates").textContent = `از ${shortDate.format(first * dayMs)} تا ${shortDate.format(last * dayMs)}`;
    $("report-average").textContent = `میانگین روزانه ${numbers.format(Math.round(average))} میلی‌لیتر`;
    $("report-doses").textContent = `${numbers.format(taken)} از ${numbers.format(recorded.length)} نوبت ثبت‌شده، مصرف شد.`;
    const bucketSize = reportSpan === 365 ? 30 : 1;
    const bars = [];
    for (let i = 0; i < range.length; i += bucketSize) {
      const group = range.slice(i, i + bucketSize);
      bars.push(group.reduce((sum, amount) => sum + amount, 0) / group.length);
    }
    const max = Math.max(goal, ...bars);
    const chart = $("report-chart");
    chart.setAttribute("aria-label", `نمودار مصرف آب؛ ${$("report-average").textContent}`);
    chart.style.setProperty("--goal", `${goal / max * 100}%`);
    chart.replaceChildren(...bars.map((value, i) => {
      const bar = element("div");
      bar.style.setProperty("--bar", `${value / max * 100}%`);
      bar.title = `${shortDate.format((first + i * bucketSize) * dayMs)} · ${numbers.format(Math.round(value))} میلی‌لیتر`;
      return bar;
    }));
    $("report-chart-dates").replaceChildren(element("span", shortDate.format(first * dayMs)), element("span", shortDate.format(last * dayMs)));
  }

  function renderWellness(state, day) {
    setCalendar(state.calendar ?? "persian");
    document.body.dataset.theme = state.theme ?? "system";
    if (!$("settings-dialog").open) {
      $("calendar-setting").value = calendar;
      $("theme-setting").value = document.body.dataset.theme;
    }
    const totals = new Map();
    for (const entry of state.water ?? []) totals.set(entry.day, (totals.get(entry.day) ?? 0) + entry.amount);
    const total = totals.get(day) ?? 0;
    const goal = state.waterGoal ?? 2000;
    const future = day > today();
    const progress = Math.min(1, total / goal);
    $("day-label").textContent = day === today() ? "امروز" : shortDate.format(day * dayMs);
    if (screen === "today") {
      const start = day - weekIndex(day);
      $("day-week").replaceChildren(...week.map((label, index) => {
        const control = dateButton(start + index, day, "day-week");
        control.prepend(element("span", label));
        return control;
      }));
    }
    $("header-date").textContent = screen === "today" ? dateText.format(day * dayMs) : "";
    $("today-water").hidden = future;
    $("open-water-history").hidden = future;
    $("today-actions").hidden = future;
    $("water-custom-action").hidden = future;
    $("today-water-label").textContent = day === today() ? "مصرف آب امروز" : "مصرف آب این روز";
    $("water-entry").hidden = future;
    $("today-water-total").textContent = numbers.format(total);
    $("today-water-goal").textContent = numbers.format(goal);
    $("today-water-remaining").textContent = total >= goal ? "هدف این روز کامل شد." : `${numbers.format(goal - total)} میلی‌لیتر تا هدف`;
    $("today-water-progress").value = progress;
    $("water-progress").value = progress;
    $("water-date").textContent = day === today() ? "امروز" : shortDate.format(day * dayMs);
    $("water-total").textContent = numbers.format(total);
    $("water-remaining").textContent = $("today-water-remaining").textContent;
    const level = 90 - 78 * progress;
    for (const glass of document.querySelectorAll(".glass-water")) {
      glass.setAttribute("d", progress ? `M0 ${level}C30 ${level - 7} 65 ${level + 8} 100 ${level}V100H0Z` : "");
    }
    if (document.activeElement !== $("water-goal")) $("water-goal").value = String(goal);

    if (screen === "water") {
      const entries = (state.water ?? []).filter(entry => entry.day === day).reverse();
      $("water-entries").replaceChildren(...(entries.length ? entries.map(entry => {
        const row = element("article", "", "entry-row");
        row.append(element("span", `${numbers.format(entry.amount)} میلی‌لیتر · ${clockText(entry.time)}`), button("ویرایش", () => openWater(entry)),
          button("حذف ثبت", () => {
            if (confirm("این ثبت آب حذف شود؟")) void mutate(data => { data.water = data.water.filter(item => item.id !== entry.id); }, "ثبت آب حذف شد.");
          }));
        return row;
      }) : [empty("برای این روز آبی ثبت نشده است.")]));
    }

    if (screen === "appointments") renderVisits(state);

    if (screen === "insights") {
      const doses = Object.values(state.doses).filter(dose => dose.status);
      if (insight === "calendar") renderCalendar(state, day, totals, doses);
      else renderReports(day, goal, totals, doses);
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
  chooseOption("insight", value => {
    insight = value;
    $("calendar-panel").hidden = value !== "calendar";
    $("reports-panel").hidden = value !== "reports";
  });
  chooseOption("report-range", value => { reportSpan = Number(value); });
  $("previous-month").addEventListener("click", () => chooseDay(monthStart(monthStart(selectedDay()) - 1)));
  $("next-month").addEventListener("click", () => chooseDay(monthStart(monthStart(selectedDay()) + 32)));
  return { dayVisits, renderWellness, formatDay: day => dateText.format(day * dayMs) };
}
