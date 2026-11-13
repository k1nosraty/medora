import { $, button, element } from "../medication/shared/ui/dom.js";
import { defaultCalendar, language, localDigits, localizeMarkup } from "../medication/shared/i18n/locale.js";
import { applyDisplay } from "../medication/styles/display.js";
import { availableAccents } from "../medication/styles/theme.js";
import { installMedicineEditor } from "../medication/features/medicines/editor.js";
import { installAppointments } from "../medication/features/appointments/editor.js";
import { installRoutines } from "../medication/features/routines/view.js";
import { installWater } from "../medication/features/water/controller.js";
import { installSettings } from "../medication/features/settings/dialog.js";
import { installPickers } from "../medication/shared/ui/pickers.js";
import { calendarFormat } from "../medication/shared/ui/calendar-format.js";
import { today } from "../medication/shared/ui/dates.js";
import { installCalendarPreview } from "./calendar.js";
import { glassObject, medicineGlass, refreshArtwork, visitGlass, routineGlass } from "./glass.js";
import { installChoiceArt, installFormArt, renderMedicineCover } from "./form-art.js";
import { installPanelPreview } from "./panels.js";
import { appearanceColors, complete, cycleArt, glass, heart, readCatalog } from "./catalog.js";

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
const previewParams = new URLSearchParams(location.search);
const calendar = ["persian", "gregory"].includes(previewParams.get("calendar")) ? previewParams.get("calendar") : defaultCalendar;
const dates = calendarFormat(calendar);
const { formatDay } = dates;
const state = { medicines: {}, visits: {}, routines: {}, routineLogs: {}, water: [], doses: {}, calendar };
const noSave = async () => {
  $("status").textContent = text("در گالری داده‌ای ذخیره نمی‌شود.", "The gallery does not save records.");
  return false;
};
const noAction = () => {};
const sample = { getState: () => state, today, render: noAction, mutate: noSave, requestDeletion: noAction, formatDay };
const calendarPreview = installCalendarPreview(dates, now);
const pickers = installPickers({ selectedDay: calendarPreview.selected, today, dashboard: {
  dateLimit: () => Infinity, chooseDay: calendarPreview.choose,
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
$("today-dates").append($("day-controls"));
for (const arrow of document.querySelectorAll("#day-controls .day-arrow use")) arrow.setAttribute("href", "#i-expand");
$("story-date").textContent = formatDay(now);
$("story-summary").textContent = text("داروها، قرارها و روتین‌های امروز", "Today’s medication, appointments and routines");
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
  ["medicine", text("مصرف دارو","Medication"), () => medicineGlass("bottle")],
  ["visit", text("قرارها","Appointments"), () => visitGlass("general")],
  ["routine", text("روتین‌ها","Routines"), () => routineGlass("custom")],
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
function cycleBanner() {
  const preview = banner(text("پریود بعدی", "Next period"),
    text("۲۲ تا ۲۶ آبان · بازهٔ تخمینی", "Nov 13–17 · Estimated"), "cycle", cycleArt());
  preview.classList.add("cycle-showcase");
  return preview;
}

function cycleDialog() {
  $("design-cycle-banner").replaceChildren(cycleBanner());
  $("design-cycle-dialog").showModal();
}
function updateDisplay() {
  state.theme = $("theme").value;
  state.accent = $("accent").value;
  applyDisplay(state, { cycleEnabled: cycleEnabled() });
}
function accentOptions() {
  options($("accent"), availableAccents(cycleEnabled()).map(({id,label}) => [id,fa ? label : accentText(id)]));
  updateDisplay();
}
function accentName(id, label) {
  return fa ? label : accentText(id);
}

function comparisonCell(theme, accent, title) {
  const cell = element("article", "", "medora glass-comparison-cell");
  cell.dataset.accent = accent;
  cell.dataset.theme = theme;
  const day = element("span", localDigits(18), "glass-sample-date");
  const heading = element("header");
  heading.append(element("strong", title), day);
  cell.append(heading);
  return cell;
}

function comparison(render, includeCycle) {
  const panel = element("div", "", "glass-comparison");
  for (const { id, label } of availableAccents(includeCycle)) {
    const pair = element("div", "", "glass-comparison-pair");
    for (const theme of themes) {
      const mode = theme === "dark" ? text("تیره","Dark") : text("روشن","Light");
      const cell = comparisonCell(theme, id, accentName(id, label) + " · " + mode);
      render(cell, id);
      pair.append(cell);
    }
    panel.append(pair);
  }
  return panel;
}

function heroArt(accent) {
  const choice = $("hero-art").value;
  if (choice === "heart") return heart(accent);
  if (choice !== "classic") return glassObject(choice, "image", { accent, className: "story-art" });
  const art = new Image(560, 350);
  art.src = "/medication/assets/illustrations/care.svg";
  art.alt = "";
  art.className = "story-art classic-story-art gallery-cover-art";
  return art;
}

function renderHero() {
  $("today-story").querySelector(".story-art").replaceWith(heroArt($("accent").value));
}

function renderFinishComparison() {
  const cards = [["glass", text("شیشه‌ای", "Glass")], ["matte", text("سه‌بعدی مات", "Matte 3D")]].map(([finish, label]) => {
    const sample = element("article", "", "gallery-finish-card");
    sample.dataset.finish = finish;
    const art = glassObject("bottle", "medicine", { finish });
    const week = element("div", "", "gallery-mini-week");
    for (let day = 15; day <= 21; day++) week.append(element("span", localDigits(day), day === 18 ? "selected" : ""));
    const action = button(text("ثبت مصرف", "Log dose"), noAction);
    action.className = "finish-action";
    sample.append(element("h3", label), banner(text("دارو", "Medication"), "", "medicine", art), week, action);
    return sample;
  });
  $("gallery-finish-comparison").replaceChildren(...cards);
}

function renderPalette() {
  const grid = comparison((cell, accent) => {
    const cover = banner(text("امروز با مدورا","Today with Medora"), "", "image", heroArt(accent));
    cover.classList.add("glass-cover");
    cell.append(cover);
    const cards = designCards.filter(([family]) => family !== "cycle" || cycleEnabled());
    cell.append(...cards.map(([family,label,draw]) => banner(label, "", family, draw())));
  }, cycleEnabled());
  $("gallery-palettes").replaceChildren(grid);
}
function renderSurfaces() {
  renderMedicineCover($("accent").value);
  const artByFeature = {
    medications: () => medicineGlass("bottle"), appointments: () => visitGlass("general"), routines: () => routineGlass("custom")
  };
  for (const control of document.querySelectorAll("#today-programs [data-destination]")) {
    control.firstElementChild.replaceWith(artByFeature[control.dataset.destination]());
  }
  renderHero();
  const waterArt = $("today-water").querySelector(".today-water-art");
  waterArt.querySelector(".glass-object")?.remove();
  waterArt.append(glass());
  const quickArt = [medicineGlass("bottle"), visitGlass("general"), routineGlass("custom"), glass()];
  $("quick-dialog").querySelectorAll("[data-from-quick]").forEach((control, index) => {
    control.firstElementChild.replaceWith(quickArt[index]);
  });
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
  agenda.append(...cards.map(([family,label,draw]) => banner(label, text("نمونهٔ کارت تقویم","Sample calendar card"), family, draw())));
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
  $("gallery-selected-comparison").hidden = !entry;
  if (!entry) return;
  const color = $("art-color").value;
  const draw = accent => entry.render(color, accent);
  const specimen = banner(entry.label, text("اندازهٔ بنر","Banner size"), entry.family, draw($("accent").value));
  specimen.dataset.ink = color;
  const large = element("div", "", "gallery-large program-" + entry.family);
  large.dataset.ink = color;
  large.append(artSlot(draw($("accent").value)));
  panel.replaceChildren(element("h3", entry.label), large, specimen);
  const title = element("h3", text("همین آیکون با همهٔ اکسنت‌ها", "This icon across accents"));
  const matrix = comparison((cell, accent) => {
    cell.append(banner(entry.label, "", entry.family, draw(accent)));
  }, cycleEnabled());
  $("gallery-selected-comparison").replaceChildren(title, matrix);
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
    control.append(artSlot(entry.render($("art-color").value, $("accent").value)), element("span",entry.label));
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
    control.className = kind + " finish-action";
    buttons.append(control);
  }
  buttons.append(button(text("غیرفعال","Disabled"),noAction));
  buttons.lastElementChild.classList.add("finish-action");
  buttons.lastElementChild.disabled = true;
  const field = element("input");
  field.placeholder = text("نمونهٔ ورودی","Sample input");
  field.setAttribute("aria-label",field.placeholder);
  controls.append(buttons, field, banner(text("همهٔ نوبت‌ها بررسی شدند","All activities reviewed"), "", "image", complete($("accent").value)),
    banner(text("ثبت آب","Log water"),text("۷۵۰ از ۲٬۰۰۰ میلی‌لیتر","750 of 2,000 ml"),"water",glass()));
  if (cycleEnabled()) controls.prepend(cycleBanner());
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
$("finish").addEventListener("change", () => {
  document.body.dataset.finish = $("finish").value;
  refreshArtwork($("finish").value);
});
$("hero-art").addEventListener("change", () => {
  renderHero();
  renderPalette();
});
$("accent").addEventListener("change", () => {
  updateDisplay();
  renderSurfaces();
  renderControls();
  renderCatalog();
});
$("width").addEventListener("change", event => {
  if (event.target.value === "auto") delete document.querySelector(".gallery").dataset.width;
  else document.querySelector(".gallery").dataset.width = event.target.value;
});
$("cycle-preview").addEventListener("change", () => {
  accentOptions();
  renderSurfaces();
  renderControls();
  renderPalette();
  renderCatalog();
});
for (const control of document.querySelectorAll("[data-preview-target]")) {
  control.addEventListener("click", () => {
    const target = $(control.dataset.previewTarget);
    if (target instanceof HTMLDialogElement) target.showModal();
    else {
      const dock = control.closest(".gallery-dock-preview");
      if (dock) {
        dock.querySelector("[aria-current]")?.removeAttribute("aria-current");
        control.setAttribute("aria-current", "location");
      }
      target.scrollIntoView({ block: "center" });
    }
  });
}
for (const id of ["family","art-color","icon-search"]) $(id).addEventListener(id === "icon-search" ? "input" : "change", renderCatalog);
options($("family"),Object.entries(families));
options($("art-color"), [["",text("پیش‌فرض","Default")], ...Object.entries(appearanceColors)]);
installFormArt();
installChoiceArt();
$("cycle-preview").checked = previewParams.get("cycle") !== "off";
$("theme").value = ["system", "light", "dark"].includes(previewParams.get("theme")) ? previewParams.get("theme") : "light";
$("finish").value = previewParams.get("finish") === "matte" ? "matte" : "glass";
$("finish").dispatchEvent(new Event("change"));
installPanelPreview({ openSettings, openAccount, text, calendar });
accentOptions();
if ([...$("accent").options].some(option => option.value === previewParams.get("accent"))) {
  $("accent").value = previewParams.get("accent");
  updateDisplay();
}
renderSurfaces();
renderControls();
water.renderTodayWater(state, now, 750, 2000, .375);
$("today-water-quick").disabled = true;
$("open-water-history").disabled = true;
renderFinishComparison();
renderPalette();
renderCatalog();
