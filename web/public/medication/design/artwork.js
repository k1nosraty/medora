const svgNamespace = "http://www.w3.org/2000/svg";

export function illustration(href, { viewBox, className } = {}) {
  const svg = document.createElementNS(svgNamespace, "svg");
  const use = document.createElementNS(svgNamespace, "use");
  if (viewBox) svg.setAttribute("viewBox", viewBox);
  if (className) svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  use.setAttribute("href", href);
  svg.append(use);
  return svg;
}
