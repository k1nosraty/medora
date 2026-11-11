import { language, t } from "./locale.js";
const $ = id => document.getElementById(id);
export const defaultMedicineIcon = "bottle";
const defaultMedicineColor = "purple";
const shapes = {
  bottle: t("بطری دارو"), tablet: language === "en" ? "Tablet" : "قرص", capsule: t("کپسول"), syrup: t("شربت"), injection: t("آمپول"),
  ointment: t("پماد"), drops: t("قطره"), spray: t("اسپری"), sachet: t("ساشه"), powder: t("پودر")
};
export const appearanceColors = {
  gold: t("طلایی"), peach: t("هلویی"), coral: t("مرجانی"), rose: t("صورتی"), purple: t("یاسی"),
  indigo: t("نیلی"), blue: t("آبی"), green: t("سبزآبی"), pistachio: t("پسته‌ای"), slate: t("خاکستری")
};
const knownShape = shape => Object.hasOwn(shapes, shape) ? shape : defaultMedicineIcon;
export const medicineColorOf = color => Object.hasOwn(appearanceColors, color) ? color : defaultMedicineColor;

export function medicationBadge(shape, color) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const use = document.createElementNS(svg.namespaceURI, "use");
  use.setAttribute("href", `#art-${knownShape(shape)}`);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "medication-badge");
  svg.dataset.ink = medicineColorOf(color);
  svg.append(use);
  return svg;
}

export function medicationBanner(shape, color) {
  const type = knownShape(shape);
  const banner = document.createElement("div");
  banner.className = "medication-banner";
  banner.dataset.shape = type;
  banner.dataset.ink = medicineColorOf(color);
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

export function installAppearance(onShapeChange) {
  const dialog = $("appearance-dialog");
  let shape;
  let color;

  function updateTile() {
    const type = $("medicine-icon").value;
    const selectedColor = $("medicine-color").value;
    const tile = $("medicine-appearance");
    tile.dataset.color = tile.dataset.ink = medicineColorOf(selectedColor);
    $("medicine-appearance-icon").replaceChildren(medicationBadge(type, selectedColor));
    $("editor-banner").replaceChildren(medicationBanner(type, selectedColor));
    tile.setAttribute("aria-label", t("ظاهر دارو (اختیاری)، {0}، {1}", shapes[knownShape(type)], appearanceColors[medicineColorOf(selectedColor)]));
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
    const preview = $("appearance-preview");
    preview.dataset.color = preview.dataset.ink = color;
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
