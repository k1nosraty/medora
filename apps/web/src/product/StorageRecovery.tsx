import { useState, type FormEvent } from "react";
import { t } from "../../../../web/public/medication/shared/i18n/locale.js";
import { paintFeature } from "./renderer";

function StorageRecovery() {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [exporting, setExporting] = useState(false);

  async function download(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (exporting) return;
    setExporting(true);
    setStatus("");
    try {
      const [{ encryptBackup }, { readCareRecovery }] = await Promise.all([
        import("../../../../web/public/medication/shared/crypto/backup.js"),
        import("../../../../web/public/medication/shared/storage.js"),
      ]);
      const bytes = await encryptBackup(
        await readCareRecovery(),
        password,
        new TextEncoder().encode("MEDORAID"),
      );
      const url = URL.createObjectURL(
        new Blob([bytes], { type: "application/octet-stream" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "medora-storage-recovery.medoraid";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setStatus(t("ui.storage-recovery-ready"));
    } catch {
      setStatus(t("ui.storage-recovery-failed"));
    } finally {
      setPassword("");
      setExporting(false);
    }
  }

  return (
    <>
      <summary>{t("ui.storage-export-recovery")}</summary>
      <p>{t("ui.storage-recovery-description")}</p>
      <form id="boot-recovery-form" onSubmit={download} aria-busy={exporting}>
        <label>
          {t("ui.backup-password")}{" "}
          <input
            id="boot-recovery-password"
            type="password"
            minLength={15}
            maxLength={128}
            autoComplete="new-password"
            required
            value={password}
            readOnly={exporting}
            onChange={(event) => setPassword(event.currentTarget.value)}
          />
        </label>
        <button type="submit" disabled={exporting}>
          {t("ui.storage-export-recovery")}
        </button>
      </form>
      <p id="boot-recovery-status" role="status">
        {status}
      </p>
    </>
  );
}

export function showStorageRecovery(host: HTMLElement) {
  paintFeature(host, <StorageRecovery />);
  host.hidden = false;
}
