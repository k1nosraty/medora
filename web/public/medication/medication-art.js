import { language, t } from "./locale.js";
const $ = id => document.getElementById(id);
const shapes = {
  tablet: language === "en" ? "Tablet" : "قرص", capsule: t("کپسول"), syrup: t("شربت"), injection: t("آمپول"), ointment: t("پماد"), drops: t("قطره"), spray: t("اسپری")
};
export const appearanceColors = { gold: t("طلایی"), green: t("سبزآبی"), blue: t("آبی"), purple: t("یاسی"), rose: t("صورتی"), slate: t("خاکستری") };
const knownShape = shape => Object.hasOwn(shapes, shape) ? shape : "capsule";
const knownColor = color => Object.hasOwn(appearanceColors, color) ? color : "gold";

export function medicationBadge(shape, color) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const use = document.createElementNS(svg.namespaceURI, "use");
  use.setAttribute("href", `#art-${knownShape(shape)}`);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "medication-badge");
  svg.dataset.ink = knownColor(color);
  svg.append(use);
  return svg;
}

export function medicationBanner(shape, color) {
  const type = knownShape(shape);
  const banner = document.createElement("div");
  banner.className = "medication-banner";
  banner.dataset.shape = type;
  banner.dataset.ink = knownColor(color);
  banner.setAttribute("aria-hidden", "true");
  const art = medicationBadge(type, color);
  if (type === "tablet") art.firstElementChild.setAttribute("href", "#art-blister");
  const echo = medicationBadge(type, color);
  echo.classList.add("banner-echo");
  const caption = document.createElement("span");
  caption.textContent = shapes[type];
  banner.append(echo, art, caption);
  return banner;
}

export function installAppearance() {
  const dialog = $("appearance-dialog");
  let shape;
  let color;

  function updateTile() {
    const type = $("medicine-icon").value;
    const selectedColor = $("medicine-color").value;
    const tile = $("medicine-appearance");
    tile.dataset.color = knownColor(selectedColor);
    $("medicine-appearance-icon").replaceChildren(medicationBadge(type, selectedColor));
    $("editor-banner").replaceChildren(medicationBanner(type, selectedColor));
    tile.setAttribute("aria-label", t("ظاهر دارو (اختیاری)، {0}، {1}", shapes[knownShape(type)], appearanceColors[knownColor(selectedColor)]));
  }
  function choice(id, title, pressed, click) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "secondary";
    option.dataset.choice = id;
    option.setAttribute("aria-pressed", String(pressed));
    option.addEventListener("click", click);
    const label = document.createElement("span");
    label.textContent = title;
    option.append(label);
    return option;
  }
  function render() {
    $("medicine-icons").replaceChildren(...Object.entries(shapes).map(([id, title]) => {
      const option = choice(id, title, id === shape, () => {
        shape = id;
        render();
        $("medicine-icons").querySelector(`[data-choice="${id}"]`).focus({ preventScroll: true });
      });
      option.prepend(medicationBadge(id, color));
      return option;
    }));
    $("medicine-colors").replaceChildren(...Object.entries(appearanceColors).map(([id, title]) => {
      const option = choice(id, title, id === color, () => {
        color = id;
        render();
        $("medicine-colors").querySelector(`[data-choice="${id}"]`).focus({ preventScroll: true });
      });
      const swatch = document.createElement("span");
      swatch.className = "appearance-swatch";
      swatch.dataset.ink = id;
      option.prepend(swatch);
      return option;
    }));
    $("appearance-preview").dataset.color = color;
    $("appearance-preview-icon").replaceChildren(medicationBanner(shape, color));
  }

  $("medicine-appearance").addEventListener("click", () => {
    shape = knownShape($("medicine-icon").value);
    color = knownColor($("medicine-color").value);
    render();
    dialog.showModal();
  });
  $("appearance-confirm").addEventListener("click", () => {
    $("medicine-icon").value = shape;
    $("medicine-color").value = color;
    updateTile();
    dialog.close();
  });
  return updateTile;
}
