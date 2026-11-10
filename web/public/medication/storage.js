const databaseName = "medora-medication-prototype";
const snapshots = new WeakMap();

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
    request.onupgradeneeded = event => {
      // Older shells rewrite day records without routine history.
      if (event.oldVersion >= 2) return;
      const db = request.result;
      const care = db.objectStoreNames.contains("care") ? request.transaction.objectStore("care") : db.createObjectStore("care");
      const history = db.createObjectStore("days", { keyPath: "day" });
      const read = care.get("state");
      read.onsuccess = () => {
        const legacy = read.result;
        if (!legacy) return;
        for (const bucket of historyDays(legacy).values()) history.put(bucket);
        care.put({ settings: metadata(legacy), revision: 0 }, "state");
      };
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Storage blocked"));
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
        const stored = read.result ?? { settings: { medicines: {} }, revision: 0 };
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
        if (!read.result) apply(new Map());
        else if (matching && (!change || Number.isInteger(day))) apply(matching.days);
        else {
          const records = history.getAll();
          records.onsuccess = () => attempt(() => apply(new Map(records.result.map(bucket => [bucket.day, bucket]))));
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
