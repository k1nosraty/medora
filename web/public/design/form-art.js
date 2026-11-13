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

export function renderMedicineCover(accent) {
  const cover = $("medication-dialog").querySelector(".wizard-visual");
  cover.querySelector("img, .glass-object")?.replaceWith(heart(accent));
}
