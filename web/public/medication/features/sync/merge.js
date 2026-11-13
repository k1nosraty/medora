import { webBackupSettings } from "../backups/web-format.js";

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
const records = ["medicines", "doses", "visits", "routines", "cycleRecords"];

export function mergeCare(base, local, remote) {
  base ??= {};
  remote ??= {};
  const merged = Object.fromEntries(records.map(key => [key, mergeMap(base[key], local[key], remote[key])]));
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
  for (const key of [...records, "water", "routineLogs", "scheduleHistory"]) state[key] = data[key];
  for (const key of webBackupSettings) {
    if (Object.hasOwn(data.settings, key)) state[key] = data.settings[key];
    else delete state[key];
  }
}
