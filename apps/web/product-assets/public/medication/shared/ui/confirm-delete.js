import { installConfirmation, showFeedback } from "./controls.js";
import { $ } from "./dom.js";
import { t } from "../i18n/locale.js";

export function installDeletion(mutate) {
  let deletion;
  const dialog = $("delete-dialog");
  const error = $("delete-error");

  function requestDeletion({ title, message, change, success, parent, scheduleChanged = true }) {
    deletion = { change, success, parent, scheduleChanged };
    $("delete-title").textContent = title;
    $("delete-message").textContent = message;
    showFeedback(error);
    dialog.showModal();
  }

  installConfirmation({
    dialog, confirm: $("confirm-delete"), cancel: $("cancel-delete"),
    async perform() {
      const { change, success, parent, scheduleChanged } = deletion;
      if (await mutate(change, success, scheduleChanged)) {
        dialog.close();
        if (parent) $(parent).close();
      } else showFeedback(error, t("ui.could-not-delete-try-again"), "error");
    }
  });
  return requestDeletion;
}
