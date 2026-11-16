import { recordObject } from "../domain/care-contract.js";
const databaseName = "medora-medication-prototype";
const snapshots = new WeakMap();
const corruptStorage = () => new DOMException("Invalid care database", "DataError");

function validBucket(bucket) {
  return Number.isInteger(bucket?.day) && recordObject(bucket.doses) && Array.isArray(bucket.water) &&
    (bucket.routines === undefined || recordObject(bucket.routines)) &&
    bucket.water.every(row => recordObject(row) && row.day === bucket.day) &&
    Object.values(bucket.doses).every(row => recordObject(row) && row.day === bucket.day);
}

function blankDay(day) {
  return { day, doses: {}, water: [], routines: {} };
}

function historyDays(state) {
  const days = new Map();
  function bucket(day) {
    if (!days.has(day)) days.set(day, blankDay(day));
    return days.get(day);
  }
  for (const [id, dose] of Object.entries(state.doses ?? {})) bucket(dose.day).doses[id] = dose;
  for (const entry of state.water ?? []) bucket(entry.day).water.push(entry);
  for (const [day, logs] of Object.entries(state.routineLogs ?? {})) {
    if (Object.keys(logs).length) bucket(Number(day)).routines = logs;
  }
  return days;
}

function metadata(state) {
  const { doses, water, routineLogs, ...settings } = state;
  return settings;
}

function assemble(settings, days) {
  const state = { ...settings, doses: {}, water: [], routineLogs: {} };
  for (const bucket of days.values()) {
    Object.assign(state.doses, bucket.doses);
    for (const entry of bucket.water) state.water.push(entry);
    if (bucket.routines && Object.keys(bucket.routines).length) state.routineLogs[bucket.day] = bucket.routines;
  }
  return state;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 3);
    let blocked = false;
    let damaged = false;
    function abortUpgrade() {
      damaged = true;
      request.transaction.abort();
    }
    request.onupgradeneeded = event => {
      const db = request.result;
      // Older shells rewrite day records without routine history.
      if (event.oldVersion >= 2) {
        if (!["care", "days"].every(name => db.objectStoreNames.contains(name))) abortUpgrade();
        return;
      }
      const care = db.objectStoreNames.contains("care") ? request.transaction.objectStore("care") : db.createObjectStore("care");
      const history = db.createObjectStore("days", { keyPath: "day" });
      const read = care.get("state");
      read.onsuccess = () => {
        const legacy = read.result;
        if (legacy === undefined) return;
        if (!recordObject(legacy)) { abortUpgrade(); return; }
        let days;
        try { days = historyDays(legacy); }
        catch { abortUpgrade(); return; }
        if (![...days.values()].every(validBucket)) { abortUpgrade(); return; }
        for (const bucket of days.values()) history.put(bucket);
        care.put({ settings: metadata(legacy), revision: 0 }, "state");
      };
    };
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      if (!["care", "days"].every(name => request.result.objectStoreNames.contains(name))) {
        request.result.close();
        reject(corruptStorage());
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(damaged ? corruptStorage() : request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new DOMException("Storage upgrade blocked", "BlockedError"));
    };
  });
}

