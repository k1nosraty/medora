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

export function dayCardOptions(label, ...content) {
  const details = element("details", "", "day-card-more");
  details.name = "day-card-options";
  const trigger = element("summary", "⋯");
  trigger.setAttribute("aria-label", label);
  const menu = element("div", "", "day-card-menu");
  menu.append(...content);
  details.append(trigger, menu);
  details.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !details.open) return;
    details.open = false;
    trigger.focus();
  });
  return details;
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

export function action(label, click, secondary = false) {
  const button = element("button", label);
  button.type = "button";
  if (secondary) button.className = "secondary";
  button.addEventListener("click", click);
  return button;
}
