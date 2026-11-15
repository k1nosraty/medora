import { $ } from "../shared/ui/dom.js";

export function showIntro(care, mutate) {
  const hasRecords = Object.keys(care.medicines).length || Object.keys(care.doses).length ||
    care.water?.length || Object.keys(care.visits ?? {}).length || Object.keys(care.routines ?? {}).length ||
    Object.keys(care.routineLogs ?? {}).length || care.reminders ||
    care.theme || care.calendar || care.waterGoal;
  function show(step) {
    document.querySelector(".app-bar").hidden = step !== "done";
    $("app").hidden = step !== "done";
    $("welcome-screen").hidden = step !== "welcome";
  }
  if (care.intro === "done" || hasRecords) {
    show("done");
    return;
  }
  async function advance(step) {
    if (await mutate(state => { state.intro = step; }, "")) {
      show(step);
      if (step === "done") $("screen-title").focus();
      return true;
    }
    return false;
  }
  $("welcome-start").addEventListener("click", () => void advance("done"));
  show(care.intro === "permission" ? "welcome" : care.intro ?? "welcome");
}
