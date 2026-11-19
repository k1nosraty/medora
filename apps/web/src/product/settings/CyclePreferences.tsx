import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { isoDay } from "@medora/domain/browser/care-index";
import {
  readCycleArchive,
  writeCycleArchive,
} from "../../../product-assets/public/medication/features/cycle/archive.js";
import { t } from "../../../product-assets/public/medication/shared/i18n/locale.js";
import { today } from "../../../product-assets/public/medication/shared/ui/dates.js";
import { Icon } from "../PlanCard";
import type { CareState } from "../productState";
import type { PanelProps } from "./Preferences";

export type Change = (state: CareState) => void;
export type MutateSettings = (
  change: Change,
  success: string,
  schedule?: boolean,
) => Promise<boolean>;

export function CyclePreferences({
  state,
  refreshFields,
  save,
  getState,
  mutate,
}: PanelProps & {
  getState(): CareState | undefined;
  mutate: MutateSettings;
}) {
  const [local, setLocal] = useState(Boolean(state.cycleLocalOnly));
  const [privateDraft, setPrivateDraft] = useState(local);
  const [message, setMessage] = useState(state.cycleSupport ?? "");
  const [file, setFile] = useState<File | null>();
  const fields = useRef<HTMLFormElement>(null);
  const backup = useRef<HTMLInputElement>(null);
  const dialog = document.querySelector<HTMLDialogElement>(
    "#cycle-backup-dialog",
  )!;
  const minute = state.cycleOptions?.minute;
  const clock =
    minute == null
      ? ""
      : `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  const routines = Object.values(state.routines ?? {}).filter(
    (row) => !row.paused,
  );
  useLayoutEffect(() => {
    if (fields.current) refreshFields(fields.current);
  }, [refreshFields]);

  async function saveCycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submit = (event.nativeEvent as SubmitEvent).submitter;
    if (!(submit instanceof HTMLButtonElement)) return;
    const form = new FormData(event.currentTarget);
    const time = String(form.get("clock") ?? "");
    const checklist = [
      ...new Set(
        String(form.get("checklist") ?? "")
          .split(/\r?\n/u)
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ].slice(0, 20);
    const isPrivate = form.has("private");
    if (
      await save(
        submit,
        (current) => {
          current.cycleOptions = {
            ...current.cycleOptions,
            hideToday: form.has("hide-today"),
            minute: time
              ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
              : null,
            routines: form.getAll("routines").map(String),
            since: current.cycleOptions?.since ?? today(),
          };
          current.cycleLocalOnly = isPrivate;
          current.cycleCardSize = String(form.get("card-size"));
          current.cycleChecklist = checklist;
          if (isPrivate) delete current.cycleSupport;
        },
        t("ui.display-settings-saved"),
        true,
      )
    ) {
      setLocal(isPrivate);
      setMessage(getState()?.cycleSupport ?? "");
    }
  }

  function saveSupport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submit = (event.nativeEvent as SubmitEvent).submitter;
    if (!(submit instanceof HTMLButtonElement) || getState()?.cycleLocalOnly)
      return;
    const value = message.trim();
    void save(
      submit,
      (current) => {
        if (current.cycleLocalOnly) return;
        if (value) current.cycleSupport = value;
        else delete current.cycleSupport;
      },
      t("ui.display-settings-saved"),
    );
  }

  return (
    <>
      <form
        id="cycle-settings-form"
        className="settings-form"
        ref={fields}
        onSubmit={saveCycle}
      >
        <label className="editor-switch settings-switch">
          {t("ui.cycle-hide-today")}
          <input
            id="cycle-hide-today"
            name="hide-today"
            type="checkbox"
            role="switch"
            defaultChecked={state.cycleOptions?.hideToday}
          />
        </label>
        <label>
          {t("ui.today-card-size")}
          <select
            id="cycle-card-size"
            name="card-size"
            defaultValue={state.cycleCardSize ?? "wide"}
          >
            <option value="wide">{t("ui.wide-card")}</option>
            <option value="compact">{t("ui.compact-card")}</option>
          </select>
        </label>
        <label className="editor-switch settings-switch">
          {t("ui.cycle-local-only")}
          <input
            id="cycle-local-only"
            name="private"
            type="checkbox"
            role="switch"
            checked={privateDraft}
            onChange={(event) => setPrivateDraft(event.currentTarget.checked)}
          />
        </label>
        <p className="quiet">{t("ui.cycle-local-hint")}</p>
        <p className="quiet" id="cycle-local-reminder-hint" hidden={!local}>
          {t("ui.cycle-local-reminder-hint")}
        </p>
        <div className="picker-control" data-picker-host="">
          <label>
            {t("ui.cycle-private-reminder")}
            <input
              id="cycle-reminder-time"
              name="clock"
              type="time"
              defaultValue={clock}
              hidden
            />
          </label>
          <button type="button" className="secondary picker-field" />
        </div>
        <fieldset id="cycle-routine-choices">
          <legend>{t("ui.cycle-linked-routines")}</legend>
          <div id="cycle-routine-list" className="cycle-routine-list">
            {routines.length ? (
              routines.map((row) => (
                <label key={row.id}>
                  <input
                    type="checkbox"
                    name="routines"
                    value={row.id}
                    defaultChecked={state.cycleOptions?.routines?.includes(
                      row.id,
                    )}
                  />{" "}
                  {row.name}
                </label>
              ))
            ) : (
              <p className="quiet">{t("ui.cycle-no-routines")}</p>
            )}
          </div>
        </fieldset>
        <label>
          {t("ui.cycle-checklist-items")}
          <textarea
            id="cycle-checklist-items"
            name="checklist"
            rows={3}
            maxLength={400}
            defaultValue={(state.cycleChecklist ?? []).join("\n")}
          />
        </label>
        <button className="block-action" type="submit">
          {t("ui.save-changes")}
        </button>
      </form>
      <form
        id="cycle-support-form"
        className="settings-form"
        onSubmit={saveSupport}
      >
        <label>
          {t("ui.cycle-support-message")}
          <input
            id="cycle-support-input"
            type="text"
            maxLength={160}
            disabled={local}
            value={message}
            onChange={(event) => setMessage(event.currentTarget.value)}
          />
        </label>
        <p className="quiet">{t("ui.cycle-support-hint")}</p>
        <button type="submit" className="secondary">
          {t("ui.save-changes")}
        </button>
      </form>
      <div className="settings-callout cycle-data-controls">
        <h3>{t("ui.cycle-history")}</h3>
        <div className="settings-time-grid">
          <button
            type="button"
            className="secondary"
            id="cycle-private-export"
            onClick={() => setFile(null)}
          >
            {t("ui.cycle-export-private")}
          </button>
          <button
            type="button"
            className="secondary"
            id="cycle-private-import"
            onClick={() => backup.current?.click()}
          >
            {t("ui.cycle-import-private")}
          </button>
        </div>
        <input
          type="file"
          accept=".medoracycle"
          id="cycle-private-import-file"
          hidden
          ref={backup}
          onChange={(event) => {
            const selected = event.currentTarget.files?.item(0);
            if (selected) setFile(selected);
            event.currentTarget.value = "";
          }}
        />
        <button
          type="button"
          className="text-button danger-link"
          id="cycle-private-delete"
          onClick={(event) => {
            if (!confirm(t("ui.cycle-delete-all"))) return;
            void save(
              event.currentTarget,
              (current) => {
                delete current.cycleRecords;
                delete current.cycleDays;
                delete current.cycleFollowup;
                delete current.cyclePreparation;
                delete current.cycleSupport;
              },
              t("ui.cycle-deleted-all"),
              true,
            );
          }}
        >
          {t("ui.cycle-delete-all")}
        </button>
      </div>
      {file !== undefined &&
        createPortal(
          <CycleArchive
            file={file}
            dialog={dialog}
            close={() => setFile(undefined)}
            getState={getState}
            mutate={mutate}
          />,
          dialog,
        )}
    </>
  );
}

function CycleArchive({
  file,
  dialog,
  close,
  getState,
  mutate,
}: {
  file: File | null;
  dialog: HTMLDialogElement;
  close(): void;
  getState(): CareState | undefined;
  mutate: MutateSettings;
}) {
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  useLayoutEffect(() => {
    dialog.showModal();
    const closing = () => close();
    dialog.addEventListener("close", closing, { once: true });
    return () => {
      dialog.removeEventListener("close", closing);
      if (dialog.open) dialog.close();
    };
  }, [dialog]); // The dialog instance lives for this single archive operation.

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const state = getState();
    if (lock.current || !state) return;
    if (password.length < 15) {
      setError(t("ui.cycle-backup-short"));
      return;
    }
    lock.current = true;
    setPending(true);
    setError("");
    try {
      if (file) {
        const checked = await readCycleArchive(file, password);
        if (
          !(await mutate(
            (current) => {
              current.cycleRecords = {
                ...checked.cycleRecords,
                ...current.cycleRecords,
              };
              current.cycleDays = {
                ...checked.cycleDays,
                ...current.cycleDays,
              };
            },
            t("ui.cycle-backup-imported"),
            true,
          ))
        )
          throw new Error("storage");
      } else {
        const bytes = await writeCycleArchive(state, password);
        const url = URL.createObjectURL(
          new Blob([Uint8Array.from(bytes)], {
            type: "application/octet-stream",
          }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = `medora-cycle-${isoDay(today())}.medoracycle`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
      }
      dialog.close();
    } catch {
      setError(t("ui.cycle-backup-error"));
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  return (
    <form id="cycle-backup-form" className="sheet-form" onSubmit={submit}>
      <div className="sheet-header">
        <h2 id="cycle-backup-title">
          {t(file ? "ui.cycle-import-private" : "ui.cycle-export-private")}
        </h2>
        <button
          type="button"
          className="icon-button"
          data-close="cycle-backup-dialog"
          aria-label={t("ui.close")}
          onClick={() => dialog.close()}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="sheet-body">
        <label>
          {t("ui.cycle-backup-password")}
          <input
            type="password"
            id="cycle-backup-password"
            minLength={15}
            maxLength={128}
            required
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
          />
        </label>
        <p
          id="cycle-backup-status"
          role="status"
          data-state={error ? "error" : undefined}
        >
          {error}
        </p>
        <button type="submit" className="block-action" disabled={pending}>
          {t("ui.next")}
        </button>
      </div>
    </form>
  );
}
