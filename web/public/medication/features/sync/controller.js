import { assertRestoreRevision, restoreTarget } from "../../domain/restore-intent.js";
import { $ } from "../../shared/ui/dom.js";
import { t } from "../../shared/i18n/locale.js";
import { accessCare, accessCareSettings } from "../../shared/storage.js";
import { localZone } from "../../domain/care-plan.js";
import { careSnapshotFits, careVersion, portable, validateCareRecords } from "../../domain/care-records.js";
import { hasPrivateText } from "../../domain/private-fields.js";
import { applyPortable, equal as same, mergeCare, mergeRestoredCare } from "./merge.js";
import { generateRecoveryKey, importRecoveryKey, normalizePrivateCare, openPrivateCare, sealPrivateCare } from "./private-care.js";
const path = "/api/account/care";

export function installCareSync({ reload, remindersChanged, readCare = accessCare, readSettings = accessCareSettings,
  transport = fetch, now = Date.now }) {
  const status = $("account-sync-status");
  const enable = $("account-sync-enable");
  const disable = $("account-sync-disable");
  let running = false;
  let timer;
  let message = "";
  let pendingSignIn = false;
  let recovery;
  let authGeneration = 0;
  let retryCount = 0;
  let retryAt = 0;
  const maxAutomaticRetries = 4;
  const keyInput = $("account-care-key");
  const keyStatus = $("account-care-key-status");
  const zoneInput = $("account-care-zone");
  const zoneStatus = $("account-care-zone-status");

  async function prepareRestore(mode) {
    if (mode === "device") return restoreTarget(mode);
    const response = await transport(path + "?zone", { cache: "no-store", signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(response.status === 401 ? "sign_in" : "sync_failed");
    return restoreTarget(mode, await response.json());
  }

  function schedule(delay = 1500) {
    retryCount = retryAt = 0;
    planSync(delay);
  }

  function retry(initialDelay) {
    if (retryCount >= maxAutomaticRetries) { retryAt = Infinity; return; }
    const delay = Math.min(initialDelay * 2 ** retryCount++, 120_000) + Math.random() * 1000;
    retryAt = now() + delay;
    planSync(delay);
  }

  function planSync(delay) {
    clearTimeout(timer);
    timer = setTimeout(() => void sync(), Math.ceil(delay));
  }

  async function sync(activate = false, signedIn = false) {
    if (running) {
      pendingSignIn ||= signedIn;
      return;
    }
    if (!activate && !signedIn && now() < retryAt) return;
    if (!navigator.onLine) {
      if (activate) {
        message = "برای فعال‌کردن همگام‌سازی به اینترنت وصل شوید.";
        await refresh();
      }
      return;
    }
    running = enable.disabled = disable.disabled = true;
    const currentGeneration = authGeneration;
    const key = recovery;
    message = "در حال همگام‌سازی سوابق…";
    void refresh();
    try {
      if (!activate && !signedIn && !((await readSettings()).accountCare?.enabled)) {
        message = "";
        return;
      }
      const local = await readCare();
      const binding = local.accountCare;
      const restore = binding?.restore;
      if ((restore?.mode === "device" || local.preventAutoRestore) && !activate) { message = ""; return; }
      if (!activate && !signedIn && !binding?.enabled) { message = ""; return; }
      const known = !restore && !binding?.privacyKey && binding?.base && binding.owner && Number.isSafeInteger(binding.revision);
      const response = await transport(path, {
        cache: "no-store", signal: AbortSignal.timeout(12_000),
        ...(known && { headers: { "If-None-Match": careVersion(binding.owner, binding.revision) } })
      });
      if (response.status === 401) {
        message = "برای ادامهٔ همگام‌سازی دوباره وارد حساب شوید.";
        await signedOut();
        return;
      }
      if (response.status !== 304 && !response.ok) throw new Error();
      const wire = response.status === 304 ? { owner: binding.owner, revision: binding.revision, records: binding.base } : await response.json();
      if ((restore?.owner ?? binding?.owner) && (restore?.owner ?? binding.owner) !== wire.owner) {
        message = "سوابق این مرورگر به حساب دیگری متصل‌اند. برای حساب جدید از نمایهٔ جداگانهٔ مرورگر استفاده کنید.";
        return;
      }
      const original = normalizePrivateCare(portable(local));
      const remote = { ...wire, records: normalizePrivateCare(await openPrivateCare(wire.records, key)) };
      if (currentGeneration !== authGeneration) return;
      const autoRestore = signedIn && !binding && remote.records && ![
        original.medicines, original.doses, original.visits, original.routines, original.water,
        original.routineLogs, original.cycleRecords, original.scheduleHistory
      ].some(records => Object.keys(records ?? {}).length);
      if (!activate && !binding?.enabled && !autoRestore) { message = ""; return; }
      const replace = restore?.mode === "replace";
      const mergeRestore = Boolean(restore) && !replace;
      const restored = normalizePrivateCare(restore?.records);
      const candidate = replace ? mergeCare(null, restored, null) : mergeRestore ? mergeRestoredCare(restored ?? original, remote.records) :
        autoRestore ? remote.records : mergeCare(binding?.base, original, remote.records);
      const sameRecords = remote.records && same(candidate, mergeCare(null, remote.records, null));
      if (restore) assertRestoreRevision(restore, remote, Boolean(sameRecords));
      let confirmed = remote;
      let privacyKey = wire.records?.privacyKey;
      if ((!autoRestore && !sameRecords) || (!privacyKey && key)) {
        const zone = localZone();
        const protectedRecords = await sealPrivateCare({ ...candidate, careSchemaVersion: 1 }, key);
        validateCareRecords(protectedRecords);
        if (currentGeneration !== authGeneration) return;
        if (!careSnapshotFits(remote.owner, remote.revision, protectedRecords, zone)) throw new Error("care_too_large");
        const uploaded = await transport(path, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ owner: remote.owner, revision: remote.revision, records: protectedRecords, zone }),
          signal: AbortSignal.timeout(12_000)
        });
        if (uploaded.status === 409) {
          if (replace) throw new Error("restore_conflict");
          if (activate) message = "سوابق حساب هم‌زمان تغییر کردند. دوباره همگام‌سازی را بزنید.";
          else retry(1000);
          return;
        }
        if (!uploaded.ok) throw new Error((await uploaded.json().catch(() => ({}))).error ?? "sync_failed");
        const saved = await uploaded.json();
        privacyKey = saved.records?.privacyKey;
        confirmed = { ...saved, records: normalizePrivateCare(await openPrivateCare(saved.records, key)) };
      }
      if (currentGeneration !== authGeneration) return;
      let edited = false;
      let changed = false;
      let linkChanged = false;
      await readCare(state => {
        const current = state.accountCare;
        if (currentGeneration !== authGeneration || current?.restore?.id !== restore?.id || (state.preventAutoRestore && !activate) ||
            (current?.owner && current.owner !== remote.owner) ||
            (!activate && !autoRestore && !current?.enabled) ||
            (current?.revision ?? 0) > confirmed.revision) return;
        const snapshot = normalizePrivateCare(portable(state));
        const result = mergeCare(restored ?? original, snapshot, confirmed.records);
        edited = !same(result, mergeCare(null, confirmed.records, null));
        changed = !same(result, mergeCare(null, snapshot, null));
        linkChanged = !current?.enabled || current.sessionValid === false || current.owner !== remote.owner;
        if (changed) {
          applyPortable(state, result);
          state.intro = "done";
        }
        if (changed || linkChanged) remindersChanged(state);
        delete state.preventAutoRestore;
        state.accountCare = { owner: remote.owner, enabled: true, revision: confirmed.revision,
          base: confirmed.records, syncedAt: now(), sessionValid: true, privacyKey };
      }, { snapshot: local });
      retryCount = retryAt = 0;
      await reload(changed || linkChanged);
      message = !privacyKey && hasPrivateText(confirmed.records)
        ? "ui.sync-legacy-private-text" : "سوابق با حساب همگام شدند.";
      if (edited) schedule();
    } catch (error) {
      if (error.message === "sign_in") {
        message = "برای ادامهٔ همگام‌سازی دوباره وارد حساب شوید.";
        await signedOut();
        return;
      }
      if (["private_key", "private_corrupt", "restore_conflict", "care_conflict", "invalid_backup", "invalid_sync"].includes(error.message)) {
        retryAt = Infinity;
        message = ({
          private_key: "ui.sync-recovery-key-required",
          private_corrupt: "ui.sync-private-corrupt",
          restore_conflict: "ui.restore-cloud-conflict",
          care_conflict: "ui.sync-care-conflict",
          invalid_backup: "ui.sync-invalid",
          invalid_sync: "ui.sync-invalid"
        })[error.message];
        return;
      }
      if (error.message === "care_too_large") {
        retryAt = Infinity;
        message = "حجم سوابق از ظرفیت همگام‌سازی بیشتر است. سوابق روی دستگاه باقی ماندند.";
        return;
      }
      message = "همگام‌سازی انجام نشد. سوابق روی دستگاه باقی ماندند.";
      if (!activate) retry(30_000);
    } finally {
      running = enable.disabled = disable.disabled = false;
      await refresh();
      if (pendingSignIn) {
        pendingSignIn = false;
        void sync(false, true);
      }
    }
  }

  async function refresh() {
    try {
      const { accountCare } = await readSettings();
      enable.textContent = t(accountCare?.enabled ? "همگام‌سازی اکنون" : "فعال‌کردن همگام‌سازی سوابق");
      disable.hidden = !accountCare?.enabled;
      const badge = $("account-sync-badge");
      badge.dataset.enabled = String(Boolean(accountCare?.enabled));
      badge.textContent = t(accountCare?.enabled ? "روشن" : "فقط روی دستگاه");
      const last = $("account-sync-last");
      last.hidden = !accountCare?.syncedAt;
      last.textContent = last.hidden ? "" : t("ui.last-synced-value", new Date(accountCare.syncedAt).toLocaleString(document.documentElement.lang));
      status.textContent = message ? t(message) : "";
    } catch {}
  }

  enable.addEventListener("click", () => {
    void readCare().then(state => {
      if (!state.accountCare?.enabled && !confirm(t("ui.add-this-devices-records-to-the-current-account"))) return;
      retryCount = retryAt = 0;
      void sync(!state.accountCare?.enabled);
    });
  });
  disable.addEventListener("click", async () => {
    if (running) return;
    await readSettings(state => {
      if (!state.accountCare?.enabled) return;
      state.accountCare.enabled = false;
      remindersChanged(state);
    });
    await reload(true);
    message = "همگام‌سازی این دستگاه متوقف شد.";
    await refresh();
  });
  $("account-care-zone-open").addEventListener("toggle", async event => {
    if (!event.target.open) return;
    try {
      const response = await transport(path + "?zone", { cache: "no-store", signal: AbortSignal.timeout(12_000) });
      if (!response.ok) throw new Error("zone_unavailable");
      const data = await response.json();
      zoneInput.value = data.zone ?? localZone();
      zoneStatus.textContent = "";
    } catch {
      zoneStatus.textContent = t("ui.sync-zone-unavailable");
    }
  });
  $("account-care-zone-save").addEventListener("click", async event => {
    const control = event.currentTarget;
    const zone = zoneInput.value.trim();
    control.disabled = true;
    try {
      const { owner, revision } = await prepareRestore("merge");
      const response = await transport(path, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, revision, zone }), signal: AbortSignal.timeout(12_000) });
      if (!response.ok) throw new Error("zone_unavailable");
      zoneStatus.textContent = t("ui.sync-zone-saved");
      schedule();
    } catch {
      zoneStatus.textContent = t("ui.sync-zone-unavailable");
    } finally {
      control.disabled = false;
    }
  });

  $("account-care-key-generate").addEventListener("click", () => {
    keyInput.type = "text";
    keyInput.value = generateRecoveryKey();
    keyInput.select();
    keyStatus.textContent = t("ui.sync-save-recovery-key");
  });
  $("account-care-key-unlock").addEventListener("click", async () => {
    try {
      recovery = await importRecoveryKey(keyInput.value.trim().toLowerCase());
      keyInput.value = "";
      keyInput.type = "password";
      keyStatus.textContent = "";
      if (running) pendingSignIn = true;
      else void sync(false, true);
    } catch {
      keyStatus.textContent = t("ui.sync-invalid-recovery-key");
    }
  });
  function clearRecovery() {
    authGeneration++;
    recovery = undefined;
    keyInput.value = "";
    keyInput.type = "password";
    keyStatus.textContent = "";
  }

  async function signedOut() {
    clearRecovery();
    let changed = false;
    await readSettings(state => {
      if (!state.accountCare?.enabled || state.accountCare.sessionValid === false) return;
      state.accountCare.sessionValid = false;
      remindersChanged(state);
      changed = true;
    });
    if (changed) await reload(true);
  }
  window.addEventListener("online", () => schedule(0));
  window.addEventListener("focus", () => schedule(0));
  setInterval(() => { if (!document.hidden && !running && now() >= retryAt) void sync(); }, 30_000);
  return { refresh, schedule, signedOut, prepareRestore, clearRecovery, signedIn: () => void sync(false, true) };
}
