import { accentOf } from "./theme.js";
import { cycleIsEnabled, finishOf } from "../domain/profile.js";
const darkPreference = matchMedia("(prefers-color-scheme: dark)");
const themeColor = document.querySelector('meta[name="theme-color"]');

function updateThemeColor() {
  const { theme } = document.body.dataset;
  const dark = theme === "dark" || (theme !== "light" && darkPreference.matches);
  if (themeColor) themeColor.content = dark ? "#151b20" : "#f4f3fa";
}

export function applyDisplay(state, { cycleEnabled = cycleIsEnabled(state) } = {}) {
  document.body.dataset.theme = ["light", "dark"].includes(state.theme) ? state.theme : "system";
  document.body.dataset.accent = accentOf(state.accent, cycleEnabled);
  document.body.dataset.finish = finishOf(state.finish);
  updateThemeColor();
}

darkPreference.addEventListener("change", updateThemeColor);
