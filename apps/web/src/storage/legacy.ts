export const legacyName = "medora-medication-prototype";
export interface SourceRow {
  store: string;
  key: IDBValidKey;
  value: unknown;
}
export interface Image {
  version: number;
  schema: unknown[];
  rows: SourceRow[];
  preferences: Record<string, string>;
}

export function captureLegacy(preferences: Storage): Promise<Image> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(legacyName);
    let missing = false;
    request.onupgradeneeded = () => {
      missing = true;
      request.transaction!.abort();
    };
    const prefs = () =>
      Object.fromEntries(
        Object.keys(preferences)
          .filter((k) => k.startsWith("medora-"))
          .sort()
          .map((k) => [k, preferences.getItem(k)!]),
      );
    request.onerror = () => {
      if (!missing) {
        reject(request.error);
        return;
      }
      try {
        resolve({ version: 0, schema: [], rows: [], preferences: prefs() });
      } catch (error) {
        reject(error);
      }
    };
    request.onblocked = () => reject(new Error("storage_blocked"));
    request.onsuccess = () => {
      const db = request.result;
      try {
        const stores = Array.from(db.objectStoreNames);
        if (
          !stores.includes("care") ||
          (db.version >= 2 && !stores.includes("days"))
        )
          throw new Error("unknown_schema");
        const tx = db.transaction(stores, "readonly");
        const rows = new Map<string, SourceRow[]>();
        const schema = stores.map((name) => {
          const store = tx.objectStore(name);
          const indexes = Array.from(store.indexNames, (index) => {
            const i = store.index(index);
            return {
              name: index,
              keyPath: i.keyPath,
              multiEntry: i.multiEntry,
              unique: i.unique,
            };
          });
          const records: SourceRow[] = [];
          rows.set(name, records);
          const cursor = store.openCursor();
          cursor.onsuccess = () => {
            if (!cursor.result) return;
            records.push({
              store: name,
              key: cursor.result.primaryKey,
              value: cursor.result.value,
            });
            cursor.result.continue();
          };
          return {
            name,
            keyPath: store.keyPath,
            autoIncrement: store.autoIncrement,
            indexes,
          };
        });
        tx.onabort = () => reject(tx.error ?? new Error("capture_interrupted"));
        tx.oncomplete = () => {
          try {
            resolve({
              version: db.version,
              schema,
              rows: [...rows.values()].flat(),
              preferences: prefs(),
            });
          } catch (error) {
            reject(error);
          }
        };
      } catch (error) {
        reject(error);
      } finally {
        db.close();
      }
    };
  });
}

// Tag every supported value so missing keys, dates, binary and strings cannot collide.
async function encoded(
  v: unknown,
  seen: Map<object, number>,
): Promise<unknown> {
  if (v === null) return ["null"];
  if (typeof v !== "object") {
    if (
      !["string", "boolean", "number", "undefined", "bigint"].includes(typeof v)
    )
      throw new Error("unsupported_value");
    return [typeof v, Object.is(v, -0) ? "-0" : String(v)];
  }
  if (seen.has(v)) return ["ref", seen.get(v)];
  seen.set(v, seen.size);
  if (v instanceof Map) {
    const items = [];
    for (const [key, value] of v)
      items.push([await encoded(key, seen), await encoded(value, seen)]);
    return ["map", items];
  }
  if (v instanceof Set) {
    const items = [];
    for (const value of v) items.push(await encoded(value, seen));
    return ["set", items];
  }
  if (v instanceof RegExp) return ["regexp", v.source, v.flags];
  if (typeof Blob !== "undefined" && v instanceof Blob) {
    const file = typeof File !== "undefined" && v instanceof File;
    return [
      file ? "file" : "blob",
      v.type,
      file ? v.name : null,
      file ? v.lastModified : null,
      await hash(new Uint8Array(await v.arrayBuffer())),
    ];
  }
  if (v instanceof Date) return ["date", v.getTime().toString()];
  if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
    const bytes =
      v instanceof ArrayBuffer
        ? new Uint8Array(v)
        : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    return [
      "binary",
      v.constructor.name,
      ArrayBuffer.isView(v) ? v.byteOffset : 0,
      await hash(bytes),
      ArrayBuffer.isView(v) ? await hash(new Uint8Array(v.buffer)) : null,
    ];
  }
  if (Array.isArray(v)) {
    const items = [];
    for (const k of Object.keys(v))
      items.push([
        k,
        await encoded((v as unknown as Record<string, unknown>)[k], seen),
      ]);
    return ["array", v.length, items];
  }
  if (
    Object.getPrototypeOf(v) !== Object.prototype &&
    Object.getPrototypeOf(v) !== null
  )
    throw new Error("unsupported_value");
  const items = [];
  for (const k of Object.keys(v).sort())
    items.push([k, await encoded((v as Record<string, unknown>)[k], seen)]);
  return ["object", items];
}
async function hash(bytes: Uint8Array) {
  const result = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return Array.from(new Uint8Array(result), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function fingerprint(value: unknown) {
  return hash(
    new TextEncoder().encode(JSON.stringify(await encoded(value, new Map()))),
  );
}
