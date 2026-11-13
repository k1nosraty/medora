import { illustration } from "../medication/design/artwork.js";

const ns = "http://www.w3.org/2000/svg";
const svg = (name, attributes) => {
  const node = document.createElementNS(ns, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
};

const colors = {
  medicine: "#9273c8", visit: "#549b82", routine: "#cb786e", water: "#4999dc",
  cycle: "#a84777", image: "#527dc7", control: "#627eb5"
};
const accentColors = { blue: "#578ddb", green: "#529673", lilac: "#9573c9", coral: "#c5776c", berry: "#af5984" };
const customColors = {
  gold: "#b58437", peach: "#cd875f", coral: "#cb786e", rose: "#be6394", purple: "#9273c8",
  indigo: "#6776c6", blue: "#4999dc", green: "#489985", pistachio: "#81a553", slate: "#74859e"
};
const paints = new Map();

function mix(from, to, amount) {
  const channels = hex => hex.slice(1).match(/../g).map(channel => parseInt(channel, 16));
  const end = channels(to);
  return "#" + channels(from).map((value, index) =>
    Math.round(value + (end[index] - value) * amount).toString(16).padStart(2, "0")).join("");
}

function paint(color) {
  if (paints.has(color)) return paints.get(color);
  const defs = document.getElementById("glass-paints");
  const key = "glass-paint-" + color.slice(1);
  const ice = mix(color, "#ffffff", .86);
  const frost = mix(color, "#ffffff", .57);
  const ink = mix(color, "#11152b", .72);
  const shadow = mix(color, "#11152b", .53);
  const gradient = (name, stops, attrs = { x2: ".88", y2: "1" }) => {
    const id = key + "-" + name;
    const node = svg("linearGradient", { id, ...attrs });
    for (const [offset, tint, opacity = 1] of stops) {
      node.append(svg("stop", { offset, "stop-color": tint, "stop-opacity": opacity }));
    }
    defs.append(node);
    return "url(#" + id + ")";
  };
  const result = {
    "--glass-body": gradient("body", [[0, ice, .95], [.22, frost, .66], [.43, color, .27], [.73, color, .8], [.91, shadow, .84], [1, frost, .94]]),
    "--glass-face": gradient("face", [[0, "#ffffff", .97], [.27, ice, .69], [.51, frost, .22], [.8, color, .63], [1, frost, .88]]),
    "--glass-side": gradient("side", [[0, frost], [.21, color], [.47, shadow], [.75, ink], [.92, color], [1, frost]], { x2: "1", y2: ".75" }),
    "--glass-rim": gradient("rim", [[0, "#ffffff"], [.36, frost], [.67, color], [1, ice]]),
    "--glass-ink": ink
  };
  paints.set(color, result);
  return result;
}

export function glassObject(id, family, { color, accent, className } = {}) {
  const artwork = illustration("#design-" + id, { className: ["glass-object", className].filter(Boolean).join(" ") });
  const source = document.getElementById("design-" + id);
  artwork.setAttribute("viewBox", source.getAttribute("viewBox"));
  for (const [name, value] of Object.entries(paint(customColors[color] || accentColors[accent] || colors[family]))) {
    artwork.style.setProperty(name, value);
  }
  return artwork;
}

// Existing silhouettes keep every specialty and medicine form recognizable.
function materialSymbol(id, sourceId) {
  if (document.getElementById("design-" + id)) return;
  const source = document.getElementById(sourceId);
  const symbol = source.cloneNode(true);
  symbol.id = "design-" + id;
  for (const node of symbol.querySelectorAll("[class]")) {
    const kind = node.getAttribute("class");
    if (kind === "pill-edge") node.setAttribute("fill", "var(--glass-side)");
    if (["pill-light", "visit-art-light"].includes(kind)) node.setAttribute("fill", "var(--glass-face)");
    if (["pill-body", "visit-art-accent"].includes(kind)) node.setAttribute("fill", "var(--glass-body)");
    if (kind === "pill-line") node.setAttribute("fill", "none");
    node.removeAttribute("class");
  }
  symbol.setAttribute("fill", "none");
  symbol.setAttribute("stroke", "var(--glass-ink)");
  symbol.setAttribute("stroke-width", sourceId.startsWith("art-visit") ? "1.4" : "1.55");
  symbol.setAttribute("stroke-linecap", "round");
  symbol.setAttribute("stroke-linejoin", "round");
  document.getElementById("glass-paints").after(symbol);
}

export function medicineGlass(id, color) {
  if (id !== "bottle") materialSymbol(id, "art-" + id);
  return glassObject(id, "medicine", { color, className: "category-art" });
}

export function visitGlass(id, color) {
  if (id === "general") return glassObject("visit", "visit", { color, className: "category-art" });
  const key = "specialty-" + id;
  materialSymbol(key, "art-visit-" + id);
  return embossed(key, "#design-" + key, "visit", { color, box: 48, hasFill: true });
}

export function routineGlass(id, color) {
  if (id === "custom") return glassObject("routine", "routine", { color, className: "category-art" });
  return embossed("routine-" + id, "/medication/assets/icons/routines.svg#" + id, "routine", { color, box: 24 });
}

export function controlGlass(id, accent) {
  return embossed("control-" + id, "#i-" + id, "control", { accent, box: id === "mark" || id === "landscape" ? 100 : 24,
    hasFill: id === "landscape" || id === "mark", round: true });
}

function embossed(key, href, family, { color, accent, box, hasFill = false, round = false }) {
  const id = "design-" + key + "-glass";
  if (!document.getElementById(id)) {
    const symbol = svg("symbol", { id, viewBox: "0 0 120 112" });
    symbol.append(svg("ellipse", { cx: 61, cy: 99, rx: 39, ry: 8, fill: "url(#design-art-shadow)" }));
    const shape = round ? "circle" : "rect";
    const face = round ? { cx: 60, cy: 53, r: 39 } : { x: 20, y: 13, width: 80, height: 80, rx: 24 };
    symbol.append(svg(shape, { ...face, fill: "var(--glass-side)", transform: "translate(2 4)" }),
      svg(shape, { ...face, class: "glass-body" }),
      svg("path", { d: "M29 47q2-24 25-27m10 66q18-1 25-14", class: "glass-reflection" }));
    const size = box === 48 ? 61 : 55;
    const glyph = svg("use", { href, x: 60 - size / 2, y: 53 - size / 2, width: size, height: size });
    glyph.setAttribute("fill", hasFill ? "var(--glass-rim)" : "none");
    glyph.setAttribute("stroke", "var(--glass-ink)");
    glyph.setAttribute("stroke-width", "1.7");
    glyph.setAttribute("stroke-linejoin", "round");
    glyph.setAttribute("stroke-linecap", "round");
    if (!hasFill) {
      const edge = glyph.cloneNode();
      edge.setAttribute("transform", "translate(0 1.8)");
      edge.setAttribute("stroke", "var(--glass-rim)");
      edge.setAttribute("stroke-width", "2.25");
      symbol.append(edge);
    }
    symbol.append(glyph);
    document.getElementById("glass-paints").after(symbol);
  }
  return glassObject(key + "-glass", family, { color, accent, className: "category-art" });
}
