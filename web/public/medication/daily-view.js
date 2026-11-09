import { localDigits, t } from "./locale.js";
import { doseTime } from "./care-index.js";
import { $, element } from "./dom.js";

export function renderToday(care, day, today, daily, visits, renderDose) {
  const doseCard = dose => renderDose(care.medicines[dose.medicineId], dose);
  const consumed = daily.filter(dose => dose.status === "taken").length;
  const skipped = daily.filter(dose => dose.status === "skipped").length;
  const reviewed = consumed + skipped;
  $("today-count").hidden = daily.length === 0;
  $("today-count").textContent = t("{0} از {1} نوبت بررسی شد", localDigits(reviewed), localDigits(daily.length));
  const now = Date.now();
  const pending = day === today ? daily.filter(dose => {
    const medicine = care.medicines[dose.medicineId];
    return medicine && !medicine.paused && (!dose.status || dose.status === "snoozed");
  }).map(dose => ({ dose, time: dose.snoozeUntil || doseTime(dose.day, dose.minute) })).sort((a, b) => a.time - b.time) : [];
  const focused = (pending.find(item => item.time >= now) ?? pending.at(-1))?.dose;
  const doseLabel = daily.length === 1 ? t("۱ نوبت دارو") : t("{0} نوبت دارو", localDigits(daily.length));
  const visitLabel = visits.length === 1 ? t("۱ قرار") : t("{0} قرار", localDigits(visits.length));
  $("story-summary").textContent = daily.length || visits.length
    ? `${doseLabel} · ${visitLabel}`
    : t("برای این روز هنوز نوبت یا قراری ثبت نشده.");
  const focus = $("today-focus");
  focus.replaceChildren();
  if (focused) focus.append(renderDose(care.medicines[focused.medicineId], focused, true));
  else if (day === today) {
    const completed = daily.length > 0 && reviewed === daily.length;
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
    const title = completed ? t("همهٔ نوبت‌ها بررسی شدند") : daily.length ? t("سوابق نوبت‌ها") : t("روزتان را بچینید");
    const summary = completed ? t("{0} مصرف شد · {1} مصرف نشد", localDigits(consumed), localDigits(skipped)) :
      daily.length ? t("نوبت‌های این روز را در فهرست پایین ببینید.") : t("از «افزودن» در نوار پایین، اولین دارو را ثبت کنید.");
    copy.append(element("h3", title), element("p", summary));
    hero.append(copy, art);
    focus.append(hero);
  }
  focus.hidden = day !== today;
  const events = daily.filter(dose => dose !== focused).map(dose => ({ minute: dose.minute, card: doseCard(dose) }));
  events.push(...visits);
  events.sort((a, b) => a.minute - b.minute);
  $("timeline-title").textContent = focused ? t("بقیهٔ نوبت‌ها و قرارها") : t("نوبت‌ها و قرارها");
  $("doses").closest(".timeline").hidden = day === today && events.length === 0;
  const empty = element("p", focused ? t("نوبت دیگری برای امروز ثبت نشده است.") : t("برای این روز دارو یا قراری ثبت نشده است."));
  empty.className = "empty";
  $("doses").replaceChildren(...(events.length ? events.map(({ card }) => card) : [empty]));
}
