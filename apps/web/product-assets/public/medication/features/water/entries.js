import { button, element } from "../../shared/ui/dom.js";
import { t } from "../../shared/i18n/locale.js";

export function renderEntries(host, { entries, view, label, edit, remove }) {
  const rows = entries.map(entry => {
    const row = element("article", "", "entry-row program-water");
    row.dataset.focusScope = "water:" + entry.id;
    row.append(element("span", label(entry)));
    if (view) {
      if (entry.recordedBy) row.append(element("small", t("ui.recorded-by-value", view.authorName(entry)), "family-stamp"));
    } else {
      const editButton = button(t("ui.edit"), () => edit(entry));
      const removeButton = button(t("ui.delete-entry"), () => remove(entry));
      for (const action of [editButton, removeButton]) action.classList.add("glass-secondary-action", "tracker-utility");
      removeButton.classList.add("water-entry-remove");
      row.append(editButton, removeButton);
    }
    return row;
  });
  host.replaceChildren(...(rows.length ? rows : [element("p", t("ui.no-water-logged-for-this-day"), "empty")]));
}
