/** @typedef {Record<string, unknown>} SnapshotRow */
/** @typedef {Record<string, SnapshotRow>} SnapshotRows */
/** @typedef {keyof typeof privateFields} PrivateKind */
/** @typedef {{iv: string, data: string}} PrivateTextEnvelope */
/**
 * @typedef {Partial<Record<PrivateKind, SnapshotRows>> & {
 *   privacyVersion?: number,
 *   privacyKey?: string,
 *   privacyRotation?: string,
 *   routineLogs?: Record<string, SnapshotRows>,
 *   scheduleHistory?: Partial<Record<"medicines" | "routines", {plan: SnapshotRow, until: number}[]>>
 * }} PrivateCareSnapshot
 */

// These fields have no role in care scheduling or family authorization.
export const privateFields = {
  medicines: ["instructions"],
  doses: ["instructions"],
  routines: ["notes"],
  visits: ["note", "notes", "contact"],
  cycleRecords: ["note"],
  cycleDays: ["note", "tags"],
  sleepRecords: ["note"]
};

// Operate on cloned records in the browser. The same paths validate stored
// snapshots and redact projections, including captured plans and routine logs.
/**
 * @param {PrivateCareSnapshot | null | undefined} records
 * @returns {Generator<{kind: PrivateKind, path: unknown[], rows: SnapshotRows, key: string}, void, unknown>}
 */
export function* privateRows(records) {
  for (const kind of /** @type {PrivateKind[]} */ (Object.keys(privateFields))) {
    const rows = records?.[kind] ?? {};
    for (const id of Object.keys(rows ?? {})) yield { kind, path: [kind, id], rows, key: id };
  }
  for (const [day, rows] of Object.entries(records?.routineLogs ?? {})) {
    for (const id of Object.keys(rows ?? {})) yield { kind: "routines", path: ["routineLogs", day, id], rows, key: id };
  }
  for (const kind of /** @type {const} */ (["medicines", "routines"])) {
    for (const entry of records?.scheduleHistory?.[kind] ?? []) {
      if (entry?.plan) yield { kind, path: ["scheduleHistory", kind, entry.plan.id, entry.until], rows: /** @type {SnapshotRows} */ (/** @type {unknown} */ (entry)), key: "plan" };
    }
  }
}

/** @param {PrivateCareSnapshot | null | undefined} records */
export function hasPrivateText(records) {
  for (const { kind, rows, key } of privateRows(records)) {
    if (privateFields[kind].some(field => Boolean(rows[key]?.[field]))) return true;
  }
  return false;
}

/** @param {PrivateKind} kind @param {SnapshotRow} row */
export function withoutPrivateFields(kind, row) {
  const copy = { ...row };
  for (const field of privateFields[kind]) delete copy[field];
  delete copy.privateText;
  return copy;
}

/** @param {unknown} value @returns {value is string} */
export const isRecoveryKeyId = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

/** @param {unknown} value @returns {value is PrivateTextEnvelope} */
export function validPrivateText(value) {
  if (!value || typeof value !== "object" || !("iv" in value) || !("data" in value)) return false;
  return Object.keys(value).length === 2 &&
    typeof value.iv === "string" && /^[a-f0-9]{24}$/.test(value.iv) &&
    typeof value.data === "string" && value.data.length >= 24 &&
    value.data.length <= 4 * 1024 * 1024 && value.data.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(value.data);
}

// Rotation may replace encrypted bytes only. Keep the fact that a row had an
// envelope in the comparison to prevent removal of private fields by rotation.
/** @param {PrivateCareSnapshot & {privacyKey?: string, privacyRotation?: string}} records */
export function rotationContents(records) {
  const copy = structuredClone(records);
  delete copy.privacyKey;
  delete copy.privacyRotation;
  for (const { rows, key } of privateRows(copy)) {
    if (rows[key].privateText !== undefined) rows[key].privateText = true;
  }
  return copy;
}
