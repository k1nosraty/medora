import { $ } from "../medication/shared/ui/dom.js";
import { medicineGlass, routineGlass, visitGlass } from "./glass.js";
import { heart } from "./catalog.js";

// Leave the real form nodes in place. Their controllers can update them as usual.
export function installFormArt() {
  const sources = [
    ["editor-banner", () => medicineGlass($("medicine-icon").value, $("medicine-color").value)],
    ["visit-appearance-preview", () => visitGlass($("visit-category").value,
      $("visit-appearance").dataset.ink)],
    ["routine-preview", source => {
      const glyph = source.querySelector("use")?.getAttribute("href").split("#")[1] ?? "custom";
      const color = $("routine-colors").querySelector("input:checked")?.value;
      return routineGlass(glyph === "banner" ? "custom" : glyph, color);
    }]
  ];

  for (const [id, draw] of sources) {
    const source = $(id);
    const dialog = source.closest("dialog");
    const preview = document.createElement("span");
    preview.className = "form-glass-preview";
    source.after(preview);
    function refresh() {
      if (!dialog.open || !source.firstElementChild) return;
      preview.replaceChildren(draw(source));
      source.classList.add("form-glass-source");
    }
    new MutationObserver(refresh).observe(source, { childList: true });
    new MutationObserver(refresh).observe(dialog, { attributes: true, attributeFilter: ["open"] });
    dialog.addEventListener("change", refresh);
  }
}

function decorateChoices(container, selector, draw) {
  function refresh() {
    for (const button of container.querySelectorAll(selector)) {
      if (button.querySelector(".glass-object")) continue;
      button.querySelector("svg")?.remove();
      button.prepend(draw(button));
    }
  }
  new MutationObserver(refresh).observe(container, { childList: true, subtree: true });
  refresh();
}

export function installChoiceArt() {
  decorateChoices($("medicine-icons"), "button[data-choice]", button =>
    medicineGlass(button.dataset.choice, $("medicine-color").value));
  decorateChoices($("routine-categories"), "button[data-category]", button =>
    routineGlass(button.dataset.category));
  decorateChoices($("visit-category-results"), "button[data-category]", button =>
    visitGlass(button.dataset.category));
}

export function renderMedicineCover(accent) {
  const cover = $("medication-dialog").querySelector(".wizard-visual");
  cover.querySelector("img")?.replaceWith(heart(accent));
}
