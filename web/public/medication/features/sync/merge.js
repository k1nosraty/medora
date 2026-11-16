import { webBackupSettings } from "../../domain/care-records.js";

import { equalCareValues as equal } from "../../domain/care-contract.js";
export { equal };

function mergeMap(base = {}, local = {}, remote = {}, mergeValue) {
  return Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])].flatMap(key => {
    const previous = Object.hasOwn(base, key) ? base[key] : undefined;
    const ours = Object.hasOwn(local, key) ? local[key] : undefined;
    const theirs = Object.hasOwn(remote, key) ? remote[key] : undefined;
    const value = mergeValue ? mergeValue(previous, ours, theirs, key) : equal(previous, ours) ? theirs : ours;
    return value === undefined ? [] : [[key, value]];
  }));
}

function indexUnique(rows, keyOf) {
  const indexed = Object.fromEntries(rows.map(row => [keyOf(row), row]));
  if (Object.keys(indexed).length !== rows.length) throw new Error("invalid_backup");
  return indexed;
}
const byWaterId = (rows = []) => indexUnique(rows, row => row.id);
const byVersion = (rows = []) => indexUnique(rows, row => JSON.stringify([row.plan.id, row.until]));
const records = ["visits", "routines", "cycleRecords"];

function debits(snapshot) {
  const totals = new Map();
  for (const dose of Object.values(snapshot.doses ?? {})) {
    if (!dose.debit) continue;
    const key = JSON.stringify([dose.medicineId, dose.unit ?? snapshot.medicines?.[dose.medicineId]?.unit]);
    totals.set(key, (totals.get(key) ?? 0n) + BigInt(dose.debit));
  }
  return totals;
}

export const medicineScheduleFields = ["phases", "dates", "phased", "paused", "archived", "effectiveFrom", "scheduleFrom", "unit", "stockTrackedFrom"];
const select = (row, fields) => !row ? undefined : fields.map(key => row[key]);
function diverged(before, ours, theirs) {
  return !equal(before, ours) && !equal(before, theirs) && !equal(ours, theirs);
}

function preferRecord(before, ours, theirs) {
  return equal(before, ours) ? theirs : ours;
}

export class CareConflict extends Error {
  constructor(path, local, cloud) {
    super("care_conflict");
    this.path = path;
    this.local = local;
    this.cloud = cloud;
  }
}

export function conflictChoice(conflict, choices) {
  return choices.find(choice => equal(choice.path, conflict.path) &&
    equal(choice.local, conflict.local) && equal(choice.cloud, conflict.cloud))?.side;
}

function mergeMedicines(base, local, remote, merged, resolve) {
  const totals = [base, local, remote, { ...merged, medicines: local.medicines }].map(debits);
  return mergeMap(base.medicines, local.medicines, remote.medicines, (before, ours, theirs, id) => {
    const path = ["medicines", id];
    if (!before || !ours || !theirs) return resolve(path, before, ours, theirs);
    const scheduleBefore = select(before, medicineScheduleFields);
    const scheduleLocal = select(ours, medicineScheduleFields);
    const scheduleCloud = select(theirs, medicineScheduleFields);
    const schedule = diverged(scheduleBefore, scheduleLocal, scheduleCloud)
      ? resolve([...path, "schedule"], before, ours, theirs, true)
      : preferRecord(scheduleBefore, scheduleLocal, scheduleCloud) === scheduleLocal ? ours : theirs;
    const scope = row => JSON.stringify([row.unit, row.stockTrackedFrom, Number.isSafeInteger(row.stock)]);
    const previous = scope(before);
    const localTracking = scope(ours) !== previous;
    const remoteTracking = scope(theirs) !== previous;
    const fields = mergeMap(before, ours, theirs, (previous, localValue, cloudValue, field) => {
      if (medicineScheduleFields.includes(field)) return schedule[field];
      if (field === "stock" || field === "revision") return preferRecord(previous, localValue, cloudValue);
      return resolve([...path, field], previous, localValue, cloudValue);
    });
    if (localTracking || remoteTracking) {
      // Unit/baseline changes are a single decision. Local wins conflicting edits.
      const source = localTracking && remoteTracking ? schedule : localTracking ? ours : theirs;
      for (const key of ["unit", "stock", "stockTrackedFrom"]) {
        if (Object.hasOwn(source, key)) fields[key] = source[key];
        else delete fields[key];
      }
      return fields;
    }
    if (!Number.isSafeInteger(before.stock)) return fields;
    const key = JSON.stringify([before.id, before.unit]);
    const [prior, localDebit, remoteDebit, mergedDebit] = totals.map(rows => rows.get(key) ?? 0n);
    const stock = BigInt(ours.stock) + BigInt(theirs.stock) - BigInt(before.stock) + localDebit + remoteDebit - prior - mergedDebit;
    if (!Number.isSafeInteger(Number(stock))) {
      return { ...fields, stock: resolve([...path, "stock"], before.stock, ours.stock, theirs.stock, true) };
    }
    return { ...fields, stock: Number(stock) };
  });
}

