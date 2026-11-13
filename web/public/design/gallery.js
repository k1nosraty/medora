import { $, button, element } from "../medication/shared/ui/dom.js";
import { defaultCalendar, language, localDigits, localizeMarkup, shortWeek, weekIndex } from "../medication/shared/i18n/locale.js";
import { applyDisplay } from "../medication/styles/display.js";
import { availableAccents } from "../medication/styles/theme.js";
import { medicationBadge, medicationBanner } from "../medication/features/medicines/appearance.js";
import { installMedicineEditor } from "../medication/features/medicines/editor.js";
import { installAppointments } from "../medication/features/appointments/editor.js";
import { visitIllustration } from "../medication/features/appointments/view.js";
import { routineIllustration } from "../medication/features/routines/illustration.js";
import { installRoutines } from "../medication/features/routines/view.js";
import { installWater } from "../medication/features/water/controller.js";
import { installSettings } from "../medication/features/settings/dialog.js";
import { installPickers } from "../medication/shared/ui/pickers.js";
import { calendarFormat } from "../medication/shared/ui/calendar-format.js";
import { today } from "../medication/shared/ui/dates.js";
import { isoDay } from "../medication/domain/care-index.js";
import { appearanceColors, complete, cycleArt, glass, readCatalog } from "./catalog.js";

