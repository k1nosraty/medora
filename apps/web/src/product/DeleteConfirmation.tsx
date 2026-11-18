import { useLayoutEffect, useState, type FormEvent } from "react";
import { t } from "../../../../web/public/medication/shared/i18n/locale.js";
import type { CareState } from "./product";
import { paintFeature } from "./renderer";

interface Deletion {
  title: string;
  message: string;
  change(state: CareState): void;
  success: string;
  parent?: string;
  scheduleChanged?: boolean;
}

type Mutation = (
  change: Deletion["change"],
  success: string,
  scheduleChanged: boolean,
) => Promise<boolean>;

function DeleteConfirmation({
  dialog,
  deletion,
  mutate,
}: {
  dialog: HTMLDialogElement;
  deletion: Deletion;
  mutate: Mutation;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  useLayoutEffect(() => {
    if (pending) dialog.setAttribute("aria-busy", "true");
    else dialog.removeAttribute("aria-busy");
    const keepOpen = (event: Event) => {
      if (pending) event.preventDefault();
    };
    dialog.addEventListener("cancel", keepOpen);
    return () => dialog.removeEventListener("cancel", keepOpen);
  }, [dialog, pending]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog.open || pending) return;
    const { change, success, scheduleChanged = true, parent } = deletion;
    setPending(true);
    setError(false);
    try {
      if (await mutate(change, success, scheduleChanged)) {
        dialog.close();
        if (parent)
          (
            document.getElementById(parent) as HTMLDialogElement | null
          )?.close();
      } else setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <form id="delete-form" onSubmit={submit}>
      <h2 id="delete-title">{deletion.title}</h2>
      <p id="delete-message">{deletion.message}</p>
      <p id="delete-error" className="field-error" role="alert">
        {error ? t("ui.could-not-delete-try-again") : ""}
      </p>
      <div className="panel-action-bar">
        <button
          type="button"
          className="secondary"
          id="cancel-delete"
          disabled={pending}
          onClick={() => dialog.close()}
        >
          {t("ui.cancel")}
        </button>
        <button
          type="submit"
          className="danger-button"
          id="confirm-delete"
          disabled={pending}
        >
          {t("ui.delete")}
        </button>
      </div>
    </form>
  );
}

export function installDeletion(mutate: Mutation) {
  const dialog = document.querySelector<HTMLDialogElement>("#delete-dialog")!;
  let revision = 0;
  return (deletion: Deletion) => {
    if (dialog.open) return;
    paintFeature(
      dialog,
      <DeleteConfirmation
        key={++revision}
        dialog={dialog}
        deletion={deletion}
        mutate={mutate}
      />,
    );
    dialog.showModal();
    dialog
      .querySelector<HTMLButtonElement>("#cancel-delete")!
      .focus({ preventScroll: true });
  };
}
