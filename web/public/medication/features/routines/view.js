import { appearanceColors } from "../medicines/appearance.js";
import { language, localDigits, t } from "../../shared/i18n/locale.js";
import { $, button, element, fitDialogToViewport } from "../../shared/ui/dom.js";
import { isoDay, timeText, trackSchedule } from "../../domain/care-index.js";
import { clockMinute } from "../../domain/care-plan.js";
import { integer as readAmount } from "../../shared/ui/input-values.js";
import { dayMs } from "../../domain/wall-clock.js";
import { routineCategories, routineLabels } from "./catalog.js";
import { defaultRoutineColor, maxRoutineAmount, maxRoutines, maxRoutineSteps, routineComplete, routineLog, routineOccurs, routineWeekday } from "../../domain/routine-plan.js";

import { routineCard } from "./card.js";
import { routineIllustration as glyph } from "./illustration.js";

const days = [t("دوشنبه"), t("سه‌شنبه"), t("چهارشنبه"), t("پنجشنبه"), t("جمعه"), t("شنبه"), t("یکشنبه")];
const fields = id => $("routine-" + id);
const labelFor = category => t(Object.hasOwn(routineLabels, category) ? routineLabels[category] : routineLabels.custom);
const colorOf = color => Object.hasOwn(appearanceColors, color) ? color : defaultRoutineColor;
const changed = () => new Error(t("روتین تغییر کرده است. دوباره آن را باز کنید."));

function displayAmount(entry, amount) {
  return [localDigits(amount), entry.unit].filter(Boolean).join(" ");
}

function normalizeSearch(text) {
  return text.toLowerCase().replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[\s‌-]+/g, "");
}

