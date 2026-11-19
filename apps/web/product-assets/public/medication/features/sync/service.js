import { careDelta } from "../../domain/care-delta.js";
import { assertRestoreRevision, isCloudRevision, restoreTarget } from "../../domain/restore-intent.js";
import { accessCare, accessCareSettings } from "../../shared/storage.js";
import { localZone } from "../../domain/care-plan.js";
import { careSnapshotFits, careSyncLimit, careVersion, portable, validateCareRecords } from "../../domain/care-records.js";
import { hasPrivateText } from "../../domain/private-fields.js";
import { cycleDataFields, cyclePreferenceFields, withoutCycle } from "../../domain/cycle.js";
import { applyPortable, CareConflict, conflictChoice, equal as same, mergeCare, mergeRestoredCare } from "./merge.js";
import { generateRecoveryKey, importRecoveryKey, normalizePrivateCare, openPrivateCare, sealPrivateCare } from "./private-care.js";
const path = "/api/account/care";

function syncError(response) {
  return new Error(({ 400: "invalid_sync", 401: "sign_in", 403: "forbidden", 413: "care_too_large",
    422: "private_key", 429: "rate_limit" })[response.status] ?? "sync_failed");
}

/** @typedef {{ enabled: boolean, syncedAt: number | undefined, status: string,
 * running: boolean, rotating: boolean, recoveryStatus: string, recoveryVersion: number,
 * review: { conflict: CareConflict, snapshot: ReturnType<typeof normalizePrivateCare> } | null }} SyncView */

