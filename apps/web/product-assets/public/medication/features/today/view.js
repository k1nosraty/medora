import { glassObject } from "../../design/three-dimensional.js";
import { localDigits, t } from "../../shared/i18n/locale.js";
import { routineComplete } from "../../domain/routine-plan.js";
import { doseTime } from "../../domain/care-index.js";
import { $, button, element } from "../../shared/ui/dom.js";

const slotOf = event => event.time == null ? null : Math.floor(event.time / 60_000);
let selectedSlot;

export function renderToday(care, day, today, daily, visits, routines, waterTotal, renderDose, renderRoutine, view) {
  const scheduledAt = view?.timeOf ?? doseTime;
  const events = daily.map(dose => {
    const medicine = care.medicines[dose.medicineId];
    const done = dose.status === "taken" || dose.status === "skipped";
    return {
      key: `dose:${dose.medicineId}:${dose.day}:${dose.minute}`,
      title: dose.name || dose.historyPlan?.name || medicine?.name || t("ui.medicine"),
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
      title: entry.name,
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
  const progress = $("today-count");
  progress.hidden = !total || day > today || (view?.has("doses") === false && daily.length > 0);
  progress.textContent = t("ui.value-of-value-items-handled", localDigits(resolved), localDigits(total));
  progress.style.setProperty("--day-progress", total ? `${100 * resolved / total}%` : "0%");
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
  const controls = $("day-focus-navigation");
  focus.replaceChildren();
  controls.replaceChildren();
  controls.hidden = group.length < 2;
  if (grouped) {
    const sameSlot = previousSlot?.slot === slot;
    const previousIndex = sameSlot ? group.findIndex(event => event.key === previousSlot.key) : -1;
    const index = previousIndex >= 0 ? previousIndex : sameSlot && previousSlot.index < group.length ? previousSlot.index : 0;
    selectedSlot = { day, slot, index, key: group[index].key };
    renderGroup(focus, controls, group, selectedSlot);
  } else if (focused) {
    const heading = focused.time == null || focused.time < now ? t("ui.still-pending") : t("ui.up-next");
    focus.append(featuredCard(focused, heading));
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
      const add = element("button", t("ui.add-your-first-plan"), "primary-action");
      add.type = "button";
      add.dataset.openQuick = "";
      copy.append(add);
    }
    hero.append(copy, art);
    focus.append(hero);
  }
  focus.hidden = day !== today;
  const queue = [...pending.filter(event => grouped || event !== focused), ...inactive];
  const order = $("timeline-order");
  order.closest(".timeline-sort").hidden = !queue.length && !done.length;
  if (order.value !== "default") {
    const direction = order.value === "latest" ? -1 : 1;
    const compare = (a, b) => a.time == null || b.time == null ? byTime(a, b) : direction * byTime(a, b);
    queue.sort(compare);
    done.sort(compare);
  }
  const cards = queue.map(timelineCard);
  if (done.length) {
    cards.push(element("h4", t("ui.handled"), "day-queue-heading day-queue-done"));
    for (const event of done) cards.push(timelineCard(event));
  }
  $("timeline-title").textContent = focused && !grouped ? t("ui.the-rest-of-the-day") : t("ui.doses-appointments-and-routines");
  $("doses").closest(".timeline").hidden = day === today && !cards.length;
  $("doses").replaceChildren(...(cards.length ? cards : [element("p", t("ui.nothing-planned-for-this-day"), "empty")]));
}

function timelineCard(event) {
  const card = event.render(false);
  card.dataset.focusScope = event.key;
  if (event.state === "done") card.dataset.dayState = "done";
  return card;
}

function renderGroup(focus, controls, group, selection) {
  const viewport = element("div", "", "day-focus-viewport");
  focus.append(viewport);
  const rtl = document.documentElement.dir === "rtl";
  const swipeOffset = dx => Math.sign(dx) * (rtl ? 1 : -1);
  const status = t(group[0].time < Date.now() ? "ui.still-pending" : "ui.up-next");

  function show(index, source) {
    if (!group[index]) return;
    const offset = Math.sign(index - selection.index);
    selection.index = index;
    selection.key = group[index].key;
    const card = featuredCard(group[index], status);
    const record = card.querySelector(".care-record-action");
    if (record) record.dataset.focusKey = "day-focus-record";
    if (offset) {
      card.style.setProperty("--day-focus-entry", offset === (rtl ? 1 : -1) ? "-1.1rem" : "1.1rem");
      card.classList.add("day-focus-enter");
    }
    if (group.length > 1) {
      controls.setAttribute("role", "group");
      controls.setAttribute("aria-label", t("ui.same-time-plans",
        t("ui.value-of-value", localDigits(index + 1), localDigits(group.length))));
      controls.replaceChildren(...group.map((event, option) => {
        const dot = button("", () => show(option, "day-focus-dot-" + option));
        dot.className = "day-focus-dot";
        dot.dataset.focusKey = "day-focus-dot-" + option;
        dot.setAttribute("aria-label", event.title + " · " +
          t("ui.value-of-value", localDigits(option + 1), localDigits(group.length)));
        dot.setAttribute("aria-pressed", String(option === index));
        dot.tabIndex = option === index ? 0 : -1;
        dot.addEventListener("keydown", key => {
          const direction = { ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1 }[key.key];
          const destination = key.key === "Home" ? 0 : key.key === "End" ? group.length - 1 :
            direction ? index + direction : null;
          if (destination === null || !group[destination]) return;
          key.preventDefault();
          show(destination, "day-focus-dot-" + destination);
        });
        return dot;
      }));
    }
    viewport.replaceChildren(card);
    if (source) controls.querySelector(`[data-focus-key="${source}"]`)?.focus({ preventScroll: true });
  }
  show(selection.index);
  if (group.length < 2) return;
  viewport.classList.add("day-focus-swipe");

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
      show(selection.index + swipeOffset(dx));
    }
  }
  viewport.addEventListener("pointerup", endGesture);
  viewport.addEventListener("pointercancel", endGesture);
  viewport.addEventListener("lostpointercapture", endGesture);
}

function featuredCard(event, status) {
  const card = event.render(true);
  card.dataset.focusScope = event.key;
  const media = element("div", "", "day-focus-media");
  const art = card.querySelector(".day-card-art");
  art.before(media);
  media.append(art);
  const content = card.querySelector(".day-card-content");
  media.append(content.querySelector(".day-card-kind"));
  const context = element("div", "", "day-focus-context");
  const time = content.querySelector("time");
  if (time) context.append(time);
  context.append(element("span", status, "day-focus-status"));
  content.prepend(context);
  const copy = element("div", "", "day-focus-copy");
  const actions = card.querySelector(".day-card-actions");
  content.before(copy);
  copy.append(content);
  if (actions) copy.append(actions);
  return card;
}

function byTime(a, b) {
  if (a.time === b.time) return 0;
  return (a.time ?? Infinity) - (b.time ?? Infinity);
}
