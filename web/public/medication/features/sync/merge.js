import { webBackupSettings } from "../../domain/care-records.js";

const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function mergeMap(base = {}, local = {}, remote = {}, mergeValue) {
  return Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])].flatMap(key => {
    const previous = Object.hasOwn(base, key) ? base[key] : undefined;
    const ours = Object.hasOwn(local, key) ? local[key] : undefined;
    const theirs = Object.hasOwn(remote, key) ? remote[key] : undefined;
    const value = mergeValue ? mergeValue(previous, ours, theirs) : equal(previous, ours) ? theirs : ours;
    return value === undefined ? [] : [[key, value]];
  }));
}

const byWaterId = (rows = []) => Object.fromEntries(rows.map(row => [row.id, row]));
const byVersion = (rows = []) => Object.fromEntries(rows.map(row => [JSON.stringify([row.plan.id, row.until]), row]));
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

function mergeMedicines(base, local, remote, merged) {
  const totals = [base, local, remote, { ...merged, medicines: local.medicines }].map(debits);
  return mergeMap(base.medicines, local.medicines, remote.medicines, (before, ours, theirs) => {
    // A deletion wins against a concurrent edit. A new medicine keeps its original record.
    if (!before) return ours ?? theirs;
    if (!ours || !theirs) return undefined;
    const scope = row => JSON.stringify([row.unit, row.stockTrackedFrom, Number.isSafeInteger(row.stock)]);
    const previous = scope(before);
    const localTracking = scope(ours) !== previous;
    const remoteTracking = scope(theirs) !== previous;
    const fields = mergeMap(before, ours, theirs);
    if (localTracking || remoteTracking) {
      // Unit/baseline changes are a single decision. Local wins conflicting edits.
      const source = localTracking ? ours : theirs;
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
    if (!Number.isSafeInteger(Number(stock))) throw new RangeError("stock_conflict");
    return { ...fields, stock: Number(stock) };
  });
}

export function mergeCare(base, local, remote) {
  base ??= {};
  remote ??= {};
  const merged = Object.fromEntries(records.map(key => [key, mergeMap(base[key], local[key], remote[key])]));
  merged.doses = mergeMap(base.doses, local.doses, remote.doses, (before, ours, theirs) => {
    const takeRemote = equal(before, ours);
    const row = takeRemote ? theirs : ours;
    if (!row || row.unit !== undefined) return row;
    const source = takeRemote ? remote : local;
    const other = takeRemote ? local : remote;
    const unit = source.medicines?.[row.medicineId]?.unit;
    const otherMedicine = other.medicines?.[row.medicineId];
    return unit && otherMedicine && unit !== otherMedicine.unit ? { ...row, unit } : row;
  });
  merged.medicines = mergeMedicines(base, local, remote, merged);
  merged.water = Object.values(mergeMap(byWaterId(base.water), byWaterId(local.water), byWaterId(remote.water)));
  merged.settings = mergeMap(base.settings, local.settings, remote.settings);
  merged.routineLogs = mergeMap(base.routineLogs, local.routineLogs, remote.routineLogs, (before, ours, theirs) => {
    const day = mergeMap(before, ours, theirs);
    return Object.keys(day).length ? day : undefined;
  });
  merged.scheduleHistory = Object.fromEntries(["medicines", "routines"].map(key => [key, Object.values(mergeMap(
    byVersion(base.scheduleHistory?.[key]), byVersion(local.scheduleHistory?.[key]), byVersion(remote.scheduleHistory?.[key])
  ))]));
  return merged;
}

export function applyPortable(state, data) {
  for (const key of [...records, "medicines", "doses", "water", "routineLogs", "scheduleHistory"]) state[key] = data[key];
  for (const key of webBackupSettings) {
    if (Object.hasOwn(data.settings, key)) state[key] = data.settings[key];
    else delete state[key];
  }
}
