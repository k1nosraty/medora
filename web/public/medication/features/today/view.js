import { localDigits, locale, t } from "../../shared/i18n/locale.js";
import { routineComplete } from "../../domain/routine-plan.js";
import { doseTime } from "../../domain/care-index.js";
import { $, element } from "../../shared/ui/dom.js";

const clock = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const slotOf = event => event.time == null ? null : Math.floor(event.time / 60_000);
let selectedSlot;

export function renderToday(care, day, today, daily, visits, routines, waterTotal, renderDose, renderRoutine) {
  const events = daily.map(dose => {
    const medicine = care.medicines[dose.medicineId];
    const done = dose.status === "taken" || dose.status === "skipped";
    return {
      key: `dose:${dose.medicineId}:${dose.day}:${dose.minute}`,
      state: done ? "done" : medicine && !medicine.paused ? "pending" : "inactive",
      time: dose.status === "snoozed" && dose.snoozeUntil ? dose.snoozeUntil : doseTime(dose.day, dose.minute),
      resolvedAt: dose.resolvedAt,
      render: featured => renderDose(medicine, dose, featured ? "featured" : "day")
    };
  });
  events.push(...visits);
  for (const entry of routines) {
    const plan = care.routines?.[entry.id];
    events.push({
      key: `routine:${entry.id}`,
      state: routineComplete(entry) ? "done" : plan && !plan.paused ? "pending" : "inactive",
      time: entry.minute == null ? null : doseTime(day, entry.minute),
      resolvedAt: entry.resolvedAt,
      render: featured => renderRoutine(entry, day, { dayCard: true, featured })
    });
  }

  const now = Date.now();
  const pending = events.filter(event => event.state === "pending");
  const inactive = events.filter(event => event.state === "inactive").sort(byTime);
  const done = events.filter(event => event.state === "done").sort((a, b) =>
    (a.resolvedAt ?? 0) - (b.resolvedAt ?? 0) || byTime(a, b));
  pending.sort(day === today ? (a, b) => {
    const aOverdue = a.time != null && a.time < now;
    const bOverdue = b.time != null && b.time < now;
    if (a.time == null || b.time == null) return byTime(a, b);
    if (aOverdue !== bOverdue) return aOverdue ? 1 : -1;
    return aOverdue ? byTime(b, a) : byTime(a, b);
  } : byTime);

  const scheduled = pending.length + done.length;
  const includeWater = day <= today && (waterTotal > 0 || care.waterGoal != null ||
    care.waterReminders?.enabled === true || (day === today && scheduled > 0));
  const waterItems = includeWater ? 1 : 0;
  const waterResolved = includeWater && waterTotal >= (care.waterGoal ?? 2000) ? 1 : 0;
  const resolved = done.length + waterResolved;
  const total = scheduled + waterItems;
  $("today-count").hidden = !total || day > today;
  $("today-count").textContent = t("{0} از {1} مورد رسیدگی شد", localDigits(resolved), localDigits(total));
  const previousSlot = selectedSlot?.day === day ? selectedSlot : null;
  const candidates = day === today ? pending : [];
  const focused = candidates.find(event => previousSlot && slotOf(event) === previousSlot.slot) ?? candidates[0];
  const slot = focused ? slotOf(focused) : null;
  const group = slot === null ? [] : pending.filter(event => slotOf(event) === slot);
  const grouped = group.length > 1 || (group.length > 0 && previousSlot?.slot === slot);
  selectedSlot = null;
  const doseLabel = daily.length === 1 ? t("۱ نوبت دارو") : t("{0} نوبت دارو", localDigits(daily.length));
  const visitLabel = visits.length === 1 ? t("۱ قرار") : t("{0} قرار", localDigits(visits.length));
  const routineLabel = routines.length === 1 ? t("۱ روتین") : t("{0} روتین", localDigits(routines.length));
  $("program-medications").textContent = doseLabel;
  $("program-appointments").textContent = visitLabel;
  $("program-routines").textContent = routineLabel;
  $("story-summary").textContent = daily.length || visits.length || routines.length
    ? [doseLabel, visitLabel, ...(routines.length ? [routineLabel] : [])].join(" · ")
    : t("برای این روز برنامه‌ای ثبت نشده است.");
  const focus = $("today-focus");
  const restoreFocus = focus.contains(document.activeElement);
  focus.replaceChildren();
  if (grouped) {
    const sameSlot = previousSlot?.slot === slot;
    const previousIndex = sameSlot ? group.findIndex(event => event.key === previousSlot.key) : -1;
    const index = previousIndex >= 0 ? previousIndex : sameSlot && previousSlot.index < group.length ? previousSlot.index : 0;
    selectedSlot = { day, slot, index, key: group[index].key };
    renderGroup(focus, group, selectedSlot);
  } else if (focused) {
    const heading = focused.time == null || focused.time < now ? t("در انتظار رسیدگی") : t("بعدی در برنامه");
    focus.append(element("h3", heading, "day-queue-heading"), focused.render(true));
  }
  else if (day === today) {
    const completed = total > 0 && resolved === total;
    const hero = element("div");
    hero.className = "today-state";
    hero.dataset.complete = String(completed);
    const art = element("span");
    art.className = "today-state-art";
    art.setAttribute("aria-hidden", "true");
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const symbol = document.createElementNS(icon.namespaceURI, "use");
    symbol.setAttribute("href", completed ? "#art-today-complete" : "#i-calendar");
    icon.append(symbol);
    art.append(icon);
    const copy = element("div");
    const title = completed ? t("برنامهٔ امروز کامل شد") : total ? t("ادامهٔ روز") : t("روزتان را بچینید");
    const summary = completed ? t("همهٔ موارد برنامهٔ امروز ثبت شدند.") :
      total ? t("{0} مورد از برنامهٔ امروز هنوز باقی مانده است.", localDigits(total - resolved)) :
      t("از «افزودن» در نوار پایین، اولین برنامه را ثبت کنید.");
    copy.append(element("h3", title), element("p", summary));
    hero.append(copy, art);
    focus.append(hero);
  }
  focus.hidden = day !== today;
  if (restoreFocus) focus.querySelector(".day-card-actions > button")?.focus({ preventScroll: true });
  const cards = [...pending.filter(event => grouped || event !== focused), ...inactive].map(event => event.render(false));
  if (done.length) {
    cards.push(element("h4", t("موارد رسیدگی‌شده"), "day-queue-heading day-queue-done"));
    for (const event of done) {
      const card = event.render(false);
      card.dataset.dayState = "done";
      cards.push(card);
    }
  }
  $("timeline-title").textContent = focused && !grouped ? t("بقیهٔ برنامه‌های روز") : t("داروها، قرارها و روتین‌ها");
  $("doses").closest(".timeline").hidden = day === today && !cards.length;
  $("doses").replaceChildren(...(cards.length ? cards : [element("p", t("برای این روز برنامه‌ای ثبت نشده است."), "empty")]));
}