export function mergeCare(base, local, remote, choose = () => undefined) {
  function resolve(path, before, ours, theirs, force = false) {
    if (!force && !diverged(before, ours, theirs)) return preferRecord(before, ours, theirs);
    const conflict = new CareConflict(path, ours, theirs);
    const side = choose(conflict);
    if (side === "device") return ours;
    if (side === "cloud") return theirs;
    throw conflict;
  }
  const merge = (path, base, local, remote) =>
    mergeMap(base, local, remote, (before, ours, theirs, key) => resolve([...path, key], before, ours, theirs));
  base ??= {};
  remote ??= {};
  const merged = Object.fromEntries(records.map(key => [key, merge([key], base[key], local[key], remote[key])]));
  merged.doses = mergeMap(base.doses, local.doses, remote.doses, (before, ours, theirs, id) => {
    const row = resolve(["doses", id], before, ours, theirs);
    const takeRemote = row === theirs;
    if (!row || row.unit !== undefined) return row;
    const source = takeRemote ? remote : local;
    const other = takeRemote ? local : remote;
    const unit = source.medicines?.[row.medicineId]?.unit;
    const otherMedicine = other.medicines?.[row.medicineId];
    return unit && otherMedicine && unit !== otherMedicine.unit ? { ...row, unit } : row;
  });
  merged.medicines = mergeMedicines(base, local, remote, merged, resolve);
  merged.water = Object.values(merge(["water"], byWaterId(base.water), byWaterId(local.water), byWaterId(remote.water)));
  merged.settings = merge(["settings"], base.settings, local.settings, remote.settings);
  merged.routineLogs = mergeMap(base.routineLogs, local.routineLogs, remote.routineLogs, (before, ours, theirs, id) => {
    const day = merge(["routineLogs", id], before, ours, theirs);
    return Object.keys(day).length ? day : undefined;
  });
  merged.scheduleHistory = Object.fromEntries(["medicines", "routines"].map(key => [key, Object.values(merge(["scheduleHistory", key],
    byVersion(base.scheduleHistory?.[key]), byVersion(local.scheduleHistory?.[key]), byVersion(remote.scheduleHistory?.[key])
  ))]));
  return merged;
}

export function mergeRestoredCare(restored, cloud) {
  // Every existing cloud record wins a collision. A file's omissions carry
  // no deletion intent because the file has no common synchronization base.
  if (!cloud) return mergeCare(null, restored, null);
  const missing = { ...restored };
  for (const field of ["medicines", "doses"]) {
    missing[field] = Object.fromEntries(Object.entries(restored[field] ?? {})
      .filter(([id]) => !Object.hasOwn(cloud[field] ?? {}, id)));
  }
  return mergeCare(null, cloud, missing, () => "device");
}

export function applyPortable(state, data) {
  for (const key of [...records, "medicines", "doses", "water", "routineLogs", "scheduleHistory"]) state[key] = data[key];
  for (const key of webBackupSettings) {
    if (Object.hasOwn(data.settings, key)) state[key] = data.settings[key];
    else delete state[key];
  }
}
