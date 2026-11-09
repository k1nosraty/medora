const $ = id => document.getElementById(id);
const shapes = {
  tablet: "قرص", capsule: "کپسول", syrup: "شربت", injection: "آمپول", ointment: "پماد", drops: "قطره", spray: "اسپری"
};
const colors = { gold: "طلایی", green: "سبزآبی", blue: "آبی", purple: "یاسی", rose: "صورتی", slate: "خاکستری" };
const knownShape = shape => Object.hasOwn(shapes, shape) ? shape : "capsule";
const knownColor = color => Object.hasOwn(colors, color) ? color : "gold";

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
    tile.setAttribute("aria-label", `ظاهر دارو (اختیاری)، ${shapes[knownShape(type)]}، ${colors[knownColor(selectedColor)]}`);
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
    $("medicine-colors").replaceChildren(...Object.entries(colors).map(([id, title]) => {
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
    $("appearance-preview-icon").replaceChildren(medicationBadge(shape, color));
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
