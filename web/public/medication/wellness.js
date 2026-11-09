const $ = id => document.getElementById(id);
const dayMs = 86_400_000;
const numbers = new Intl.NumberFormat("fa-IR");
const dateText = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "full", timeZone: "UTC" });
const shortDate = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { day: "numeric", month: "short", timeZone: "UTC" });
const titles = { today: "امروز", medications: "داروها", appointments: "قرارها", insights: "تقویم و گزارش", settings: "تنظیمات", water: "آب" };
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

export function wellness({ getState, selectedDay, today, render, mutate }) {
  let screen = "today";
  let editingVisit = null;
  function show(destination) {
    if (!Object.hasOwn(titles, destination)) return;
    screen = destination;
    for (const view of document.querySelectorAll("[data-screen]")) view.hidden = view.dataset.screen !== screen;
    for (const item of document.querySelectorAll(".dock [data-destination]")) {
      if (item.dataset.destination === (screen === "water" ? "today" : screen)) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    }
    $("screen-title").textContent = titles[screen];
    $("day-controls").hidden = !["today", "water", "insights"].includes(screen);
    render();
    scrollTo(0, 0);
  }
  for (const button of document.querySelectorAll("[data-destination]")) {
    button.addEventListener("click", () => show(button.dataset.destination));
  }
  for (const [id, delta] of [["previous-day", -1], ["next-day", 1]]) {
    $(id).addEventListener("click", () => {
      const day = selectedDay() + delta;
      if (Number.isFinite(day)) $("day").value = iso(day);
      render();
    });
  }

  function addWater(amount) {
    const day = selectedDay();
    if (!Number.isInteger(amount) || amount < 1 || amount > 10000 || day > today()) {
      $("status").textContent = "مقدار آب باید از ۱ تا ۱۰٬۰۰۰ میلی‌لیتر باشد.";
      return;
    }
    const entry = { id: crypto.randomUUID(), day, time: localClock(), amount };
    void mutate(state => { (state.water ??= []).push(entry); }, "آب ثبت شد.");
  }
  for (const button of document.querySelectorAll("[data-water-add]")) {
    button.addEventListener("click", () => addWater(Number(button.dataset.waterAdd)));
  }
  $("water-custom").addEventListener("submit", event => {
    event.preventDefault();
    const value = integer($("water-amount").value);
    if (Number.isInteger(value) && value >= 1 && value <= 10000) $("water-amount").value = "";
    addWater(value);
  });
  $("water-goal-form").addEventListener("submit", event => {
    event.preventDefault();
    const goal = integer($("water-goal").value);
    if (!(goal >= 1 && goal <= 20000)) {
      $("status").textContent = "هدف آب باید از ۱ تا ۲۰٬۰۰۰ میلی‌لیتر باشد.";
      return;
    }
    void mutate(state => { state.waterGoal = goal; }, "هدف آب ذخیره شد.");
  });

  function openVisit(visit) {
    editingVisit = visit?.id ?? null;
    $("visit-form-title").textContent = visit ? "ویرایش قرار" : "قرار جدید";
    $("visit-name").value = visit?.name ?? "";
    $("visit-day").value = iso(visit?.day ?? selectedDay());
    $("visit-time").value = visit?.time ?? "";
    $("visit-place").value = visit?.place ?? "";
    $("visit-note").value = visit?.note ?? "";
    $("visit-editor").hidden = false;
    $("visit-name").focus();
  }
  $("visit-add").addEventListener("click", () => openVisit());
  $("visit-close").addEventListener("click", () => { $("visit-editor").hidden = true; });
  $("visit-editor").addEventListener("submit", async event => {
    event.preventDefault();
    const name = $("visit-name").value.trim();
    const day = Date.parse(`${$("visit-day").value}T00:00:00Z`) / dayMs;
    const time = $("visit-time").value;
    if (!name || !Number.isInteger(day) || !/^\d{2}:\d{2}$/.test(time)) return;
    const id = editingVisit ?? crypto.randomUUID();
    const place = $("visit-place").value.trim();
    const note = $("visit-note").value.trim();
    if (await mutate(state => {
      const visits = state.visits ??= {};
      visits[id] = { id, name, day, time, place, note, cancelled: visits[id]?.cancelled ?? false };
    }, "قرار ذخیره شد.")) $("visit-editor").hidden = true;
  });

  function visitCard(visit, details = false) {
    const card = element("article", "", "visit");
    const title = element("h3", visit.name);
    title.dir = "auto";
    card.append(title, element("p", `${shortDate.format(visit.day * dayMs)} · ${clockText(visit.time)}`));
    if (visit.place) card.append(element("p", visit.place, "quiet"));
    if (visit.cancelled) card.append(element("p", "قرار لغو شده", "badge"));
    if (details) {
      if (visit.note) card.append(element("p", visit.note));
      const controls = element("div", "", "buttons");
      controls.append(button("ویرایش", () => openVisit(visit)), button(visit.cancelled ? "فعال‌کردن قرار" : "لغو قرار", () => {
        void mutate(state => { state.visits[visit.id].cancelled = !state.visits[visit.id].cancelled; }, "وضعیت قرار ذخیره شد.");
      }));
      card.append(controls);
    }
    return card;
  }

  function dayVisits(state, day) {
    return Object.values(state.visits ?? {}).filter(visit => visit.day === day && !visit.cancelled)
      .map(visit => ({ minute: minutes(visit.time), card: visitCard(visit) }));
  }

  function renderWellness(state, day) {
    const totals = new Map();
    for (const entry of state.water ?? []) totals.set(entry.day, (totals.get(entry.day) ?? 0) + entry.amount);
    const total = totals.get(day) ?? 0;
    const goal = state.waterGoal ?? 2000;
    const future = day > today();
    const percent = Math.min(100, Math.round(total * 100 / goal));
    $("day-label").textContent = dateText.format(day * dayMs);
    $("header-date").textContent = ["today", "water", "insights"].includes(screen) ? shortDate.format(day * dayMs) : "";
    $("today-water").hidden = future;
    $("today-water-label").textContent = day === today() ? "آب امروز" : "آب این روز";
    $("water-entry").hidden = future;
    $("today-water-total").textContent = numbers.format(total);
    $("today-water-goal").textContent = numbers.format(goal);
    $("today-water-remaining").textContent = total >= goal ? "هدف این روز کامل شد." : `${numbers.format(goal - total)} میلی‌لیتر تا هدف`;
    $("water-percent").textContent = numbers.format(percent) + "٪";
    $("water-ring").style.setProperty("--percent", String(percent));
    $("water-ring").setAttribute("aria-valuenow", String(percent));
    $("water-total").textContent = numbers.format(total);
    if (document.activeElement !== $("water-goal")) $("water-goal").value = String(goal);

    if (screen === "water") {
      const entries = (state.water ?? []).filter(entry => entry.day === day).reverse();
      $("water-entries").replaceChildren(...(entries.length ? entries.map(entry => {
        const row = element("article", "", "water feature-head");
        row.append(element("span", `${numbers.format(entry.amount)} میلی‌لیتر · ${clockText(entry.time)}`),
          button("حذف ثبت", () => {
            if (confirm("این ثبت آب حذف شود؟")) void mutate(data => { data.water = data.water.filter(item => item.id !== entry.id); }, "ثبت آب حذف شد.");
          }));
        return row;
      }) : [empty("برای این روز آبی ثبت نشده است.")]));
    }

    if (screen === "appointments") {
      const visits = Object.values(state.visits ?? {}).sort((a, b) => a.day - b.day || minutes(a.time) - minutes(b.time));
      $("visits").replaceChildren(...(visits.length ? visits.map(visit => visitCard(visit, true)) : [empty("هنوز قرار پزشکی ثبت نشده است.")]));
    }

    if (screen === "insights") {
      const span = Number($("report-range").value);
      const last = Math.min(day, today());
      const first = last - span + 1;
      const water = [...totals].reduce((sum, [date, amount]) => sum + (date >= first && date <= last ? amount : 0), 0);
      const doses = Object.values(state.doses).filter(dose => dose.status && dose.day >= first && dose.day <= last);
      $("report-summary").replaceChildren(
        element("p", `${numbers.format(water)} میلی‌لیتر آب ثبت شده`),
        element("p", `${numbers.format(doses.filter(dose => dose.status === "taken").length)} از ${numbers.format(doses.length)} ثبت دارو، مصرف‌شده`)
      );
      const dates = Array.from({ length: 7 }, (_, i) => last - 6 + i);
      const max = Math.max(goal, ...dates.map(date => totals.get(date) ?? 0));
      $("report-chart").replaceChildren(...dates.map(date => {
        const row = element("p");
        const gauge = element("meter");
        const value = totals.get(date) ?? 0;
        const label = shortDate.format(date * dayMs);
        gauge.max = max;
        gauge.value = value;
        gauge.setAttribute("aria-label", `آب ${label}`);
        row.append(element("span", label), gauge, element("span", numbers.format(value)));
        return row;
      }));
    }
  }

  $("report-range").addEventListener("change", () => renderWellness(getState(), selectedDay()));
  return { show, dayVisits, renderWellness };
}