localizeMarkup({ manifest: false });
if (language === "en") {
  document.title = "Medora design gallery";
  document.querySelectorAll("[data-en]").forEach(node => { node.textContent = node.dataset.en; });
  for (const attr of ["aria-label", "placeholder"]) {
    document.querySelectorAll("[data-en-" + attr + "]").forEach(node => node.setAttribute(attr, node.getAttribute("data-en-" + attr)));
  }
}
const fa = language === "fa";
const text = (persian, english) => fa ? persian : english;
const normalize = value => value.toLocaleLowerCase().normalize("NFKC").replaceAll("ي", "ی").replaceAll("ك", "ک").replace(/[\s‌-]/g, "");
const now = today();
const dates = calendarFormat(defaultCalendar);
const { formatDay } = dates;
const state = { medicines: {}, visits: {}, routines: {}, routineLogs: {}, water: [], doses: {} };
const noSave = async () => {
  $("status").textContent = text("در گالری داده‌ای ذخیره نمی‌شود.", "The gallery does not save records.");
  return false;
};
const noAction = () => {};
const sample = { getState: () => state, today, render: noAction, mutate: noSave, requestDeletion: noAction, formatDay };
const pickers = installPickers({ selectedDay: today, today, dashboard: {
  dateLimit: () => Infinity, chooseDay: noAction,
  formatDay, formatMonth: dates.month, formatDayNumber: dates.dayNumber, monthStart: dates.monthStart
} });
const refreshFields = pickers.refresh;
const openMedicine = installMedicineEditor({ ...sample, isBusy: () => false, removeMedicine: noAction, pickers });
installAppointments({
  ...sample, defaultDay: today, refreshFields, formatDayNumber: dates.dayNumber, formatShortMonth: dates.shortMonth
});
const routines = installRoutines({ ...sample, refreshFields });
const water = installWater({ ...sample, selectedDay: today, actionDay: today, refreshFields, formatShortDate: dates.shortDate });
const openSettings = installSettings({ ...sample, refreshFields });
for (const control of document.querySelectorAll("[data-close]")) {
  control.addEventListener("click", () => $(control.dataset.close).close());
}
for (const control of document.querySelectorAll("[data-from-quick]")) {
  control.addEventListener("click", () => $("quick-dialog").close(), { capture: true });
}
for (const form of document.forms) form.addEventListener("submit", event => event.preventDefault());
$("day").value = isoDay(now);
$("today-dates").append($("day-controls"));
$("story-date").textContent = formatDay(now);
$("story-summary").textContent = text("داروها، قرارها و روتین‌های امروز", "Today’s medication, appointments and routines");
$("day-label").textContent = dates.month(now);
for (let day = now - 3; day <= now + 3; day++) {
  const control = button(dates.dayNumber(day), noAction);
  control.append(element("span",shortWeek[weekIndex(day)]));
  if (day === now) control.setAttribute("aria-current", "date");
  $("day-week").append(control);
}
const all = readCatalog($("visit-category").options);
const families = {
  all: text("همه", "All"), medicine: text("دارو", "Medication"), visit: text("قرار", "Appointments"),
  routine: text("روتین", "Routines"), water: text("آب", "Water"), cycle: text("چرخه", "Cycle"),
  image: text("تصویر", "Illustrations"), control: text("کنترل", "Controls")
};
const accentText = id => ({blue:"Blue",green:"Green",lilac:"Lilac",coral:"Coral",berry:"Berry"})[id];
const themes = ["light", "dark"];
let selection;
function options(select, values, previous = select.value) {
  select.replaceChildren(...values.map(([id,label]) => new Option(label,id)));
  if (values.some(([id]) => id === previous)) select.value = previous;
}
const cycleEnabled = () => $("cycle-preview").checked;
const designCards = [
  ["medicine", text("مصرف دارو","Medication"), () => medicationBadge("bottle")],
  ["visit", text("قرارها","Appointments"), () => visitIllustration("general")],
  ["routine", text("روتین‌ها","Routines"), () => routineIllustration("custom")],
  ["water", text("مصرف آب","Water"), glass],
  ["cycle", families.cycle, cycleArt]
];
function artSlot(node) {
  const slot = element("span", "", "gallery-art");
  slot.append(node);
  return slot;
}
function banner(title, detail, family, node) {
  const surface = element("article", "", "gallery-banner program-" + family);
  const label = element("div");
  label.append(element("strong", title), element("small", detail));
  surface.append(label, artSlot(node));
  return surface;
}
function cycleDialog() {
  $("design-cycle-banner").replaceChildren(banner(text("پریود بعدی","Next period"),
    text("۲۲ تا ۲۶ آبان · بازهٔ تخمینی","Nov 13–17 · Estimated"),"cycle",cycleArt()));
  $("design-cycle-dialog").showModal();
}
function updateDisplay() {
  applyDisplay({ theme: $("theme").value, accent: $("accent").value }, { cycleEnabled: cycleEnabled() });
}
function accentOptions() {
  options($("accent"), availableAccents(cycleEnabled()).map(({id,label}) => [id,fa ? label : accentText(id)]));
  updateDisplay();
}
function renderPalette() {
  const palette = themes.flatMap(theme => availableAccents(cycleEnabled()).map(({id,label}) => {
    const color = element("article", "", "medora gallery-palette-sample");
    color.dataset.accent = id;
    color.dataset.theme = theme;
    const sample = element("i");
    sample.style.setProperty("--sample", theme === "dark" ? "var(--accent-dark)" : "var(--accent-light)");
    color.append(sample, element("span", (fa ? label : accentText(id)) + " · " + (theme === "dark" ? text("تیره","Dark") : text("روشن","Light"))));
    return color;
  }));
  $("gallery-palettes").replaceChildren(...palette);
}
function renderSurfaces() {
  const cards = designCards.filter(([family]) => family !== "cycle" || cycleEnabled());
  const reports = element("div", "", "report-grid");
  for (const [family,title,draw] of cards) {
    const card = element("article", "", "feature report-card program-" + family);
    const cover = element("div", "", "report-hero");
    const art = draw();
    art.classList.add("report-art");
    cover.append(art, element("h2", title), element("p", text("نمونهٔ گزارش","Sample report"), "report-caption"));
    card.append(cover);
    reports.append(card);
  }
  $("gallery-reports").replaceChildren(reports);
  const agenda = element("div", "", "gallery-stack");
  agenda.append(element("h3",text("تقویم و برنامهٔ روز","Calendar and agenda")));
  const calendar = element("div", "", "gallery-calendar program-cycle");
  for (let day = 15; day <= 21; day++) {
    const date = element("span", localDigits(day), day === 18 ? "selected" : "");
    if (cycleEnabled() && day !== 18) date.className = day < 18 ? "recorded" : "forecast";
    calendar.append(date);
  }
  agenda.append(calendar, ...cards.map(([family,label,draw]) => banner(label, text("نمونهٔ کارت تقویم","Sample calendar card"), family, draw())));
  $("gallery-agenda").replaceChildren(agenda);
  const quick = $("quick-dialog").querySelector(".quick-items");
  $("cycle-program")?.remove();
  $("cycle-quick")?.remove();
  if (cycleEnabled()) {
    const card = button("", cycleDialog);
    card.id = "cycle-program";
    card.className = "program-card program-cycle";
    card.append(cycleArt(), element("strong", families.cycle));
    $("today-programs").querySelector(".program-grid").append(card);
    const add = button(families.cycle, () => { $("quick-dialog").close(); cycleDialog(); });
    add.id = "cycle-quick";
    add.classList.add("quick-item","program-cycle");
    add.prepend(cycleArt());
    quick.append(add);
  }
  $("cycle-form-preview").hidden = !cycleEnabled();
}
function renderSpecimen(entry) {
  const panel = $("icon-specimen");
  panel.hidden = !entry;
  if (!entry) return;
  const color = $("art-color").value;
  const specimen = banner(entry.label, text("اندازهٔ کارت","Card size"), entry.family, entry.render(color));
  specimen.dataset.ink = color;
  const large = element("div", "", "gallery-large program-" + entry.family);
  large.dataset.ink = color;
  large.append(artSlot(entry.render(color)));
  panel.replaceChildren(element("h3", entry.label), large, specimen);
  if (entry.family === "medicine" && entry.id !== "blister") {
    panel.append(medicationBanner(entry.id, color || "purple"));
  }
}
function renderCatalog() {
  const family = $("family").value;
  const query = normalize($("icon-search").value.trim());
  const entries = all.filter(entry => (entry.family !== "cycle" || cycleEnabled()) &&
    (family === "all" || entry.family === family) && normalize(entry.label + entry.id).includes(query));
  if (!entries.includes(selection)) selection = entries[0];
  const cards = entries.map(entry => {
    const control = button("", () => {
      selection = entry;
      for (const option of $("icon-grid").children) option.setAttribute("aria-pressed", String(option === control));
      renderSpecimen(selection);
    });
    control.classList.add("gallery-icon","program-" + entry.family);
    control.dataset.ink = $("art-color").value;
    control.setAttribute("aria-pressed", String(entry === selection));
    control.append(artSlot(entry.render($("art-color").value)), element("span",entry.label));
    return control;
  });
  $("icon-grid").replaceChildren(...cards);
  $("icon-count").textContent = entries.length ? text(localDigits(entries.length) + " آیکون", entries.length + " icons") : text("نتیجه‌ای پیدا نشد","No icons found");
  renderSpecimen(selection);
}
function renderControls() {
  const controls = element("div","","gallery-stack");
  const buttons = element("div","","gallery-buttons");
  for (const [label,kind] of [[text("افزودن","Add"),""],[text("انجام دادم","Done"),"secondary"],[text("ویرایش","Edit"),"text-button"],[text("حذف","Delete"),"text-button danger-link"]]) {
    const control = button(label,noAction);
    control.className = kind;
    buttons.append(control);
  }
  buttons.append(button(text("غیرفعال","Disabled"),noAction));
  buttons.lastElementChild.disabled = true;
  const field = element("input");
  field.placeholder = text("نمونهٔ ورودی","Sample input");
  field.setAttribute("aria-label",field.placeholder);
  controls.append(buttons, field, banner(text("همهٔ نوبت‌ها بررسی شدند","All activities reviewed"), "", "image", complete()),
    banner(text("ثبت آب","Log water"),text("۷۵۰ از ۲٬۰۰۰ میلی‌لیتر","750 of 2,000 ml"),"water",glass()));
  $("gallery-controls").replaceChildren(controls);
}
const byId = id => () => $(id).showModal();
function openAccount(mode = "password-login") {
  for (const form of $("account-dialog").querySelectorAll("form")) form.hidden = form.id !== mode;
  $("account-modes").hidden = false;
  $("account-dialog").showModal();
}
function openRoutineLog() {
  routines.openReminder({
    id: "sample-reading", name: text("مطالعه","Reading"), category: "reading",
    minute: 1200, mode: "quantity", target: 20, amount: 12, unit: text("صفحه","pages")
  }, now);
}
for (const control of $("account-dialog").querySelectorAll("[data-account-mode]")) {
  control.addEventListener("click", () => {
    for (const option of $("account-dialog").querySelectorAll("[data-account-mode]")) {
      option.setAttribute("aria-pressed", String(control === option));
    }
    openAccount(control.dataset.accountMode === "login" ? "password-login" : "email-start");
  });
}
$("delete-title").textContent = text("حذف ثبت آزمایشی","Delete sample entry");
$("delete-message").textContent = text("این پنجره فقط نمونهٔ تأیید حذف است.", "This dialog previews the delete confirmation.");
$("cancel-delete").addEventListener("click", () => $("delete-dialog").close());
const forms = [
  [text("افزودن","Quick add"),byId("quick-dialog")],
  [text("داروی جدید","New medication"),() => openMedicine()],
  [text("ظاهر دارو","Medication appearance"),() => { openMedicine(); $("medicine-appearance").click(); }],
  [text("قرار جدید","New appointment"),() => document.querySelector("[data-open-visit]").click()],
  [text("نوع قرار","Appointment category"),() => { document.querySelector("[data-open-visit]").click(); $("visit-category-open").click(); }],
  [text("روتین جدید","New routine"),() => document.querySelector("[data-open-routine]").click()],
  [text("نوع روتین","Routine category"),() => { document.querySelector("[data-open-routine]").click(); $("routine-category-open").click(); }],
  [text("ثبت پیشرفت روتین","Log routine progress"),openRoutineLog],
  [text("ثبت آب","Log water"),() => water.openWater()],
  [text("حساب مدورا","Account"),() => openAccount()],
  [text("بازیابی رمز عبور","Password recovery"),() => openAccount("reset-email-form")],
  [text("تنظیمات","Settings"),() => openSettings()],
  [text("اعلان‌ها","Notifications"),() => openSettings(true)],
  [text("پشتیبان‌گیری","Backup"),() => { openSettings(); document.querySelector('[data-settings-panel="backup-settings"]').click(); }],
  [text("تاریخ","Date"),() => pickers.chooseDate(now,noAction)],
  [text("ساعت","Time"),() => { water.openWater(); $("water-options").open = true; document.querySelector('[data-for="water-log-time"]').click(); }],
  [text("تأیید حذف","Delete confirmation"),byId("delete-dialog")],
  [text("چرخه","Cycle"),cycleDialog,"cycle-form-preview"]
];
$("gallery-forms").append(...forms.map(([label,open,id]) => {
  const control = button(label,open);
  if (id) control.id = id;
  return control;
}));
for (const card of document.querySelectorAll("#today-programs [data-destination]")) {
  card.addEventListener("click", () => {
    $("family").value = {medications:"medicine",appointments:"visit",routines:"routine"}[card.dataset.destination];
    renderCatalog();
    $("icons").scrollIntoView();
  });
}
$("gallery-language").value = language;
$("gallery-language").addEventListener("change", event => {
  const url = new URL(location.href);
  url.searchParams.set("lang", event.target.value);
  location.assign(url);
});
$("theme").addEventListener("change", updateDisplay);
$("accent").addEventListener("change", updateDisplay);
$("width").addEventListener("change", event => {
  if (event.target.value === "auto") delete document.querySelector(".gallery").dataset.width;
  else document.querySelector(".gallery").dataset.width = event.target.value;
});
$("cycle-preview").addEventListener("change", () => {
  accentOptions();
  renderSurfaces();
  renderPalette();
  renderCatalog();
});
for (const id of ["family","art-color","icon-search"]) $(id).addEventListener(id === "icon-search" ? "input" : "change", renderCatalog);
options($("family"),Object.entries(families));
options($("art-color"), [["",text("پیش‌فرض","Default")], ...Object.entries(appearanceColors)]);
accentOptions();
renderSurfaces();
renderControls();
water.renderTodayWater(state, now, 750, 2000, .375);
$("today-water-quick").disabled = true;
$("open-water-history").disabled = true;
renderPalette();
renderCatalog();
