import { shortWeek, t, weekIndex } from "../shared/i18n/locale.js";
import { renderWeek } from "./week-strip.js";
import { isoDay as iso } from "../domain/care-index.js";

export function installDayNavigation({ root, getDates, render, selectedDay, today, onDayChange }) {
  const $ = id => root.querySelector("#" + id);
  const dayControls = $("day-controls");
  const selectedDates = new Map();
  const dayWeek = $("day-week");
  let screen = "today";
  let weekSlide;

  function chooseDay(day, restoreFocus) {
    if (["today", "medications", "appointments", "routines", "water"].includes(screen)) {
      if (day === today()) selectedDates.delete(screen);
      else selectedDates.set(screen, day);
    }
    $("day").value = iso(day);
    history.replaceState({ ...history.state, medoraDay: day }, "", location.href);
    onDayChange(screen);
    render();
    if (restoreFocus) ($(restoreFocus).querySelector('[aria-pressed="true"]') ?? $("pick-day")).focus({ preventScroll: true });
  }
  for (const [id, delta] of [["previous-day", -1], ["next-day", 1]]) {
    $(id).addEventListener("click", () => {
      if (screen === "water" && selectedDay() + delta > today()) return;
      const animate = screen === "today" && !matchMedia("(prefers-reduced-motion: reduce)").matches &&
        getComputedStyle(dayWeek).gridTemplateColumns.split(" ").length === 7;
      const outgoing = animate ? dayWeek.children[delta > 0 ? 0 : 6]?.cloneNode(true) : null;
      chooseDay(selectedDay() + delta);
      if (!outgoing) return;
      outgoing.inert = true;
      outgoing.setAttribute("aria-hidden", "true");
      outgoing.classList.add("day-week-ghost");
      outgoing.dataset.edge = delta > 0 ? "start" : "end";
      dayWeek.append(outgoing);
      const direction = document.documentElement.dir === "rtl" ? -1 : 1;
      weekSlide = dayWeek.animate(
        [{ transform: `translateX(${direction * delta * 100 / 7}%)` }, { transform: "none" }],
        { duration: 210, easing: "ease-out" }
      );
      weekSlide.onfinish = () => outgoing.remove();
    });
  }
  $("today-reset").addEventListener("click", () => {
    chooseDay(today(), "day-week");
  });

  function activate(destination, mode, waterDay) {
    if (destination === "water" && mode === "push") selectedDates.set("water", Math.min(waterDay, today()));
    const host = root.querySelector(`[data-day-host="${destination}"]`);
    if (host) {
      const saved = mode === "pop" && Number.isInteger(history.state?.medoraDay) ? history.state.medoraDay : undefined;
      $("day").value = iso(saved ?? selectedDates.get(destination) ?? (mode === "replace" ? selectedDay() : today()));
      host.append(dayControls);
    }
    screen = destination;
    dayControls.hidden = !host;
    dayControls.classList.toggle("single-date", screen !== "today");
    dayControls.classList.toggle("compact-day", screen !== "today");
    $("today-dates").hidden = screen !== "today";
  }

  function paint(day) {
    if (dayControls.hidden) return;
    const dates = getDates();
    $("day-label").textContent = screen === "today" ? dates.month(day) : day === today() ? t("ui.today") : dates.formatDay(day);
    $("pick-day").setAttribute("aria-label", $("day-label").textContent + ", " + t("ui.choose-date-value", dates.formatDay(day, true)));
    $("today-reset").hidden = day === today();
    $("next-day").disabled = screen === "water" && day >= today();
    if (screen !== "today") return;
    weekSlide?.cancel();
    dayWeek.querySelector(".day-week-ghost")?.remove();
    const current = today();
    const days = Array.from({ length: 7 }, (_, offset) => {
      const value = day - 3 + offset;
      const number = dates.dayNumber(value);
      const weekday = shortWeek[weekIndex(value)];
      return { value, number, weekday, label: number + " " + weekday + ", " + dates.formatDay(value,true),
        selected: value === day, today: value === current };
    });
    renderWeek(dayWeek,days,selected => chooseDay(selected,"day-week"));
  }

  return { activate, chooseDay, paint, reset: () => {
    selectedDates.clear();
    $("day").value = iso(today());
    const { medoraDay, ...state } = history.state ?? {};
    history.replaceState(state, "", location.href);
  } };
}
