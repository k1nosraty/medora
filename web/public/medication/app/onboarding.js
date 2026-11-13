import { $ } from "../shared/ui/dom.js";

export function showIntro(care, mutate, showScreen) {
  const hasRecords = Object.keys(care.medicines).length || Object.keys(care.doses).length ||
    care.water?.length || Object.keys(care.visits ?? {}).length || Object.keys(care.routines ?? {}).length ||
    Object.keys(care.routineLogs ?? {}).length || care.reminders ||
    care.theme || care.calendar || care.waterGoal;
  if (care.intro === "done" || hasRecords) return;
  function show(step) {
    document.querySelector(".app-bar").hidden = step !== "done";
    $("app").hidden = step !== "done";
    $("welcome-screen").hidden = step !== "welcome";
    $("permission-screen").hidden = step !== "permission";
  }
  async function advance(step) {
    if (await mutate(state => { state.intro = step; }, "")) {
      show(step);
      return true;
    }
    return false;
  }
  $("welcome-start").addEventListener("click", () => void advance("permission"));
  $("intro-later").addEventListener("click", () => void advance("done"));
  $("intro-notifications").addEventListener("click", async () => {
    if (await advance("done")) showScreen("settings", true);
  });
  show(care.intro ?? "welcome");
}
