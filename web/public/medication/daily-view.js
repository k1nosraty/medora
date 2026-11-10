import { localDigits, t } from "./locale.js";
import { routineComplete } from "./routine-plan.js";
import { doseTime } from "./care-index.js";
import { $, element } from "./dom.js";

export function renderToday(care, day, today, daily, visits, routines, waterTotal, renderDose, renderRoutine) {
  const doseCard = dose => renderDose(care.medicines[dose.medicineId], dose);
  const reviewed = daily.filter(dose => dose.status === "taken" || dose.status === "skipped").length;
  let doneRoutines = 0;
  let pendingRoutines = 0;
  for (const entry of routines) {
    const plan = care.routines?.[entry.id];
    if (routineComplete(entry)) doneRoutines++;
    else if (plan && !plan.paused) pendingRoutines++;
  }
  const scheduled = daily.length + visits.length + doneRoutines + pendingRoutines;
  const trackWater = day <= today && Boolean(waterTotal > 0 || care.waterGoal != null || care.waterReminders?.enabled ||
    (day === today && scheduled));
  const waterDone = trackWater && waterTotal >= (care.waterGoal ?? 2000);
  const resolved = reviewed + visits.filter(visit => visit.completed).length + doneRoutines + Number(waterDone);
  const total = scheduled + Number(trackWater);
  $("today-count").hidden = !total || day > today;
  $("today-count").textContent = t("{0} از {1} مورد رسیدگی شد", localDigits(resolved), localDigits(total));
  const now = Date.now();
  const pending = day === today ? daily.filter(dose => {
    const medicine = care.medicines[dose.medicineId];
    return medicine && !medicine.paused && (!dose.status || dose.status === "snoozed");
  }).map(dose => ({ dose, time: dose.snoozeUntil || doseTime(dose.day, dose.minute) })).sort((a, b) => a.time - b.time) : [];
  const focused = (pending.find(item => item.time >= now) ?? pending.at(-1))?.dose;
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
  if (focused) focus.append(renderDose(care.medicines[focused.medicineId], focused, true));
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
  const events = daily.filter(dose => dose !== focused).map(dose => ({ minute: dose.minute, card: doseCard(dose) }));
  events.push(...visits, ...routines.map(entry => ({ minute: entry.minute ?? 1440, card: renderRoutine(entry, day) })));
  events.sort((a, b) => a.minute - b.minute);
  $("timeline-title").textContent = focused ? t("بقیهٔ برنامه‌های روز") : t("داروها، قرارها و روتین‌ها");
  $("doses").closest(".timeline").hidden = day === today && events.length === 0;
  const empty = element("p", focused ? t("نوبت دیگری برای امروز ثبت نشده است.") : t("برای این روز برنامه‌ای ثبت نشده است."));
  empty.className = "empty";
  $("doses").replaceChildren(...(events.length ? events.map(({ card }) => card) : [empty]));
}
