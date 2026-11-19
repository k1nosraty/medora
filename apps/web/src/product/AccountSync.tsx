import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { t } from "../../product-assets/public/medication/shared/i18n/locale.js";
import { localZone } from "../../product-assets/public/medication/domain/care-plan.js";
import type { createCareSync } from "../../product-assets/public/medication/features/sync/service.js";
import { TimeZoneChoices } from "./settings/TimeZoneChoices";
import { SyncConflictReview } from "./SyncConflicts";

export type CareSync = ReturnType<typeof createCareSync>;

function CareZone({ sync }: { sync: CareSync }) {
  const device = localZone() ?? "UTC";
  const [initial, setInitial] = useState("");
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [picker, setPicker] = useState(0);
  const generation = useRef(0);

  async function load(open: boolean) {
    const request = ++generation.current;
    if (!open) return;
    setInitial("");
    setStatus("");
    try {
      const zone = (await sync.getZone()) ?? device;
      if (request !== generation.current) return;
      setSelected(zone);
      setInitial(zone);
      setPicker(request);
    } catch {
      if (request === generation.current) setStatus("ui.sync-zone-unavailable");
    }
  }

  async function save() {
    const request = generation.current;
    setBusy(true);
    try {
      await sync.setZone(selected);
      if (request === generation.current) setStatus("ui.sync-zone-saved");
    } catch {
      if (request === generation.current) setStatus("ui.sync-zone-unavailable");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details
      id="account-care-zone-open"
      onToggle={(event) => void load(event.currentTarget.open)}
    >
      <summary id="account-care-zone-title">{t("ui.sync-care-zone")}</summary>
      <p className="quiet">{t("ui.sync-care-zone-description")}</p>
      <fieldset
        id="account-care-zone-picker"
        aria-labelledby="account-care-zone-title"
        disabled={!initial}
      >
        {initial && (
          <TimeZoneChoices
            key={picker}
            id="account-care-zone"
            initial={initial}
            device={device}
            value={selected}
            onChange={setSelected}
          />
        )}
      </fieldset>
      <button
        id="account-care-zone-save"
        type="button"
        className="secondary"
        disabled={!initial || busy}
        onClick={() => void save()}
      >
        {t("ui.save")}
      </button>
      <p
        id="account-care-zone-status"
        className="settings-message"
        role="status"
      >
        {status && t(status)}
      </p>
    </details>
  );
}

export function AccountSync({
  sync,
  dialog,
  formatDay,
  hidden,
}: {
  sync: CareSync;
  dialog: HTMLDialogElement;
  formatDay(day: number): string;
  hidden: boolean;
}) {
  const view = useSyncExternalStore(sync.subscribe, sync.getSnapshot);
  const [revealVersion, setRevealVersion] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const revealed = revealVersion === view.recoveryVersion;
  useEffect(() => {
    const conceal = () => setRevealVersion(null);
    dialog.addEventListener("close", conceal);
    return () => dialog.removeEventListener("close", conceal);
  }, [dialog]);

  return (
    <section
      className="account-sync"
      aria-labelledby="account-sync-title"
      hidden={hidden}
    >
      <div className="account-sync-heading">
        <h3 id="account-sync-title">{t("ui.sync-records")}</h3>
        <span id="account-sync-badge" data-enabled={String(view.enabled)}>
          {t(view.enabled ? "روشن" : "فقط روی دستگاه")}
        </span>
      </div>
      <p className="quiet">
        {t("ui.when-enabled-records-and-schedules-on-this-device-join-yo")}
      </p>
      <p className="quiet">{t("ui.sync-privacy-summary")}</p>
      <details>
        <summary>{t("ui.sync-recovery-key")}</summary>
        <p className="quiet">{t("ui.sync-recovery-description")}</p>
        <label>
          {t("ui.sync-recovery-key")}
          <input
            key={view.recoveryVersion}
            ref={input}
            id="account-care-key"
            type={revealed ? "text" : "password"}
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
            maxLength={64}
          />
        </label>
        <button
          type="button"
          id="account-care-key-reveal"
          className="text-button"
          aria-controls="account-care-key"
          onClick={() =>
            setRevealVersion(revealed ? null : view.recoveryVersion)
          }
        >
          {t(revealed ? "ui.sync-hide-key" : "ui.sync-show-key")}
        </button>
        <button
          type="button"
          id="account-care-key-generate"
          className="secondary"
          onClick={() => {
            if (!input.current) return;
            input.current.value = sync.generateKey();
            setRevealVersion(view.recoveryVersion);
            input.current.select();
          }}
        >
          {t("ui.sync-generate-key")}
        </button>
        <button
          type="button"
          id="account-care-key-unlock"
          className="secondary"
          disabled={view.rotating}
          onClick={() => void sync.unlockKey(input.current?.value ?? "")}
        >
          {t("ui.sync-unlock-key")}
        </button>
        <button
          type="button"
          id="account-care-key-rotate"
          className="secondary"
          disabled={view.rotating}
          onClick={() =>
            void sync.rotateKey(input.current?.value ?? "", () =>
              confirm(t("ui.sync-rotate-confirm")),
            )
          }
        >
          {t("ui.sync-rotate-key")}
        </button>
        <p
          id="account-care-key-status"
          className="settings-message"
          role="status"
        >
          {view.recoveryStatus && t(view.recoveryStatus)}
        </p>
      </details>
      <CareZone sync={sync} />
      <button
        id="account-sync-enable"
        type="button"
        className="secondary"
        disabled={view.running}
        onClick={() =>
          void sync.activate(() =>
            confirm(t("ui.add-this-devices-records-to-the-current-account")),
          )
        }
      >
        {t(view.enabled ? "همگام‌سازی اکنون" : "فعال‌کردن همگام‌سازی سوابق")}
      </button>
      <button
        id="account-sync-disable"
        type="button"
        className="text-button"
        hidden={!view.enabled}
        disabled={view.running}
        onClick={() => void sync.pause()}
      >
        {t("ui.pause-sync-on-this-device")}
      </button>
      <p id="account-sync-last" className="quiet" hidden={!view.syncedAt}>
        {view.syncedAt
          ? t(
              "ui.last-synced-value",
              new Date(view.syncedAt).toLocaleString(
                document.documentElement.lang,
              ),
            )
          : ""}
      </p>
      <p id="account-sync-status" className="quiet" role="status">
        {view.status && t(view.status)}
      </p>
      {view.review ? (
        <SyncConflictReview
          conflict={view.review.conflict}
          snapshot={view.review.snapshot}
          formatDay={formatDay}
          choose={sync.chooseConflict}
        />
      ) : (
        <section id="account-sync-review" hidden />
      )}
    </section>
  );
}
