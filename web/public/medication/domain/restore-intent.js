/**
 * @typedef {"device" | "merge" | "replace"} RestoreMode
 * @typedef {{owner: string, revision: number}} CloudRevision
 * @typedef {{mode: "device"} | ({mode: "merge" | "replace"} & CloudRevision)} RestoreTarget
 */

/** @param {unknown} mode @returns {mode is RestoreMode} */
export function isRestoreMode(mode) {
  return mode === "device" || mode === "merge" || mode === "replace";
}

/** @param {unknown} value @returns {value is CloudRevision} */
export function isCloudRevision(value) {
  if (!value || typeof value !== "object" || !("owner" in value) || !("revision" in value)) return false;
  return typeof value.owner === "string" && /^[a-f0-9]{64}(?:\.[a-f0-9]{32})?$/.test(value.owner) &&
    typeof value.revision === "number" && Number.isSafeInteger(value.revision) && value.revision >= 0;
}

/** @param {unknown} mode @param {unknown} cloud @returns {RestoreTarget} */
export function restoreTarget(mode, cloud) {
  if (mode === "device") return { mode };
  if (!isRestoreMode(mode) || !isCloudRevision(cloud)) throw new Error("invalid_restore_target");
  return { mode, owner: cloud.owner, revision: cloud.revision };
}

/**
 * @param {RestoreTarget} target
 * @param {CloudRevision} cloud
 * @param {boolean} alreadyApplied
 */
export function assertRestoreRevision(target, cloud, alreadyApplied) {
  if (target.mode === "device") return;
  if (target.owner !== cloud.owner ||
      (target.mode === "replace" && target.revision !== cloud.revision && !alreadyApplied)) {
    throw new Error("restore_conflict");
  }
}
