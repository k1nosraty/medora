// These fields have no role in care scheduling or family authorization.
export const privateFields = {
  medicines: ["instructions"],
  doses: ["instructions"],
  routines: ["notes"],
  visits: ["note", "notes", "contact"],
  cycleRecords: ["note"]
};

// Operate on cloned records in the browser. The same paths validate stored
// snapshots and redact projections, including captured plans and routine logs.
export function* privateRows(records) {
  for (const kind of Object.keys(privateFields)) {
    const rows = records?.[kind];
    for (const id of Object.keys(rows ?? {})) yield { kind, path: [kind, id], rows, key: id };
  }
  for (const [day, rows] of Object.entries(records?.routineLogs ?? {})) {
    for (const id of Object.keys(rows ?? {})) yield { kind: "routines", path: ["routineLogs", day, id], rows, key: id };
  }
  for (const kind of ["medicines", "routines"]) {
    for (const entry of records?.scheduleHistory?.[kind] ?? []) {
      if (entry?.plan) yield { kind, path: ["scheduleHistory", kind, entry.plan.id, entry.until], rows: entry, key: "plan" };
    }
  }
}

export function hasPrivateText(records) {
  for (const { kind, rows, key } of privateRows(records)) {
    if (privateFields[kind].some(field => Boolean(rows[key]?.[field]))) return true;
  }
  return false;
}

export function withoutPrivateFields(kind, row) {
  const copy = { ...row };
  for (const field of privateFields[kind]) delete copy[field];
  delete copy.privateText;
  return copy;
}

export const isRecoveryKeyId = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

export function validPrivateText(value) {
  return value && typeof value === "object" && Object.keys(value).length === 2 &&
    typeof value.iv === "string" && /^[a-f0-9]{24}$/.test(value.iv) &&
    typeof value.data === "string" && value.data.length >= 24 &&
    value.data.length <= 4 * 1024 * 1024 && value.data.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(value.data);
}
