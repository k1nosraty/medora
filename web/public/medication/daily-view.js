import { localDigits, t } from "./locale.js";
import { routineComplete } from "./routine-plan.js";
import { doseTime } from "./care-index.js";
import { $, element } from "./dom.js";

export function renderToday(care, day, today, daily, visits, routines, waterTotal, renderDose, renderRoutine) {
  const events = daily.map(dose => {
    const medicine = care.medicines[dose.medicineId];
    const done = dose.status === "taken" || dose.status === "skipped";
    return {
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
      state: routineComplete(entry) ? "done" : plan && !plan.paused ? "pending" : "inactive",
      time: entry.minute == null ? null : doseTime(day, entry.minute),
      resolvedAt: entry.resolvedAt,
      render: () => renderRoutine(entry, day, { dayCard: true })
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
  const focused = day === today ? pending.shift() : null;
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
  focus.replaceChildren();
  if (focused) {
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
  const cards = [...pending, ...inactive].map(event => event.render(false));
  if (done.length) {
    cards.push(element("h4", t("موارد رسیدگی‌شده"), "day-queue-heading day-queue-done"));
    for (const event of done) {
      const card = event.render(false);
      card.dataset.dayState = "done";
      cards.push(card);
    }
  }
  $("timeline-title").textContent = focused ? t("بقیهٔ برنامه‌های روز") : t("داروها، قرارها و روتین‌ها");
  $("doses").closest(".timeline").hidden = day === today && !cards.length;
  $("doses").replaceChildren(...(cards.length ? cards : [element("p", t("برای این روز برنامه‌ای ثبت نشده است."), "empty")]));
}

function byTime(a, b) {
  if (a.time === b.time) return 0;
  return (a.time ?? Infinity) - (b.time ?? Infinity);
}
