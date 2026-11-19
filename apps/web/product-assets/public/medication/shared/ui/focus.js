const controls = "button, a[href], summary, input:not([type=hidden]), select, textarea, [tabindex]";

export function preserveFocus(root, paint, fallback) {
  const active = document.activeElement;
  if (!root.contains(active) || active.closest("dialog")) return paint();
  const key = active.dataset.focusKey;
  const id = active.id;
  const group = active.closest("[data-focus-scope]");
  const scope = group?.dataset.focusScope;
  const text = active.getAttribute("aria-label") || active.textContent.trim();
  paint();
  if (active.isConnected && !active.closest("[hidden]")) return;
  if (document.activeElement !== document.body && document.activeElement !== active) return;
  const sameKey = key && root.querySelector(`[data-focus-key="${CSS.escape(key)}"]`);
  const sameId = id && root.querySelector(`#${CSS.escape(id)}`);
  const replacement = sameKey || sameId || (scope && [...root.querySelectorAll(`[data-focus-scope="${CSS.escape(scope)}"] :is(${controls})`)]
    .find(control => (control.getAttribute("aria-label") || control.textContent.trim()) === text && !control.closest("[hidden]")));
  const target = replacement && !replacement.closest("[hidden]") && !replacement.disabled ? replacement : fallback;
  target?.focus({ preventScroll: true });
}
