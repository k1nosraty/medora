const darkPreference = matchMedia("(prefers-color-scheme: dark)");
const themeColor = document.querySelector('meta[name="theme-color"]');

export const accentOf = value => ["blue", "green", "lilac", "coral"].includes(value) ? value : "blue";

function updateThemeColor() {
  const { theme } = document.body.dataset;
  const dark = theme === "dark" || (theme !== "light" && darkPreference.matches);
  if (themeColor) themeColor.content = dark ? "#151b20" : "#f4f3fa";
}

export function applyDisplay(state) {
  document.body.dataset.theme = ["light", "dark"].includes(state.theme) ? state.theme : "system";
  document.body.dataset.accent = accentOf(state.accent);
  updateThemeColor();
}

darkPreference.addEventListener("change", updateThemeColor);
