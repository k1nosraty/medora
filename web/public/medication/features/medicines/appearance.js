import { language, t } from "../../shared/i18n/locale.js";
import { $, element } from "../../shared/ui/dom.js";
import { glassObject } from "../../design/three-dimensional.js";
export const defaultMedicineIcon = "bottle";
const defaultMedicineColor = "purple";
export const medicineShapes = {
  bottle: t("ui.medicine-bottle"), tablet: language === "en" ? "Tablet" : "قرص", capsule: t("ui.capsule"), syrup: t("ui.syrup"), injection: t("ui.ampoule"),
  ointment: t("ui.ointment"), drops: t("ui.drops"), spray: t("ui.spray"), sachet: t("ui.sachet"), powder: t("ui.powder")
};
export const appearanceColors = {
  gold: t("ui.gold"), peach: t("ui.peach"), coral: t("ui.coral"), rose: t("ui.pink"), purple: t("ui.lilac"),
  indigo: t("ui.indigo"), blue: t("ui.blue"), green: t("ui.teal"), pistachio: t("ui.pistachio"), slate: t("ui.gray")
};

export function mountAppearanceColors(grid, name) {
  return Object.entries(appearanceColors).map(([color, title]) => {
    const choice = element("input");
    choice.type = "radio";
    choice.name = name;
    choice.value = color;
    choice.dataset.ink = color;
    const label = element("label");
    label.append(choice, element("span", title));
    grid.append(label);
    return choice;
  });
}
const knownShape = shape => Object.hasOwn(medicineShapes, shape) ? shape : defaultMedicineIcon;
export const medicineColorOf = color => Object.hasOwn(appearanceColors, color) ? color : defaultMedicineColor;

function badgeFor(art, color) {
  const ink = medicineColorOf(color);
  const badge = glassObject(art, "medicine", { className: "medication-badge", color: ink === defaultMedicineColor ? undefined : ink });
  badge.dataset.ink = ink;
  return badge;
}

export function medicationBadge(shape, color) {
  return badgeFor(knownShape(shape), color);
}

export function medicationBanner(shape, color) {
  const type = knownShape(shape);
  const banner = document.createElement("div");
  banner.className = "medication-banner";
  banner.dataset.shape = type;
  banner.dataset.ink = medicineColorOf(color);
  banner.setAttribute("aria-hidden", "true");
  const art = badgeFor(type === "tablet" ? "blister" : type, color);
  const echo = medicationBadge(type, color);
  echo.classList.add("banner-echo");
  const caption = document.createElement("span");
  caption.textContent = medicineShapes[type];
  banner.append(echo, art, caption);
  return banner;
}

export function installAppearance(onShapeChange) {
  const dialog = $("appearance-dialog");
  let shape;
  let color;

  function updateTile() {
    const type = $("medicine-icon").value;
    const selectedColor = $("medicine-color").value;
    const tile = $("medicine-appearance");
    tile.dataset.ink = medicineColorOf(selectedColor);
    $("medicine-appearance-icon").replaceChildren(medicationBadge(type, selectedColor));
    tile.setAttribute("aria-label", t("ui.appearance-optional-value-value", medicineShapes[knownShape(type)], appearanceColors[medicineColorOf(selectedColor)]));
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
    $("medicine-icons").replaceChildren(...Object.entries(medicineShapes).map(([id, title]) => {
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
    const preview = $("appearance-preview");
    preview.dataset.ink = color;
    $("appearance-preview-icon").replaceChildren(medicationBanner(shape, color));
  }

  $("medicine-appearance").addEventListener("click", () => {
    shape = knownShape($("medicine-icon").value);
    color = medicineColorOf($("medicine-color").value);
    render();
    dialog.showModal();
  });
  $("appearance-confirm").addEventListener("click", () => {
    const previous = $("medicine-icon").value;
    $("medicine-icon").value = shape;
    $("medicine-color").value = color;
    if (previous !== shape) onShapeChange(previous, shape);
    updateTile();
    dialog.close();
  });
  return updateTile;
}
