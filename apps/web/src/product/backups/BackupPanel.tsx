import { useEffect, useRef, useState, type FormEvent } from "react";
import { t } from "../../../product-assets/public/medication/shared/i18n/locale.js";
import { isoDay } from "../../../product-assets/public/medication/domain/care-index.js";
import {
  isRestoreMode,
  type RestoreTarget,
} from "../../../product-assets/public/medication/domain/restore-intent.js";
import { clearFeature, paintFeature } from "../renderer";
import {
  clearDevice,
  exportBackup,
  readBackup,
  restoreBackup,
  type BackupOperations,
} from "./backupOperations";

type Status = { message: string; state: "busy" | "success" | "error" };
type Feedback = (message: string, state: Status["state"]) => void;
export function mountBackups(host: HTMLElement, operations: BackupOperations) {
  paintFeature(host, <BackupPanel {...operations} />);
  return () => clearFeature(host);
}

export function BackupPanel(operations: BackupOperations) {
  const [notice, setNotice] = useState<Status>();
  return (
    <>
      <ExportForm
        validate={operations.validatePhases}
        notice={notice}
        clearNotice={() => setNotice(undefined)}
      />
      <RestoreForm {...operations} />
      <p className="settings-restore-note">
        {t("ui.clear-device-description")}
      </p>
      <button
        id="clear-device-records"
        className="text-button"
        type="button"
        onClick={async () => {
          if (await clearDevice(operations))
            setNotice({ message: t("ui.clear-device-done"), state: "success" });
        }}
      >
        {t("ui.clear-device-button")}
      </button>
    </>
  );
}
function ExportForm({
  validate,
  notice,
  clearNotice,
}: {
  validate: BackupOperations["validatePhases"];
  notice: Status | undefined;
  clearNotice(): void;
}) {
  const [status, setStatus] = useState<Status>();
  const [download, setDownload] = useState<{ url: string; name: string }>();
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const lock = useRef(false);
  const active = useRef(true);
  const link = useRef<HTMLAnchorElement>(null);
  const password = useRef<HTMLInputElement>(null);
  const repeated = useRef<HTMLInputElement>(null);
  const recovery = useRef<HTMLInputElement>(null);
  const feedback: Feedback = (message, state) =>
    setStatus({ message: t(message), state });

  useEffect(
    () => () => {
      active.current = false;
    },
    [],
  );
  useEffect(() => {
    if (!download) return;
    link.current?.focus({ preventScroll: true });
    return () => URL.revokeObjectURL(download.url);
  }, [download]);
  useEffect(() => {
    if ((notice ?? status)?.state !== "success") return;
    const timer = setTimeout(() => {
      setStatus(undefined);
      if (notice) clearNotice();
    }, 4500);
    return () => clearTimeout(timer);
  }, [notice, status, clearNotice]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    clearNotice();
    setDownload(undefined);
    const secret = password.current?.value ?? "";
    if (secret !== repeated.current?.value) {
      feedback("رمز فایل و تکرارش یکسان نیستند.", "error");
      return;
    }
    const attempt = ++generation.current;
    const current = () => active.current && attempt === generation.current;
    lock.current = true;
    setBusy(true);
    feedback("در حال ساخت فایل رمزدار…", "busy");
    try {
      const bytes = await exportBackup(
        secret,
        Boolean(recovery.current?.checked),
        validate,
      );
      if (!current()) return;
      if (password.current) password.current.value = "";
      if (repeated.current) repeated.current.value = "";
      const now = new Date();
      const day =
        Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000;
      setDownload({
        url: URL.createObjectURL(
          new Blob([bytes], { type: "application/octet-stream" }),
        ),
        name: `medora-web-${isoDay(day)}.medora`,
      });
      feedback("فایل رمزدار آمادهٔ دانلود است.", "success");
    } catch (problem) {
      if (current()) {
        const reason = problem instanceof Error ? problem.message : "";
        feedback(
          reason === "restore_recovery_missing"
            ? "ui.restore-recovery-missing"
            : reason === "backup_too_large"
              ? "حجم فایل از ۱۶ مگابایت بیشتر است."
              : reason === "backup_password"
                ? "برای رمز فایل حداقل ۱۵ نویسه وارد کن."
                : "ساخت پشتیبان انجام نشد. دوباره تلاش کنید.",
          "error",
        );
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const shown = notice ?? status;
  return (
    <form
      id="web-backup-export"
      onSubmit={(event) => void submit(event)}
      onInput={() => {
        generation.current++;
        setDownload(undefined);
        setStatus(undefined);
        clearNotice();
      }}
    >
      <h3>{t("ui.create-an-encrypted-backup")}</h3>
      <p className="quiet">
        {t("ui.medication-appointments-routines-water-and-their-history")}
      </p>
      <label>
        {t("ui.backup-password")}
        <input
          id="web-backup-password"
          ref={password}
          type="password"
          minLength={15}
          maxLength={128}
          autoComplete="new-password"
          spellCheck={false}
          required
        />
      </label>
      <label>
        {t("ui.confirm-backup-password")}
        <input
          id="web-backup-confirm"
          ref={repeated}
          type="password"
          minLength={15}
          maxLength={128}
          autoComplete="new-password"
          spellCheck={false}
          required
        />
      </label>
      <p className="quiet">
        {t("ui.use-at-least-15-characters-for-the-file-password")}
      </p>
      <label className="editor-switch">
        <input type="checkbox" id="web-backup-use-recovery" ref={recovery} />
        <span>{t("ui.restore-export-previous")}</span>
      </label>
      <button type="submit" className="block-action" disabled={busy}>
        {t("ui.create-backup-file")}
      </button>
      <p
        id="web-backup-status"
        className={"settings-message" + (shown ? " feedback" : "")}
        role="status"
        data-state={shown?.state}
      >
        {shown?.message}
      </p>
      <a
        id="web-backup-download"
        className="block-action"
        ref={link}
        hidden={!download}
        href={download?.url}
        download={download?.name}
      >
        {t("ui.download-encrypted-backup")}
      </a>
    </form>
  );
}

function RestoreForm({
  mutate,
  prepareRestore,
  validatePhases,
}: BackupOperations) {
  const [status, setStatus] = useState<Status>();
  const [filename, setFilename] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef(true);
  const lock = useRef(false);
  const files = useRef<HTMLInputElement>(null);
  const password = useRef<HTMLInputElement>(null);
  const confirmRestore = useRef<HTMLInputElement>(null);
  const modeField = useRef<HTMLSelectElement>(null);
  const message = useRef<HTMLParagraphElement>(null);
  const feedback: Feedback = (message, state) =>
    setStatus({ message: t(message), state });
  useEffect(
    () => () => {
      active.current = false;
    },
    [],
  );
  useEffect(() => {
    if (!status) return;
    message.current?.scrollIntoView({ block: "nearest" });
    if (status.state === "success") {
      const timer = setTimeout(() => setStatus(undefined), 4500);
      return () => clearTimeout(timer);
    }
  }, [status]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const form = event.currentTarget;
    const file = files.current?.files?.[0];
    const mode = modeField.current?.value;
    if (!file) {
      feedback("ui.choose-a-backup-file-no-larger-than-16-mb", "error");
      return;
    }
    if (!isRestoreMode(mode)) return;
    const secret = password.current?.value ?? "";
    if (password.current) password.current.value = "";
    const current = () =>
      active.current &&
      files.current?.files?.[0] === file &&
      modeField.current?.value === mode;
    const confirmed = () =>
      current() && Boolean(confirmRestore.current?.checked);
    lock.current = true;
    setBusy(true);
    feedback("ui.checking-the-backup", "busy");
    try {
      const backup = await readBackup(file, secret, validatePhases);
      if (!confirmed()) {
        if (current()) setStatus(undefined);
        return;
      }
      let target: RestoreTarget;
      try {
        target = await prepareRestore(mode);
      } catch {
        if (current()) feedback("ui.restore-cloud-unavailable", "error");
        return;
      }
      if (!confirmed()) return;
      if (
        target.mode === "replace" &&
        !confirm(t("ui.restore-replace-confirm", target.revision))
      )
        return;
      const id = crypto.randomUUID();
      const saved = await mutate(
        (state) => restoreBackup(state, backup, target, id),
        t("ui.records-restored"),
        true,
      );
      if (!current()) return;
      if (saved) {
        form.reset();
        setFilename("");
        feedback(
          mode === "device"
            ? "ui.restore-device-done"
            : "ui.restore-cloud-queued",
          "success",
        );
      } else feedback("ui.could-not-save-your-records-try-again", "error");
    } catch (problem) {
      if (current())
        feedback(
          problem instanceof Error && problem.message === "backup_too_large"
            ? "ui.choose-a-backup-file-no-larger-than-16-mb"
            : "ui.the-file-or-password-is-invalid-or-the-backup-version-is",
          "error",
        );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <form id="android-restore" onSubmit={(event) => void submit(event)}>
      <h3>{t("ui.restore-a-web-or-android-backup")}</h3>
      <p>
        {t("ui.your-medora-backup-file")} <bdi>.medora</bdi>{" "}
        {t("ui.is-opened-on-this-device")}
      </p>
      <label className="backup-file-picker">
        <span>{t("ui.choose-backup-file")}</span>
        <bdi id="android-backup-filename" className="quiet">
          {filename || t("ui.no-file-selected")}
        </bdi>
        <input
          id="android-backup-file"
          ref={files}
          type="file"
          aria-label={t("ui.choose-backup-file")}
          aria-describedby="android-backup-filename"
          required
          onChange={(event) => {
            setFilename(event.target.files?.[0]?.name ?? "");
            setStatus(undefined);
          }}
        />
      </label>
      <label>
        {t("ui.backup-password")}
        <input
          id="android-backup-password"
          type="password"
          ref={password}
          maxLength={128}
          autoComplete="off"
          spellCheck={false}
          required
        />
      </label>
      <label>
        {t("ui.restore-target")}
        <select id="backup-restore-mode" ref={modeField}>
          <option value="device">{t("ui.restore-device-only")}</option>
          <option value="merge">{t("ui.restore-merge-cloud")}</option>
          <option value="replace">{t("ui.restore-replace-cloud")}</option>
        </select>
      </label>
      <p className="settings-restore-note">
        {t("ui.restore-intent-explanation")}
      </p>
      <label className="editor-switch">
        <input
          type="checkbox"
          id="android-backup-confirm"
          ref={confirmRestore}
          required
        />
        <span>
          {t("ui.i-confirm-that-my-current-records-will-be-replaced")}
        </span>
      </label>
      <p
        id="android-restore-status"
        role="status"
        ref={message}
        className={status ? "feedback" : undefined}
        data-state={status?.state}
      >
        {status?.message}
      </p>
      <button
        id="android-restore-submit"
        type="submit"
        className="block-action"
        disabled={busy}
      >
        {t("ui.restore-from-backup")}
      </button>
    </form>
  );
}
