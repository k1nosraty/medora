import { equalCareValues } from "./care-contract.js";

// Map keys and opaque encrypted envelopes stay intact. Patches apply to the
// exact owner/revision named by the surrounding request.
const maps = new Set([
  "medicines",
  "doses",
  "visits",
  "routines",
  "routineLogs",
  "cycleDays",
  "cycleRecords",
  "sleepRecords",
  "settings",
  "scheduleHistory",
]);
const fields = new Set([
  ...maps,
  "water",
  "careSchemaVersion",
  "privacyVersion",
  "privacyKey",
  "privacyRotation",
]);
const safe = (key) =>
  typeof key === "string" &&
  key.length > 0 &&
  key.length <= 550 &&
  key !== "prototype" &&
  !Object.hasOwn(Object.prototype, key);
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const waterMap = (rows) => {
  if (!Array.isArray(rows)) throw Error("invalid_delta");
  const items = new Map();
  for (const row of rows) {
    if (!object(row) || !safe(row.id) || items.has(row.id))
      throw Error("invalid_delta");
    items.set(row.id, row);
  }
  return items;
};

// A client can intentionally delete a supported field. An older schema cannot
// express intent for an unrecognized extension.
export function preserveCareExtensions(current, next) {
  const extensions = Object.entries(current ?? {}).filter(
    ([name]) => !fields.has(name),
  );
  return extensions.length
    ? { ...Object.fromEntries(extensions), ...next }
    : next;
}

export function careDelta(before, after) {
  if (!object(before) || !object(after)) return null;
  const changedFields = [
    ...new Set([...Object.keys(before), ...Object.keys(after)]),
  ].filter((field) => !equalCareValues(before[field], after[field]));
  if (changedFields.some((field) => !fields.has(field))) return null;
  const changes = [];
  for (const field of changedFields) {
    const a = before[field],
      b = after[field];
    if (field === "water") {
      let old, next;
      try {
        old = waterMap(a);
        next = waterMap(b);
      } catch {
        return null;
      } // Historical archives can predate unique water IDs.
      for (const id of old.keys()) if (!next.has(id)) changes.push([field, id]);
      for (const [id, row] of next)
        if (!equalCareValues(old.get(id), row)) changes.push([field, id, row]);
      const natural = [...old.keys()]
        .filter((id) => next.has(id))
        .concat([...next.keys()].filter((id) => !old.has(id)));
      if (!equalCareValues(natural, [...next.keys()]))
        changes.push(["waterOrder", null, [...next.keys()]]);
    } else if (maps.has(field) && object(a) && object(b)) {
      for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (!safe(id)) return null;
        if (!equalCareValues(a[id], b[id]))
          changes.push(Object.hasOwn(b, id) ? [field, id, b[id]] : [field, id]);
      }
    } else
      changes.push(
        Object.hasOwn(after, field) ? [field, null, b] : [field, null],
      );
    if (changes.length > 4096) {
      // A bulk import may replace many rows while still fitting the legacy wire limit.
      return changedFields.map((name) =>
        Object.hasOwn(after, name) ? [name, null, after[name]] : [name, null],
      );
    }
  }
  return changes;
}

export function applyCareDelta(base, changes) {
  if (!object(base) || !Array.isArray(changes) || changes.length > 4096)
    throw Error("invalid_delta");
  const result = { ...base },
    touched = new Set();
  let water, order;
  for (const change of changes) {
    if (!Array.isArray(change) || ![2, 3].includes(change.length))
      throw Error("invalid_delta");
    const [field, id, value] = change,
      set = change.length === 3;
    if (field === "waterOrder") {
      if (order || id !== null || !Array.isArray(value))
        throw Error("invalid_delta");
      order = value;
      continue;
    }
    if (!fields.has(field) || (id !== null && !safe(id)))
      throw Error("invalid_delta");
    if (field === "water") {
      if (id === null) {
        if (!set) throw Error("invalid_delta");
        water = waterMap(value);
        continue;
      }
      if (set && (!object(value) || value.id !== id))
        throw Error("invalid_delta");
      water ??= waterMap(base.water);
      if (set) water.set(id, value);
      else if (!water.delete(id)) throw Error("invalid_delta");
    } else if (id === null) {
      if (set) result[field] = value;
      else delete result[field];
    } else {
      if (!maps.has(field) || !object(result[field]))
        throw Error("invalid_delta");
      if (!touched.has(field)) {
        result[field] = { ...result[field] };
        touched.add(field);
      }
      if (set) result[field][id] = value;
      else delete result[field][id];
    }
  }
  if (order) {
    water ??= waterMap(base.water);
    if (
      order.length !== water.size ||
      new Set(order).size !== water.size ||
      !order.every((id) => water.has(id))
    )
      throw Error("invalid_delta");
    result.water = order.map((id) => water.get(id));
  } else if (water) result.water = [...water.values()];
  return result;
}
