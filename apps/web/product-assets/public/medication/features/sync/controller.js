import { $ } from "../../shared/ui/dom.js";
import { t } from "../../shared/i18n/locale.js";
import { localZone } from "../../domain/care-plan.js";
import { installTimeZonePicker } from "../../shared/ui/time-zone-picker.js";
import { showCareConflict } from "./conflict-view.js";
import { createCareSync } from "./service.js";

export function installCareSync({ formatDay, ...options }) {
  const sync = createCareSync(options);
  const enable = $("account-sync-enable");
  const disable = $("account-sync-disable");
  const review = $("account-sync-review");
  const keyInput = $("account-care-key");
  const reveal = $("account-care-key-reveal");
  function revealKey(visible) {
    keyInput.type = visible ? "text" : "password";
    reveal.textContent = t(visible ? "ui.sync-hide-key" : "ui.sync-show-key");
  }
  reveal.addEventListener("click", () => revealKey(keyInput.type === "password"));
  $("account-dialog").addEventListener("close", () => revealKey(false));

  let previousReview;
  let keyVersion = 0;
  sync.subscribe(() => {
    const view = sync.getSnapshot();
    enable.disabled = disable.disabled = view.running;
    enable.textContent = t(view.enabled ? "همگام‌سازی اکنون" : "فعال‌کردن همگام‌سازی سوابق");
    disable.hidden = !view.enabled;
    const badge = $("account-sync-badge");
    badge.dataset.enabled = String(view.enabled);
    badge.textContent = t(view.enabled ? "روشن" : "فقط روی دستگاه");
    const last = $("account-sync-last");
    last.hidden = !view.syncedAt;
    last.textContent = last.hidden ? "" : t("ui.last-synced-value", new Date(view.syncedAt).toLocaleString(document.documentElement.lang));
    $("account-sync-status").textContent = view.status ? t(view.status) : "";
    $("account-care-key-unlock").disabled = $("account-care-key-rotate").disabled = view.rotating;
    $("account-care-key-status").textContent = view.recoveryStatus ? t(view.recoveryStatus) : "";
    if (view.recoveryVersion !== keyVersion) {
      keyVersion = view.recoveryVersion;
      keyInput.value = "";
      revealKey(false);
    }
    if (view.review !== previousReview) {
      previousReview = view.review;
      review.hidden = !view.review;
      showCareConflict(view.review?.conflict, view.review?.snapshot, formatDay);
    }
  });
  for (const side of ["device", "cloud"])
    $("account-sync-keep-" + side).addEventListener("click", () => sync.chooseConflict(side));
  enable.addEventListener("click", () => void sync.activate(() => confirm(t("ui.add-this-devices-records-to-the-current-account"))));
  disable.addEventListener("click", () => void sync.pause());
  $("account-care-key-generate").addEventListener("click", () => {
    revealKey(true);
    keyInput.value = sync.generateKey();
    keyInput.select();
  });
  $("account-care-key-unlock").addEventListener("click", () => void sync.unlockKey(keyInput.value));
  $("account-care-key-rotate").addEventListener("click", () =>
    void sync.rotateKey(keyInput.value, () => confirm(t("ui.sync-rotate-confirm"))));

  const zonePanel = $("account-care-zone-open");
  const zoneFields = $("account-care-zone-picker");
  const zonePicker = installTimeZonePicker($("account-care-zone-search"), $("account-care-zone-options"), $("account-care-zone-empty"));
  const zoneSave = $("account-care-zone-save");
  const zoneStatus = $("account-care-zone-status");
  let zoneRequest = 0;
  zonePanel.addEventListener("toggle", async () => {
    const request = ++zoneRequest;
    if (!zonePanel.open) return;
    zoneFields.disabled = zoneSave.disabled = true;
    zoneStatus.textContent = "";
    try {
      const zone = await sync.getZone();
      if (request !== zoneRequest) return;
      zonePicker.load(zone, localZone() ?? "UTC", options.now?.() ?? Date.now());
      zoneFields.disabled = zoneSave.disabled = false;
    } catch {
      if (request === zoneRequest) zoneStatus.textContent = t("ui.sync-zone-unavailable");
    }
  });
  zoneSave.addEventListener("click", async () => {
    const zone = zonePicker.value;
    if (!zone) return;
    zoneSave.disabled = true;
    try {
      await sync.setZone(zone);
      zoneStatus.textContent = t("ui.sync-zone-saved");
    } catch {
      zoneStatus.textContent = t("ui.sync-zone-unavailable");
    } finally {
      zoneSave.disabled = zoneFields.disabled;
    }
  });
  return sync;
}
