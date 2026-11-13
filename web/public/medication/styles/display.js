import { accentOf } from "./theme.js";
const darkPreference = matchMedia("(prefers-color-scheme: dark)");
const themeColor = document.querySelector('meta[name="theme-color"]');

function updateThemeColor() {
  const { theme } = document.body.dataset;
  const dark = theme === "dark" || (theme !== "light" && darkPreference.matches);
  if (themeColor) themeColor.content = dark ? "#151b20" : "#f4f3fa";
}

export function applyDisplay(state, { cycleEnabled = false } = {}) {
  document.body.dataset.theme = ["light", "dark"].includes(state.theme) ? state.theme : "system";
  document.body.dataset.accent = accentOf(state.accent, cycleEnabled);
  updateThemeColor();
}

darkPreference.addEventListener("change", updateThemeColor);