export function createCareSync({ reload, remindersChanged, readCare = accessCare, readSettings = accessCareSettings,
  transport = /** @type {(path: string, options?: RequestInit) => Promise<Response>} */ (fetch), now = Date.now }) {
  let running = false;
  let timer;
  let message = "";
  let pendingSignIn = false;
  let recovery;
  let conflict;
  let conflictOwner;
  let resumeActivation = false;
  const choices = [];
  let authGeneration = 0;
  let recoveryAttempt = 0;
  let retryCount = 0;
  let retryAt = 0;
  const maxAutomaticRetries = 4;
  const listeners = new Set();
  /** @type {SyncView} */
  let view = { enabled: false, syncedAt: undefined, status: "", running: false, rotating: false,
    recoveryStatus: "", recoveryVersion: 0, review: null };

  /** @param {Partial<SyncView>} changes */
  function publish(changes) {
    view = { ...view, ...changes };
    for (const listener of listeners) listener();
  }

  function showConflict(value, snapshot) {
    conflict = value;
    publish({ review: value ? { conflict: value, snapshot } : null });
  }

  function chooseConflict(side) {
    if (running || !conflict) return;
    choices.push({ path: conflict.path, local: conflict.local, cloud: conflict.cloud, side });
    showConflict(undefined);
    retryCount = retryAt = 0;
    void sync(resumeActivation);
  }

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
    running = true;
    publish({ running });
    const currentGeneration = authGeneration;
    const key = recovery;
    message = "در حال همگام‌سازی سوابق…";
    void refresh();
    let accountOwner;
    let original;
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
      if (response.status !== 304 && !response.ok) throw syncError(response);
      const wire = response.status === 304 ? { owner: binding.owner, revision: binding.revision, records: binding.base } : await response.json();
      if (!isCloudRevision(wire)) throw new Error("invalid_sync");
      if ((restore?.owner ?? binding?.owner) && (restore?.owner ?? binding.owner) !== wire.owner) {
        message = "سوابق این مرورگر به حساب دیگری متصل‌اند. برای حساب جدید از نمایهٔ جداگانهٔ مرورگر استفاده کنید.";
        return;
      }
      if (response.status !== 304 && wire.records !== null) validateCareRecords(wire.records);
      accountOwner = wire.owner;
      if (conflictOwner !== accountOwner) choices.length = 0;
      const choose = value => conflictChoice(value, choices);
      original = normalizePrivateCare(local.cycleLocalOnly ? withoutCycle(portable(local)) : portable(local));
      const remote = { ...wire, records: normalizePrivateCare(await openPrivateCare(wire.records, key)) };
      if (currentGeneration !== authGeneration) return;
      const autoRestore = signedIn && !binding && remote.records && ![
        original.medicines, original.doses, original.visits, original.routines, original.water,
        original.routineLogs, original.cycleRecords, original.cycleDays, original.sleepRecords, original.scheduleHistory
      ].some(records => Object.keys(records ?? {}).length);
      if (!activate && !binding?.enabled && !autoRestore) { message = ""; return; }
      const replace = restore?.mode === "replace";
      const mergeRestore = Boolean(restore) && !replace;
      const restored = normalizePrivateCare(restore?.records);
      const privateCycle = local.cycleLocalOnly || restored?.settings?.cycleLocalOnly;
      const visible = records => privateCycle ? withoutCycle(records) : records;
      const cloud = visible(remote.records);
      const candidate = replace ? mergeCare(null, visible(restored), null) : mergeRestore ? mergeRestoredCare(visible(restored ?? original), cloud) :
        autoRestore ? mergeCare(null, cloud, null) : mergeCare(visible(binding?.base), original, cloud, choose);
      const sameRecords = remote.records && same(candidate, mergeCare(null, remote.records, null));
      if (restore) assertRestoreRevision(restore, remote, Boolean(sameRecords));
      let confirmed = remote;
      let privacyKey = wire.records?.privacyKey;
      if (((!autoRestore || local.cycleLocalOnly) && !sameRecords) || (!privacyKey && key)) {
        if (!privateCycle && (await readCare()).cycleLocalOnly) { retry(1000); return; }
        const zone = localZone();
        const protectedRecords = await sealPrivateCare({ ...candidate, careSchemaVersion: 2 }, key,
          Boolean(key && (!privacyKey || wire.records.privacyRotation)));
        validateCareRecords(protectedRecords);
        if (currentGeneration !== authGeneration) return;
        if (!careSnapshotFits(remote.owner, remote.revision, protectedRecords, zone)) throw new Error("care_too_large");
        const envelope = { owner: remote.owner, revision: remote.revision, zone };
        let body = JSON.stringify({ ...envelope, records: protectedRecords });
        let incremental = false;
        if (response.headers?.get("X-Medora-Care-Delta") === "1" && wire.records) {
          const changes = careDelta(wire.records, protectedRecords);
          if (changes) {
            const delta = JSON.stringify({ ...envelope, changes });
            if (delta.length < body.length) { body = delta; incremental = true; }
          }
        }
        const uploaded = await transport(path, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body,
          signal: AbortSignal.timeout(12_000)
        });
        if (uploaded.status === 409) {
          if (replace) throw new Error("restore_conflict");
          if (activate) message = "سوابق حساب هم‌زمان تغییر کردند. دوباره همگام‌سازی را بزنید.";
          else retry(1000);
          return;
        }
        if (!uploaded.ok) throw syncError(uploaded);
        const receipt = await uploaded.json();
        const saved = incremental && receipt.applied === true ? { ...receipt, records: protectedRecords } : receipt;
        if (!isCloudRevision(saved) || saved.owner !== remote.owner || saved.revision !== remote.revision + 1) {
          throw new Error("invalid_sync");
        }
        validateCareRecords(saved.records);
        privacyKey = saved.records.privacyKey;
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
        const deviceOnly = state.cycleLocalOnly || restored?.settings?.cycleLocalOnly;
        const fullSnapshot = portable(state);
        const snapshot = normalizePrivateCare(deviceOnly ? withoutCycle(fullSnapshot) : fullSnapshot);
        const result = mergeCare(deviceOnly ? withoutCycle(restored ?? original) : restored ?? original, snapshot,
          deviceOnly ? withoutCycle(confirmed.records) : confirmed.records, choose);
        edited = !same(result, mergeCare(null, confirmed.records, null));
        changed = !same(result, mergeCare(null, snapshot, null));
        linkChanged = !current?.enabled || current.sessionValid === false || current.owner !== remote.owner;
        if (changed) {
          if (deviceOnly) {
            for (const key of cycleDataFields) result[key] = state[key];
            for (const key of cyclePreferenceFields) if (Object.hasOwn(state, key)) result.settings[key] = state[key];
          }
          applyPortable(state, result);
          state.intro = "done";
        }
        if (changed || linkChanged) remindersChanged(state);
        delete state.preventAutoRestore;
        state.accountCare = { owner: remote.owner, enabled: true, revision: confirmed.revision,
          base: confirmed.records, syncedAt: now(), sessionValid: true, privacyKey };
      }, { snapshot: local });
      retryCount = retryAt = 0;
      showConflict(undefined);
      choices.length = 0;
      await reload(changed || linkChanged);
      message = !privacyKey && hasPrivateText(confirmed.records)
        ? "ui.sync-legacy-private-text" : "سوابق با حساب همگام شدند.";
      if (edited) schedule();
    } catch (error) {
      if (error instanceof CareConflict && currentGeneration === authGeneration) {
        conflictOwner = accountOwner;
        resumeActivation = activate;
        retryAt = Infinity;
        showConflict(error, original);
        message = "ui.sync-care-conflict";
        return;
      }
      if (error.message === "sign_in") {
        message = "برای ادامهٔ همگام‌سازی دوباره وارد حساب شوید.";
        await signedOut();
        return;
      }
      if (["private_key", "private_corrupt", "restore_conflict", "care_conflict", "invalid_backup", "invalid_sync", "forbidden"].includes(error.message)) {
        retryAt = Infinity;
        message = ({
          private_key: "ui.sync-recovery-key-required",
          private_corrupt: "ui.sync-private-corrupt",
          restore_conflict: "ui.restore-cloud-conflict",
          care_conflict: "ui.sync-care-conflict",
          invalid_backup: "ui.sync-invalid",
          invalid_sync: "ui.sync-invalid",
          forbidden: "ui.sync-not-authorized"
        })[error.message];
        return;
      }
      if (error.message === "care_too_large") {
        retryAt = Infinity;
        message = "حجم سوابق از ظرفیت همگام‌سازی بیشتر است. سوابق روی دستگاه باقی ماندند.";
        return;
      }
      message = error.message === "rate_limit" ? "ui.too-many-requests-check-again-in-one-minute" :
        "همگام‌سازی انجام نشد. سوابق روی دستگاه باقی ماندند.";
      if (!activate) retry(30_000);
    } finally {
      running = false;
      publish({ running });
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
      publish({ enabled: Boolean(accountCare?.enabled), syncedAt: accountCare?.syncedAt, status: message });
    } catch {}
  }

  async function activate(allowActivation) {
    if (running) return;
    const state = await readCare();
    if (running || (!state.accountCare?.enabled && !allowActivation())) return;
    retryCount = retryAt = 0;
    void sync(!state.accountCare?.enabled);
  }

  async function pause() {
    if (running) return;
    await readSettings(state => {
      if (!state.accountCare?.enabled) return;
      state.accountCare.enabled = false;
      remindersChanged(state);
    });
    await reload(true);
    message = "همگام‌سازی این دستگاه متوقف شد.";
    await refresh();
  }

  async function getZone() {
    const response = await transport(path + "?zone", { cache: "no-store", signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error("zone_unavailable");
    const data = await response.json();
    return typeof data.zone === "string" ? data.zone : undefined;
  }

  async function setZone(zone) {
    const { owner, revision } = await prepareRestore("merge");
    const response = await transport(path, { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner, revision, zone }), signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error("zone_unavailable");
    schedule();
  }

  function generateKey() {
    publish({ recoveryStatus: "ui.sync-save-recovery-key" });
    return generateRecoveryKey();
  }

  async function rotateKey(value, confirmRotation) {
    if (running) return;
    const previous = recovery;
    const input = value.trim().toLowerCase();
    const generation = authGeneration;
    if (!previous) {
      publish({ recoveryStatus: "ui.sync-recovery-key-required" });
      return;
    }
    if (!confirmRotation()) return;
    recoveryAttempt++;
    running = true;
    publish({ running, rotating: true });
    try {
      const replacement = await importRecoveryKey(input);
      if (replacement.id === previous.id) throw new Error("private_key");
      const response = await transport(path, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
      if (!response.ok) throw new Error("rotation_failed");
      const current = await response.json();
      if (!isCloudRevision(current)) throw new Error("rotation_failed");
      const { owner, revision, records } = current;
      const binding = (await readSettings()).accountCare;
      if ((binding?.owner && binding.owner !== owner) || generation !== authGeneration) return;
      validateCareRecords(records);
      if (!records.privacyRotation) throw new Error("rotation_legacy");
      if (records.privacyKey === replacement.id) {
        await openPrivateCare(records, replacement);
      } else {
        const clear = await openPrivateCare(records, previous);
        const sealed = await sealPrivateCare(clear, replacement, true);
        validateCareRecords(sealed);
        const body = JSON.stringify({ owner, revision, records: sealed, rotationProof: previous.rotationProof });
        if (generation !== authGeneration) return;
        if (new TextEncoder().encode(body).length > careSyncLimit) throw new Error("rotation_failed");
        const saved = await transport(path, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(12_000)
        });
        if (!saved.ok) throw new Error("rotation_failed");
        const confirmed = await saved.json();
        if (!isCloudRevision(confirmed) || confirmed.owner !== owner || confirmed.revision !== revision + 1 ||
            confirmed.records?.privacyKey !== replacement.id ||
            confirmed.records.privacyRotation !== replacement.rotationVerifier) throw new Error("rotation_failed");
        validateCareRecords(confirmed.records);
        if (!same(await openPrivateCare(confirmed.records, replacement), clear)) throw new Error("rotation_failed");
      }
      if (generation !== authGeneration) return;
      recovery = replacement;
      publish({ recoveryStatus: "ui.sync-key-rotated", recoveryVersion: view.recoveryVersion + 1 });
      schedule(0);
    } catch (error) {
      if (generation === authGeneration) publish({ recoveryStatus: error.message === "rotation_legacy"
        ? "ui.sync-rotation-legacy" : "ui.sync-rotation-failed" });
    } finally {
      running = false;
      publish({ running, rotating: false });
      if (pendingSignIn) {
        pendingSignIn = false;
        void sync(false, true);
      }
    }
  }
  async function unlockKey(value) {
    const attempt = ++recoveryAttempt;
    try {
      const imported = await importRecoveryKey(value.trim().toLowerCase());
      if (attempt !== recoveryAttempt) return;
      recovery = imported;
      publish({ recoveryStatus: "", recoveryVersion: view.recoveryVersion + 1 });
      if (running) pendingSignIn = true;
      else void sync(false, true);
    } catch {
      if (attempt === recoveryAttempt) publish({ recoveryStatus: "ui.sync-invalid-recovery-key" });
    }
  }

  function clearRecovery() {
    authGeneration++;
    recoveryAttempt++;
    showConflict(undefined);
    choices.length = 0;
    recovery = undefined;
    publish({ recoveryStatus: "", recoveryVersion: view.recoveryVersion + 1 });
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
  return {
    refresh, schedule, signedOut, prepareRestore, clearRecovery, signedIn: () => void sync(false, true),
    activate, pause, getZone, setZone, generateKey, rotateKey, unlockKey, chooseConflict,
    getSnapshot: () => view,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
