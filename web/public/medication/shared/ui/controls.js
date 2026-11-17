import { element } from "./dom.js";
import { locale } from "../i18n/locale.js";

export function setPressed(controls, matches) {
  for (const control of controls) control.setAttribute("aria-pressed", String(matches(control)));
}

export function showFeedback(target, message = "", state = "") {
  target.classList.add("feedback");
  target.textContent = message ?? "";
  target.dataset.state = state;
}

export function searchField(input, label) {
  input.type = "search";
  input.autocomplete = "off";
  input.placeholder = label;
  input.setAttribute("aria-label", label);
  const field = element("label", "", "choice-search cabinet-search");
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const use = document.createElementNS(icon.namespaceURI, "use");
  icon.setAttribute("aria-hidden", "true");
  use.setAttribute("href", "#i-search");
  icon.append(use);
  field.append(icon, input);
  return field;
}

function searchKey(text) {
  return text.normalize("NFKC").toLocaleLowerCase(locale).replaceAll("ي", "ی").replaceAll("ك", "ک")
    .replace(/[\p{M}\p{P}\p{Z}\u200c\u200d]/gu, "");
}

export function installChoiceSearch({ input, empty, groups }) {
  function refresh() {
    const terms = input.value.split(/\s+/).map(searchKey).filter(Boolean);
    let matches = [];
    for (const { group, rows } of groups()) {
      const groupMatches = rows.filter(({ control, key }) => {
        const value = searchKey(key ?? control.textContent);
        control.hidden = !terms.every(term => value.includes(term));
        return !control.hidden;
      });
      if (group) group.hidden = groupMatches.length === 0;
      matches = matches.concat(groupMatches);
    }
    empty.hidden = matches.length > 0;
    return matches;
  }
  input.addEventListener("input", refresh);
  input.addEventListener("keydown", event => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    const matches = refresh();
    if (matches.length === 1) (matches[0].select ?? matches[0].control).click();
  });
  return function resetSearch() {
    input.value = "";
    refresh();
  };
}

export function installConfirmation({ dialog, confirm, cancel, perform }) {
  cancel.addEventListener("click", () => dialog.close());
  dialog.addEventListener("cancel", event => {
    if (confirm.disabled) event.preventDefault();
  });
  const form = confirm.form;
  (form ?? confirm).addEventListener(form ? "submit" : "click", async event => {
    event.preventDefault();
    if (!dialog.open || confirm.disabled) return;
    confirm.disabled = cancel.disabled = true;
    dialog.setAttribute("aria-busy", "true");
    try {
      await perform();
    } finally {
      confirm.disabled = cancel.disabled = false;
      dialog.removeAttribute("aria-busy");
    }
  });
}