export function installRoutines({ getState, today, mutate, render, formatDay, refreshFields, requestDeletion }) {
  const editor = fields("editor");
  const form = fields("form");
  const logDialog = fields("log-dialog");
  const fitEditor = fitDialogToViewport(editor);
  const fitLog = fitDialogToViewport(logDialog);
  let editing;
  let logging;
  let filter = "today";
  let historyLimit = 14;
  const categoryDialog = fields("category-dialog");
  const fitCategory = fitDialogToViewport(categoryDialog);
  const categoryOpen = fields("category-open");
  const categorySearch = fields("category-search");
  let category = "custom";

  function chooseCategory(key) {
    category = Object.hasOwn(routineLabels, key) ? key : "custom";
    fields("preview").replaceChildren(glyph(category));
    fields("category-label").textContent = labelFor(category);
    categoryOpen.setAttribute("aria-label", t("نوع روتین، {0}", labelFor(category)));
    for (const control of fields("categories").querySelectorAll("button")) {
      control.setAttribute("aria-pressed", String(control.dataset.category === category));
    }
  }

  function buildCategories() {
    if (fields("categories").childElementCount) return;
    for (const [heading, choices] of Object.entries(routineCategories)) {
      const group = element("section", "", "routine-category-group");
      const options = element("div", "", "routine-category-grid");
      group.append(element("h3", t(heading)), options);
      for (const [key, label] of Object.entries(choices)) {
        const control = button("", () => {
          chooseCategory(key);
          categoryDialog.close();
        });
        control.dataset.category = key;
        control.setAttribute("aria-pressed", String(key === category));
        control.append(glyph(key), element("span", t(label)));
        options.append(control);
      }
      fields("categories").append(group);
    }
  }

  function filterCategories() {
    const search = normalizeSearch(categorySearch.value);
    let any = false;
    for (const group of fields("categories").children) {
      let found = false;
      const heading = normalizeSearch(group.firstElementChild.textContent);
      for (const control of group.querySelectorAll("button")) {
        const match = (heading + normalizeSearch(control.textContent)).includes(search);
        control.hidden = !match;
        found ||= match;
      }
      group.hidden = !found;
      any ||= found;
    }
    fields("no-categories").hidden = any;
  }
  categorySearch.addEventListener("input", filterCategories);
  categoryOpen.addEventListener("click", () => {
    categorySearch.value = "";
    buildCategories();
    filterCategories();
    categoryDialog.showModal();
    categoryDialog.scrollTop = 0;
    fitCategory();
  });

  const colorGrid = fields("colors").querySelector(".visit-color-grid");
  const colors = Object.entries(appearanceColors).map(([id, title]) => {
    const option = element("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "routine-color";
    input.value = id;
    input.dataset.ink = id;
    option.append(input, element("span", title));
    colorGrid.append(option);
    return input;
  });
  fields("colors").addEventListener("change", event => { fields("preview").dataset.ink = event.target.value; });

  const weekdayFields = (language === "fa" ? [5, 6, 0, 1, 2, 3, 4] : [6, 0, 1, 2, 3, 4, 5]).map(index => {
    const field = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = 1 << index;
    field.append(input, days[index]);
    fields("weekdays").append(field);
    return input;
  });

  function updateFields() {
    const mode = fields("mode").value;
    fields("weekly").hidden = fields("repeat").value !== "weekly";
    fields("target-fields").hidden = mode !== "quantity";
    fields("steps-field").hidden = mode !== "steps";
    fields("reminder-help").hidden = !fields("reminder").checked || Boolean(getState()?.reminders?.enabled);
  }

  function openEditor(plan) {
    editing = plan;
    form.reset();
    fields("editor-title").textContent = plan ? t("ویرایش روتین") : t("روتین جدید");
    fields("name").value = plan?.name ?? "";
    chooseCategory(plan?.category);
    const color = colorOf(plan?.color);
    for (const input of colors) input.checked = input.value === color;
    fields("preview").dataset.ink = color;
    fields("repeat").value = plan && (plan.mask !== 127 || plan.interval !== 1) ? "weekly" : "daily";
    fields("interval").value = plan?.interval ?? 1;
    fields("start").value = isoDay(plan?.start ?? today());
    const mask = plan?.mask === 127 || !plan ? 1 << routineWeekday(today()) : plan.mask;
    for (const input of weekdayFields) input.checked = Boolean(mask & Number(input.value));
    fields("time").value = plan?.minute == null ? "" : timeText(plan.minute);
    fields("reminder").checked = Boolean(plan?.reminder);
    fields("mode").value = plan?.mode ?? "done";
    fields("target").value = plan?.target ?? "";
    fields("unit").value = plan?.unit ?? "";
    fields("steps").value = plan?.steps?.join("\n") ?? "";
    fields("notes").value = plan?.notes ?? "";
    fields("options").open = Boolean(plan && (plan.start !== today() || plan.minute !== null || plan.mode !== "done" || plan.notes));
    fields("management").hidden = !plan;
    fields("pause").textContent = plan?.paused ? t("ازسرگیری روتین") : t("توقف موقت");
    fields("editor-status").textContent = "";
    updateFields();
    refreshFields(editor);
    editor.showModal();
    fitEditor();
  }

  for (const control of document.querySelectorAll("[data-open-routine]")) {
    control.addEventListener("click", () => openEditor());
  }
  form.addEventListener("change", updateFields);
  form.addEventListener("input", () => { fields("editor-status").textContent = ""; });
  fields("reminder").addEventListener("change", () => {
    if (fields("reminder").checked && !fields("time").value) {
      fields("time").value = "08:00";
      refreshFields(editor);
    }
  });

  function formPlan() {
    const name = fields("name").value.trim();
    if (!name) {
      fields("name").focus();
      throw new Error(t("نام روتین را وارد کنید."));
    }
    const start = Date.parse(fields("start").value + "T00:00:00Z") / dayMs;
    const date = fields("start").value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(start) || isoDay(start) !== date) {
      fields("options").open = true;
      throw new Error(t("تاریخ را کامل وارد کنید."));
    }
    const weekly = fields("repeat").value === "weekly";
    const mask = weekly ? weekdayFields.reduce((bits, input) => bits | (input.checked ? Number(input.value) : 0), 0) : 127;
    if (!mask) throw new Error(t("حداقل یک روز را انتخاب کنید."));
    const time = fields("time").value;
    const minute = time ? clockMinute(time) : null;
    const reminder = fields("reminder").checked;
    if (reminder && minute === null) {
      fields("options").open = true;
      throw new Error(t("برای اعلان، ساعت روتین را وارد کنید."));
    }
    const mode = fields("mode").value;
    const target = readAmount(fields("target").value);
    const steps = fields("steps").value.split("\n").map(step => step.trim()).filter(Boolean);
    if (mode === "quantity" && (!Number.isInteger(target) || target < 1 || target > maxRoutineAmount)) {
      fields("options").open = true;
      fields("target").focus();
      throw new Error(t("مقدار هدف را از ۱ تا ۹۹٬۹۹۹ وارد کنید."));
    }
    if (mode === "steps" && (!steps.length || steps.length > maxRoutineSteps || steps.some(step => step.length > 70))) {
      fields("options").open = true;
      fields("steps").focus();
      throw new Error(t("۱ تا ۱۲ مرحله وارد کنید. هر مرحله حداکثر ۷۰ نویسه."));
    }
    return {
      id: editing?.id ?? crypto.randomUUID(), name, category, color: colorOf(colors.find(input => input.checked)?.value), start, mask,
      interval: weekly ? Number(fields("interval").value) : 1, minute, reminder, mode,
      notes: fields("notes").value.trim(), paused: editing?.paused ?? false, revision: (editing?.revision ?? 0) + 1,
      ...(mode === "quantity" ? { target, unit: fields("unit").value.trim() } : {}),
      ...(mode === "steps" ? { steps } : {})
    };
  }

  function ensureCurrent(state, plan) {
    if (!plan || state.routines?.[plan.id]?.revision !== plan.revision) throw changed();
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const save = fields("save");
    if (save.disabled) return;
    let plan;
    try {
      plan = formPlan();
    } catch (error) {
      fields("editor-status").textContent = error.message;
      return;
    }
    const previous = editing;
    save.disabled = true;
    try {
      const ok = await mutate(state => {
        const routines = state.routines ??= {};
        if (previous) ensureCurrent(state, previous);
        else if (Object.keys(routines).length >= maxRoutines) throw new Error(t("حداکثر {0} روتین می‌توانید داشته باشید.", localDigits(maxRoutines)));
        trackSchedule(state, "routines", routines[plan.id], plan, Date.now());
        routines[plan.id] = plan;
      }, t("روتین ذخیره شد."), plan.reminder || Boolean(previous?.reminder), today());
      if (ok) editor.close();
      else fields("editor-status").textContent = $("status").textContent || t("ذخیره انجام نشد. دوباره تلاش کنید.");
    } finally {
      save.disabled = false;
    }
  });

  fields("pause").addEventListener("click", async () => {
    const plan = editing;
    const pause = fields("pause");
    if (pause.disabled || !plan) return;
    pause.disabled = true;
    try {
      const ok = await mutate(state => {
        ensureCurrent(state, plan);
        const current = state.routines[plan.id];
        const next = { ...current, paused: !current.paused, revision: current.revision + 1 };
        trackSchedule(state, "routines", current, next, Date.now());
        state.routines[plan.id] = next;
      }, plan.paused ? t("روتین از سر گرفته شد.") : t("روتین موقتاً متوقف شد."), plan.reminder, today());
      if (ok) editor.close();
      else fields("editor-status").textContent = $("status").textContent;
    } finally {
      pause.disabled = false;
    }
  });

  fields("delete").addEventListener("click", () => {
    const plan = editing;
    if (!plan) return;
    requestDeletion({
      title: t("حذف روتین"), message: t("روتین «{0}» حذف شود؟ سوابق آن حفظ می‌شوند.", plan.name),
      change: state => {
        ensureCurrent(state, plan);
        trackSchedule(state, "routines", state.routines[plan.id], null, Date.now());
        delete state.routines[plan.id];
      },
      success: t("روتین حذف شد."), parent: editor.id
    });
  });

  async function saveLog({ entry, day, plan, recorded }, result) {
    return mutate(state => {
      if (day !== today()) throw new Error(t("این روز گذشته است. سوابق را در بخش روتین‌ها ببینید."));
      ensureCurrent(state, plan);
      const records = state.routineLogs[day];
      const previous = records[entry.id];
      if (JSON.stringify(previous) !== JSON.stringify(recorded) || (!previous && !routineOccurs(plan, day))) throw changed();
      const latest = previous ?? plan;
      const updated = routineLog(latest, result);
      if (updated) {
        if (routineComplete(updated)) updated.resolvedAt = previous?.resolvedAt ?? Date.now();
        records[entry.id] = updated;
      } else delete records[entry.id];
    }, t("پیشرفت روتین ذخیره شد."), Boolean(plan?.reminder), day);
  }

  function openLog(activity) {
    logging = activity;
    const { entry, day, plan, readOnly } = activity;
    const banner = card(entry, day, { dayCard: true, readOnly, summaryOnly: true });
    banner.querySelector("h3").id = "routine-log-title";
    fields("log-banner").replaceChildren(banner);
    const notes = plan?.notes;
    fields("log-notes").textContent = notes;
    fields("log-notes").hidden = !notes;
    fields("log-status").textContent = "";
    const quantity = entry.mode === "quantity";
    fields("amount-field").hidden = !quantity || readOnly === true;
    fields("amount").value = entry.amount ?? "";
    fields("log-goal").textContent = quantity ? t("هدف: {0}", displayAmount(entry, entry.target)) : "";
    const save = fields("log-save");
    save.hidden = readOnly === true;
    save.textContent = t(entry.mode === "done" ? "انجام دادم" : "ذخیرهٔ پیشرفت");
    const steps = !readOnly && entry.mode === "steps" ? entry.steps : [];
    fields("log-steps").replaceChildren(...steps.map((step, index) => {
      const label = element("label", "", "routine-check");
      const control = document.createElement("input");
      control.type = "checkbox";
      control.value = index;
      control.checked = entry.checked?.includes(index) ?? false;
      const text = element("span", step);
      text.dir = "auto";
      label.append(control, text);
      return label;
    }));
    if (readOnly && !routineComplete(entry)) fields("log-steps").append(element("p", t("ثبت این نوبت بسته است."), "quiet"));
    logDialog.showModal();
    fitLog();
    if (!readOnly && quantity) fields("amount").focus();
    else if (!readOnly && entry.mode === "done") save.focus();
  }

  function openReminder(entry, day) {
    if (!entry) {
      $("status").textContent = t("این نوبت روتین دیگر در دسترس نیست.");
      return;
    }
    const state = getState();
    const plan = state.routines?.[entry.id];
    const recorded = state.routineLogs[day]?.[entry.id];
    openLog({ entry, day, plan, recorded, readOnly: day !== today() || !plan || routineComplete(entry) });
  }

  fields("log-form").addEventListener("submit", async event => {
    event.preventDefault();
    const save = fields("log-save");
    if (!logging || logging.readOnly || save.disabled) return;
    const quantity = logging.entry.mode === "quantity";
    const result = logging.entry.mode === "done" ? true : quantity ? readAmount(fields("amount").value) :
      [...fields("log-steps").querySelectorAll("input:checked")].map(input => Number(input.value));
    if (quantity && !Number.isInteger(result)) {
      fields("log-status").textContent = t("مقدار را از ۰ تا ۹۹٬۹۹۹ وارد کنید. صفر، ثبت را پاک می‌کند.");
      fields("amount").focus();
      return;
    }
    save.disabled = true;
    try {
      const activity = logging;
      if (await saveLog(activity, result)) {
        if (logging === activity) logDialog.close();
        focusLogAction(activity.entry.id);
      } else if (logging === activity) fields("log-status").textContent = $("status").textContent;
    } finally {
      save.disabled = false;
    }
  });

  function focusLogAction(id) {
    const row = document.querySelector(`[data-screen]:not([hidden]) [data-routine-id="${CSS.escape(id)}"]`);
    const control = row?.querySelector(":scope > button, .day-card-actions > button") ??
      row?.querySelector(".day-card-more > summary");
    control?.focus({ preventScroll: true });
  }

  const card = routineCard({
    getState, today, colorOf, labelFor, days, formatDay, openEditor, saveLog, focusLogAction, openLog, displayAmount
  });

  function renderPanel(state, index, day) {
    const plans = Object.values(state.routines ?? {});
    const entries = index.routinesOn(day);
    const done = entries.filter(routineComplete).length;
    fields("progress").textContent = entries.length
      ? t("{0} از {1} روتین انجام شد", localDigits(done), localDigits(entries.length))
      : t("برای این روز روتینی ثبت نشده است.");
    fields("meter").value = entries.length ? done / entries.length : 0;
    fields("meter").hidden = !entries.length;
    document.querySelector('[data-routine-filter="today"]').textContent = day === today() ? t("امروز") : t("این روز");
    fields("search-wrap").hidden = filter === "today" ||
      (filter === "all" ? !plans.length : !Object.keys(state.routineLogs).length);
    fields("first").hidden = plans.length > 0;
    fields("more").hidden = true;
    let rows;
    let empty;
    const search = normalizeSearch(fields("search").value);
    const matches = plan => normalizeSearch(plan.name + " " + labelFor(plan.category)).includes(search);
    if (filter === "all") {
      rows = plans.filter(matches)
        .sort((a, b) => Number(a.paused) - Number(b.paused)).map(plan => card(plan, day, { manage: true }));
      empty = plans.length ? t("روتینی با این نام پیدا نشد.") : t("اولین روتین خودتان را بسازید.");
    } else if (filter === "history") {
      const history = Object.entries(state.routineLogs).map(([date, records]) =>
        [Number(date), Object.entries(records).filter(([, entry]) => matches(entry))])
        .filter(([, records]) => records.length).sort(([a], [b]) => b - a);
      fields("more").hidden = history.length <= historyLimit;
      rows = history.slice(0, historyLimit).flatMap(([date, records]) => [
        element("h3", formatDay(date, true), "routine-day-heading"),
        ...records.map(([id, entry]) => card({ ...entry, id }, date, { readOnly: true }))
      ]);
      empty = t(search ? "روتینی با این نام پیدا نشد." : "هنوز پیشرفت روتینی ثبت نشده است.");
    } else {
      rows = entries.map(entry => card(entry, day));
      empty = plans.length ? t("برای این روز روتینی ثبت نشده است.") : t("اولین روتین خودتان را بسازید.");
    }
    fields("list").replaceChildren(...(rows.length ? rows : [element("p", empty, "empty")]));
  }

  const filters = [...document.querySelectorAll("[data-routine-filter]")];
  for (const control of filters) control.addEventListener("click", () => {
    filter = control.dataset.routineFilter;
    fields("search").value = "";
    for (const item of filters) item.setAttribute("aria-pressed", String(item === control));
    render();
  });
  fields("search").addEventListener("input", () => { historyLimit = 14; render(); });
  fields("more").addEventListener("click", () => { historyLimit += 14; render(); });
  return { card, renderPanel, openReminder };
}
