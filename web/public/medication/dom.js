export const $ = id => document.getElementById(id);

export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export function button(text, click) {
  const node = element("button", text, "secondary");
  node.type = "button";
  node.addEventListener("click", click);
  return node;
}

export function fitDialogToViewport(dialog) {
  const viewport = window.visualViewport;
  function fit() {
    if (!dialog.open || !viewport) return;
    const zoomed = viewport.scale !== 1;
    dialog.style.setProperty("--visible-height", `${zoomed ? window.innerHeight : viewport.height}px`);
    dialog.style.setProperty("--visible-top", `${zoomed ? 0 : viewport.offsetTop}px`);
  }
  viewport?.addEventListener("resize", fit);
  viewport?.addEventListener("scroll", fit);
  return fit;
}