function renderGroup(focus, group, selection) {
  const header = element("div", "", "day-focus-header");
  const title = t("ساعت {0}", clock.format(group[0].time));
  const heading = group.length > 1 ? `${title} · ${t("{0} برنامهٔ هم‌زمان", localDigits(group.length))}` : title;
  header.append(element("h3", heading, "day-queue-heading"));
  const viewport = element("div", "", "day-focus-viewport");
  focus.append(header, viewport);
  viewport.append(group[selection.index].render(true));
  if (group.length < 2) return;
  viewport.classList.add("day-focus-swipe");

  const controls = element("div", "", "day-focus-controls");
  const position = element("span", "", "day-focus-position");
  position.setAttribute("aria-live", "polite");
  const previous = arrow(t("برنامهٔ قبلی"), "previous");
  const next = arrow(t("برنامهٔ بعدی"), "next");
  controls.append(previous, position, next);
  header.append(controls);
  const rtl = document.documentElement.dir === "rtl";
  const swipeOffset = dx => Math.sign(dx) * (rtl ? 1 : -1);

  function updateControls() {
    previous.setAttribute("aria-disabled", String(selection.index === 0));
    next.setAttribute("aria-disabled", String(selection.index === group.length - 1));
    position.textContent = t("{0} از {1}", localDigits(selection.index + 1), localDigits(group.length));
  }
  function move(offset) {
    const index = selection.index + offset;
    if (!group[index]) return;
    selection.index = index;
    selection.key = group[index].key;
    const card = group[index].render(true);
    card.style.setProperty("--day-focus-entry", offset === (rtl ? 1 : -1) ? "-1.1rem" : "1.1rem");
    card.classList.add("day-focus-enter");
    viewport.replaceChildren(card);
    updateControls();
  }
  previous.addEventListener("click", () => move(-1));
  next.addEventListener("click", () => move(1));
  updateControls();

  let gesture;
  viewport.addEventListener("pointerdown", event => {
    if (!event.isPrimary || event.pointerType === "mouse" ||
      event.target.closest("button, summary, input, select, textarea, a, .day-card-more[open]")) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  viewport.addEventListener("pointermove", event => {
    if (gesture?.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    if (Math.abs(dx) <= Math.abs(event.clientY - gesture.y) || Math.abs(dx) < 8) return;
    const limit = group[selection.index + swipeOffset(dx)] ? 72 : 15;
    viewport.classList.add("day-focus-dragging");
    viewport.style.setProperty("--day-focus-drag", `${Math.max(-limit, Math.min(limit, dx * .65))}px`);
  });
  function endGesture(event) {
    if (gesture?.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    gesture = null;
    viewport.classList.remove("day-focus-dragging");
    viewport.style.removeProperty("--day-focus-drag");
    if (event.type === "pointerup" && Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      move(swipeOffset(dx));
    }
  }
  viewport.addEventListener("pointerup", endGesture);
  viewport.addEventListener("pointercancel", endGesture);
  viewport.addEventListener("lostpointercapture", endGesture);
}

function arrow(label, direction) {
  const control = element("button", "", `secondary icon-button day-focus-${direction}`);
  control.type = "button";
  control.setAttribute("aria-label", label);
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const use = document.createElementNS(icon.namespaceURI, "use");
  icon.setAttribute("aria-hidden", "true");
  use.setAttribute("href", "#i-back");
  icon.append(use);
  control.append(icon);
  return control;
}

function byTime(a, b) {
  if (a.time === b.time) return 0;
  return (a.time ?? Infinity) - (b.time ?? Infinity);
}
