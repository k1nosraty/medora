import { glassObject } from "../../design/three-dimensional.js";
import { localDigits, locale, t } from "../../shared/i18n/locale.js";
import { routineComplete } from "../../domain/routine-plan.js";
import { doseTime } from "../../domain/care-index.js";
import { $, element } from "../../shared/ui/dom.js";

const clock = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const slotOf = event => event.time == null ? null : Math.floor(event.time / 60_000);
let selectedSlot;

export function renderToday(care, day, today, daily, visits, routines, waterTotal, renderDose, renderRoutine, view) {
  const scheduledAt = view?.timeOf ?? doseTime;
  const events = daily.map(dose => {
    const medicine = care.medicines[dose.medicineId];
    const done = dose.status === "taken" || dose.status === "skipped";
    return {
      key: `dose:${dose.medicineId}:${dose.day}:${dose.minute}`,
      state: done ? "done" : medicine && !medicine.paused ? "pending" : "inactive",
      time: dose.status === "snoozed" && dose.snoozeUntil ? dose.snoozeUntil : scheduledAt(dose.day, dose.minute),
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
      time: entry.minute == null ? null : scheduledAt(day, entry.minute),
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
  const includeWater = view?.has("water") !== false && day <= today && (waterTotal > 0 || care.waterGoal != null ||
    care.waterReminders?.enabled === true || (day === today && scheduled > 0));
  const waterItems = includeWater ? 1 : 0;
  const waterResolved = includeWater && waterTotal >= (care.waterGoal ?? 2000) ? 1 : 0;
  const resolved = done.length + waterResolved;
  const total = scheduled + waterItems;
  $("today-count").hidden = !total || day > today || (view?.has("doses") === false && daily.length > 0);
  $("today-count").textContent = t("ui.value-of-value-items-handled", localDigits(resolved), localDigits(total));
  const previousSlot = selectedSlot?.day === day ? selectedSlot : null;
  const candidates = day === today ? pending : [];
  const focused = candidates.find(event => previousSlot && slotOf(event) === previousSlot.slot) ?? candidates[0];
  const slot = focused ? slotOf(focused) : null;
  const group = slot === null ? [] : pending.filter(event => slotOf(event) === slot);
  const grouped = group.length > 1 || (group.length > 0 && previousSlot?.slot === slot);
  selectedSlot = null;
  const doseLabel = daily.length === 1 ? t("ui.1-dose") : t("ui.value-doses", localDigits(daily.length));
  const visitLabel = visits.length === 1 ? t("ui.1-appointment") : t("ui.value-appointments", localDigits(visits.length));
  const routineLabel = routines.length === 1 ? t("ui.1-routine") : t("ui.value-routines", localDigits(routines.length));
  $("program-medications").textContent = doseLabel;
  $("program-appointments").textContent = visitLabel;
  $("program-routines").textContent = routineLabel;
  const labels = [[daily.length, doseLabel, "medications"], [visits.length, visitLabel, "appointments"], [routines.length, routineLabel, "routines"]];
  $("story-summary").textContent = labels.some(([count]) => count)
    ? labels.filter(([count, , section]) => view ? view.canView(section) && count : section !== "routines" || count)
      .map(([, label]) => label).join(" · ")
    : t(view && !view.synced ? "هنوز سابقه‌ای از این حساب همگام نشده است." : "برای این روز برنامه‌ای ثبت نشده است.");
  const focus = $("today-focus");
  focus.replaceChildren();
  if (grouped) {
    const sameSlot = previousSlot?.slot === slot;
    const previousIndex = sameSlot ? group.findIndex(event => event.key === previousSlot.key) : -1;
    const index = previousIndex >= 0 ? previousIndex : sameSlot && previousSlot.index < group.length ? previousSlot.index : 0;
    selectedSlot = { day, slot, index, key: group[index].key };
    renderGroup(focus, group, selectedSlot);
  } else if (focused) {
    const heading = focused.time == null || focused.time < now ? t("ui.still-pending") : t("ui.up-next");
    const card = focused.render(true);
    card.dataset.focusScope = focused.key;
    focus.append(element("h3", heading, "day-queue-heading"), card);
  }
  else if (day === today) {
    const completed = total > 0 && resolved === total;
    const hero = element("div");
    hero.className = "today-state";
    hero.dataset.complete = String(completed);
    const art = element("span");
    art.className = "today-state-art";
    art.setAttribute("aria-hidden", "true");
    art.append(glassObject(completed ? "complete" : "control-calendar", "image"));
    const copy = element("div");
    const title = completed ? t("ui.today-s-plan-is-complete") : total ? t("ui.later-today") : t("ui.plan-your-day");
    const summary = completed ? t("ui.everything-on-today-s-plan-has-been-logged") :
      total ? t("ui.value-items-left-on-today-s-plan", localDigits(total - resolved)) :
      t(view ? "برای این روز برنامه‌ای ثبت نشده است." : "ui.add-a-medicine-appointment-or-routine-to-your-plan");
    copy.append(element("h3", title), element("p", summary));
    if (!total && !view) {
      const add = element("button", t("ui.add-your-first-plan"));
      add.type = "button";
      add.dataset.openQuick = "";
      copy.append(add);
    }
    hero.append(copy, art);
    focus.append(hero);
  }
  focus.hidden = day !== today;
  const cards = [...pending.filter(event => grouped || event !== focused), ...inactive].map(event => {
    const card = event.render(false);
    card.dataset.focusScope = event.key;
    return card;
  });
  if (done.length) {
    cards.push(element("h4", t("ui.handled"), "day-queue-heading day-queue-done"));
    for (const event of done) {
      const card = event.render(false);
      card.dataset.focusScope = event.key;
      card.dataset.dayState = "done";
      cards.push(card);
    }
  }
  $("timeline-title").textContent = focused && !grouped ? t("ui.the-rest-of-the-day") : t("ui.doses-appointments-and-routines");
  $("doses").closest(".timeline").hidden = day === today && !cards.length;
  $("doses").replaceChildren(...(cards.length ? cards : [element("p", t("ui.nothing-planned-for-this-day"), "empty")]));
}

function renderGroup(focus, group, selection) {
  const header = element("div", "", "day-focus-header");
  const title = t("ui.at-value", clock.format(group[0].time));
  const heading = group.length > 1 ? `${title} · ${t("ui.value-items-at-this-time", localDigits(group.length))}` : title;
  header.append(element("h3", heading, "day-queue-heading"));
  const viewport = element("div", "", "day-focus-viewport");
  focus.append(header, viewport);
  viewport.append(group[selection.index].render(true));
  if (group.length < 2) return;
  viewport.classList.add("day-focus-swipe");

  const controls = element("div", "", "day-focus-controls");
  const position = element("span", "", "day-focus-position");
  position.setAttribute("aria-live", "polite");
  const previous = arrow(t("ui.previous-item"), "previous");
  const next = arrow(t("ui.next-item"), "next");
  controls.append(previous, position, next);
  header.append(controls);
  const rtl = document.documentElement.dir === "rtl";
  const swipeOffset = dx => Math.sign(dx) * (rtl ? 1 : -1);

  function updateControls() {
    previous.setAttribute("aria-disabled", String(selection.index === 0));
    next.setAttribute("aria-disabled", String(selection.index === group.length - 1));
    position.textContent = t("ui.value-of-value", localDigits(selection.index + 1), localDigits(group.length));
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
