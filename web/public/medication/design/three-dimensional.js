const colorAngles = {
  gold: 44, peach: 24, coral: 8, rose: 330, purple: 269,
  indigo: 237, blue: 211, green: 155, pistachio: 90, slate: 222
};
const familyAngles = { medicine: 267, visit: 155, routine: 17 };
const accentAngles = { blue: 211, green: 153, lilac: 267, coral: 8, berry: 330, amber: 38 };

function artworkPath(id, finish) {
  if (finish === "matte") {
    const matteId = id === "visit-main" || id === "routine-main" ? id.slice(0, -5) : id;
    return "/design/matte-3d/" + matteId + ".webp";
  }
  return "/design/optical-glass/" + id + ".webp";
}

export function glassObject(id, family, { color, accent, className, finish } = {}) {
  const artwork = new Image(256, 256);
  artwork.dataset.art = id;
  if (finish) artwork.dataset.artFinish = finish;
  artwork.src = artworkPath(id, finish ?? document.body.dataset.finish);
  const fallback = { medicine: "bottle", visit: "visit", routine: "routine" }[family];
  if (fallback && fallback !== id) artwork.addEventListener("error", () => {
    const fallbackUrl = new URL(artworkPath(fallback, artwork.dataset.artFinish ?? document.body.dataset.finish), location.origin).href;
    if (artwork.src !== fallbackUrl) artwork.src = fallbackUrl;
  });
  artwork.alt = "";
  artwork.decoding = "async";
  artwork.loading = "lazy";
  artwork.className = className ? "glass-object " + className : "glass-object";

  const hue = colorAngles[color] ?? accentAngles[accent];
  if (hue !== undefined) {
    const base = familyAngles[family] ?? 211;
    const saturation = color === "slate" ? .3 : 1;
    artwork.style.filter = "hue-rotate(" + (hue - base) + "deg) saturate(" + saturation + ")";
  }
  return artwork;
}

export function medicineGlass(id, color) {
  return glassObject(id, "medicine", { color, className: "category-art" });
}

export function visitGlass(id, color) {
  return glassObject(id === "general" ? "visit" : "visit-" + id, "visit", { color, className: "category-art" });
}

export function routineGlass(id, color) {
  return glassObject(id === "custom" ? "routine" : "routine-" + id, "routine", { color, className: "category-art" });
}

export function controlGlass(id, accent) {
  return glassObject("control-" + id, "control", { accent, className: "category-art" });
}

export function refreshArtwork(finish) {
  for (const art of document.querySelectorAll("img[data-art]:not([data-art-finish])")) {
    art.src = artworkPath(art.dataset.art, finish);
  }
}
