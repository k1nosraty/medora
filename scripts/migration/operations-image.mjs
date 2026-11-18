import { DatabaseSync } from "node:sqlite";
import { deserialize } from "node:v8";
import { isDeepStrictEqual } from "node:util";
import { unseal } from "./object-archive.mjs";

const defaults = { flags: { promotions: 100, support: 100 }, notice: null };
const tables = {
  operations_tickets: {
    native: "tickets",
    keys: ["id"],
    fields: ["id", "email", "at", "message", "diagnostics", "reply", "status"],
  },
  operations_counters: {
    native: "counters",
    keys: ["day", "metric"],
    fields: ["day", "metric", "count"],
  },
  operations_audit: {
    native: "audit",
    keys: ["id"],
    fields: ["id", "at", "actor", "action"],
  },
};
export async function operationsImage(client, manifest, key) {
  const entries = manifest.entries.filter(
    (e) =>
      e.namespace.endsWith("-Operations") &&
      manifest.identities[e.namespace]?.[e.object] === "operations",
  );
  if (entries.length !== 1) throw Error("Ambiguous operations object");
  const [entry] = entries;
  const {
    rows: [row],
  } = await client.query(
    "SELECT archive FROM medora.source_objects WHERE snapshot=$1 AND namespace=$2 AND object_id=$3",
    [manifest.snapshot, entry.namespace, entry.object],
  );
  const bytes = unseal(key, manifest.snapshot, entry, row.archive),
    db = new DatabaseSync(":memory:");
  try {
    db.deserialize(bytes);
    const config = db
      .prepare("SELECT value FROM _cf_KV WHERE key='config'")
      .get();
    return {
      entry,
      config: config ? deserialize(config.value) : defaults,
      originalConfig: config ? deserialize(config.value) : null,
      tables: Object.fromEntries(
        Object.entries(tables).map(([name, table]) => [
          name,
          db
            .prepare(
              "SELECT " + table.fields.join(",") + " FROM " + table.native,
            )
            .all()
            .map((row) => ({ ...row })),
        ]),
      ),
    };
  } finally {
    db.close();
    bytes.fill(0);
  }
}

export async function activateOperations(client, manifest, key) {
  const original = await operationsImage(client, manifest, key);
  await client.query(
    "UPDATE medora.operations_config SET config=$1 WHERE singleton",
    [JSON.stringify(original.config)],
  );
  for (const [name, rows] of Object.entries(original.tables)) {
    const { fields } = tables[name];
    for (const row of rows)
      await client.query(
        "INSERT INTO medora." +
          name +
          "(" +
          fields.join(",") +
          ") VALUES(" +
          fields.map((_, i) => "$" + (i + 1)).join(",") +
          ")",
        fields.map((field) => row[field]),
      );
  }
  await client.query(`SELECT setval(pg_get_serial_sequence('medora.operations_audit','id'),
    coalesce((SELECT max(id) FROM medora.operations_audit),1),EXISTS(SELECT 1 FROM medora.operations_audit))`);
}

export async function operationsReplay(client, manifest, key) {
  const original = await operationsImage(client, manifest, key);
  const id = (table, row) =>
    JSON.stringify(tables[table].keys.map((key) => row[key]));
  const canonical = (table, row) =>
    Object.fromEntries(
      tables[table].fields.map((field) => {
        const value = row[field];
        const numeric =
          field === "at" ||
          field === "day" ||
          field === "count" ||
          (field === "id" && table === "operations_audit");
        if (numeric && !Number.isSafeInteger(Number(value)))
          throw Error("Unmapped operational integer");
        return [field, numeric ? Number(value) : value];
      }),
    );
  const current = Object.fromEntries(
    Object.entries(original.tables).map(([table, rows]) => [
      table,
      new Map(rows.map((row) => [id(table, row), row])),
    ]),
  );
  let config = original.config;
  const events = [];
  const { rows: history } = await client.query(
    "SELECT relation_name,previous,following FROM medora.operations_history ORDER BY sequence",
  );
  for (const { relation_name: table, previous, following } of history) {
    if (table === "operations_config") {
      if (!isDeepStrictEqual(previous?.config, config) || !following?.config)
        throw Error("Divergent rollout history");
      config = following.config;
      continue;
    }
    if (!tables[table]) throw Error("Unsupported operations table");
    const before = previous && canonical(table, previous),
      after = following && canonical(table, following);
    const identifier = id(table, before ?? after);
    if (
      (after && id(table, after) !== identifier) ||
      !isDeepStrictEqual(current[table].get(identifier) ?? null, before)
    )
      throw Error("Divergent operations history");
    if (after) current[table].set(identifier, after);
    else current[table].delete(identifier);
    events.push({ table: tables[table], before, after });
  }
  const frozen = await client.query(
    "SELECT config FROM medora.operations_config WHERE singleton",
  );
  if (!isDeepStrictEqual(frozen.rows[0]?.config, config))
    throw Error("Frozen rollout diverged");
  for (const [table, expected] of Object.entries(current)) {
    const { rows } = await client.query("SELECT * FROM medora." + table);
    if (
      rows.length !== expected.size ||
      rows.some((row) => {
        const actual = canonical(table, row);
        return !isDeepStrictEqual(actual, expected.get(id(table, actual)));
      })
    )
      throw Error("Frozen operations census mismatch");
  }
  return {
    entry: original.entry,
    events,
    previousConfig: original.originalConfig,
    nextConfig: config,
    changedConfig: !isDeepStrictEqual(config, original.config),
  };
}
