import { $ } from "./dom.js";
import { t } from "../i18n/locale.js";

export function installDeletion(mutate) {
  let deletion;

  function requestDeletion({ title, message, change, success, parent }) {
    deletion = { change, success, parent };
    $("delete-title").textContent = title;
    $("delete-message").textContent = message;
    $("delete-error").textContent = "";
    $("delete-dialog").showModal();
  }

  $("cancel-delete").addEventListener("click", () => $("delete-dialog").close());
  $("delete-dialog").addEventListener("cancel", event => {
    if ($("confirm-delete").disabled) event.preventDefault();
  });
  $("delete-form").addEventListener("submit", async event => {
    event.preventDefault();
    const { change, success, parent } = deletion;
    const confirm = $("confirm-delete");
    const cancel = $("cancel-delete");
    confirm.disabled = cancel.disabled = true;
    try {
      if (await mutate(change, success, true)) {
        $("delete-dialog").close();
        if (parent) $(parent).close();
      } else {
        $("delete-error").textContent = t("حذف انجام نشد. دوباره تلاش کنید.");
      }
    } finally {
      confirm.disabled = cancel.disabled = false;
    }
  });
  return requestDeletion;
}