// Day-scoped commands receive only the records for their day. Every write still
// reads fresh settings and checks the history revision inside its transaction.
async function transact(change, { snapshot, day, settingsOnly } = {}) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(settingsOnly ? "care" : ["care", "days"], change ? "readwrite" : "readonly");
      const care = transaction.objectStore("care");
      let result;
      let error;
      function attempt(work) {
        try { work(); } catch (cause) {
          error = cause;
          transaction.abort();
        }
      }
      const read = care.get("state");
      read.onsuccess = () => attempt(() => {
        const stored = read.result === undefined ? { settings: { medicines: {} }, revision: 0 } : read.result;
        if (!recordObject(stored?.settings) || !recordObject(stored.settings.medicines) ||
            !Number.isSafeInteger(stored.revision) || stored.revision < 0) throw corruptStorage();
        const { settings, revision } = stored;
        if (settingsOnly) {
          change?.(settings);
          if (change) care.put(stored, "state");
          result = settings;
          return;
        }
        const history = transaction.objectStore("days");
        const cached = snapshots.get(snapshot);
        const matching = cached?.revision === revision ? cached : null;

        function apply(days) {
          if (!change) {
            if (matching && JSON.stringify(settings) === matching.settingsKey) {
              result = snapshot;
            } else {
              result = matching ? { ...settings, doses: snapshot.doses, water: snapshot.water, routineLogs: snapshot.routineLogs } : assemble(settings, days);
              snapshots.set(result, { revision, days, settingsKey: JSON.stringify(settings) });
            }
            return;
          }

          let nextDays;
          let changed = false;
          if (Number.isInteger(day)) {
            const bucket = days.get(day) ?? blankDay(day);
            const { doses, water, routines = {} } = structuredClone(bucket);
            const scoped = { ...settings, doses, water, routineLogs: { [day]: routines } };
            change(scoped);
            nextDays = new Map(days);
            const updated = { day, doses: scoped.doses, water: scoped.water, routines: scoped.routineLogs[day] ?? {} };
            if (JSON.stringify(updated) !== JSON.stringify({ ...bucket, routines: bucket.routines ?? {} })) {
              changed = true;
              if (updated.water.length || Object.keys(updated.doses).length || Object.keys(updated.routines).length) {
                nextDays.set(day, updated);
                history.put(updated);
              } else {
                nextDays.delete(day);
                history.delete(day);
              }
            }
            const nextSettings = metadata(scoped);
            result = changed ? assemble(nextSettings, nextDays) :
              matching ? { ...nextSettings, doses: snapshot.doses, water: snapshot.water, routineLogs: snapshot.routineLogs } : assemble(nextSettings, nextDays);
          } else {
            const before = new Map([...days].map(([key, bucket]) => [key, JSON.stringify({ ...bucket, routines: bucket.routines ?? {} })]));
            result = assemble(settings, days);
            change(result);
            nextDays = historyDays(result);
            for (const [key, bucket] of nextDays) {
              if (before.get(key) === JSON.stringify(bucket)) continue;
              history.put(bucket);
              changed = true;
            }
            for (const key of before.keys()) {
              if (nextDays.has(key)) continue;
              history.delete(key);
              changed = true;
            }
          }
          const nextSettings = metadata(result);
          const nextRevision = revision + Number(changed);
          care.put({ settings: nextSettings, revision: nextRevision }, "state");
          snapshots.set(result, { revision: nextRevision, days: nextDays, settingsKey: JSON.stringify(nextSettings) });
        }

        // Full commands may mutate arbitrary history, so they use a fresh copy.
        if (matching && (!change || Number.isInteger(day))) apply(matching.days);
        else {
          const records = history.getAll();
          records.onsuccess = () => attempt(() => {
            if ((read.result === undefined && records.result.length) || !records.result.every(validBucket)) throw corruptStorage();
            apply(new Map(records.result.map(bucket => [bucket.day, bucket])));
          });
        }
      });
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(error ?? transaction.error);
    });
  } finally {
    db.close();
  }
}

export function accessCare(change, options) {
  return transact(change, options);
}

export function accessCareSettings(change) {
  return transact(change, { settingsOnly: true });
}

export function storageMessage(error, fallback) {
  return ({
    BlockedError: "ui.storage-blocked",
    DataError: "ui.storage-damaged",
    NotFoundError: "ui.storage-damaged",
    VersionError: "ui.storage-version",
    QuotaExceededError: "ui.storage-quota",
    SecurityError: "ui.storage-unavailable",
    InvalidStateError: "ui.storage-unavailable"
  })[error?.name] ?? fallback;
}

// Read the existing version in a separate read-only transaction. Recovery must
// never create, upgrade or delete a database.
export function readCareRecovery() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName);
    request.onupgradeneeded = () => request.transaction.abort();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      try {
        const names = ["care", "days"].filter(name => db.objectStoreNames.contains(name));
        if (!names.length) throw corruptStorage();
        const transaction = db.transaction(names);
        const care = names.includes("care") ? transaction.objectStore("care").get("state") : null;
        const days = names.includes("days") ? transaction.objectStore("days").getAll() : null;
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => {
          const state = care?.result;
          for (const data of [state, state?.settings]) {
            if (!recordObject(data)) continue;
            delete data.accountCare;
            delete data.reminders;
          }
          resolve({ databaseVersion: db.version, care: state ?? null, days: days?.result ?? [] });
        };
      } catch (error) { reject(error); }
      finally { db.close(); }
    };
  });
}
