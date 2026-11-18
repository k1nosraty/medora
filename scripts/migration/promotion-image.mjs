import { DatabaseSync } from "node:sqlite";
import { deserialize } from "node:v8";
import { isDeepStrictEqual } from "node:util";
import { unseal } from "./object-archive.mjs";

const mappedKey =
  /^(campaigns|promotion|preview|assets|(?:meta|count):[a-f0-9-]{36}|media:[a-f0-9-]{36}:\d+)$/;
function canonical(key, entry) {
  return entry instanceof Uint8Array
    ? { key, value: null, bytes: "\\x" + Buffer.from(entry).toString("hex") }
    : { key, value: entry, bytes: null };
}
async function promotionImage(client, manifest, key) {
  const matches = manifest.entries.filter(
    (e) =>
      e.namespace.endsWith("-Promotions") &&
      manifest.identities[e.namespace]?.[e.object] === "home",
  );
  if (matches.length !== 1) throw Error("Ambiguous campaign namespace");
  const [entry] = matches;
  const {
    rows: [row],
  } = await client.query(
    "SELECT archive FROM medora.source_objects WHERE snapshot=$1 AND namespace=$2 AND object_id=$3",
    [manifest.snapshot, entry.namespace, entry.object],
  );
  const bytes = unseal(key, manifest.snapshot, entry, row.archive);
  const image = new DatabaseSync(":memory:");
  try {
    image.deserialize(bytes);
    const values = image
      .prepare("SELECT key,value FROM _cf_KV ORDER BY key")
      .all()
      .filter((row) => mappedKey.test(row.key))
      .map((row) => canonical(row.key, deserialize(row.value)));
    return { entry, values };
  } finally {
    image.close();
    bytes.fill(0);
  }
}
export async function activatePromotions(client, manifest, key) {
  const { values } = await promotionImage(client, manifest, key);
  for (const row of values)
    await client.query("INSERT INTO medora.promotion_values VALUES($1,$2,$3)", [
      row.key,
      row.value === null ? null : JSON.stringify(row.value),
      row.bytes === null ? null : Buffer.from(row.bytes.slice(2), "hex"),
    ]);
}
export async function promotionReplay(client, manifest, key) {
  const { entry, values } = await promotionImage(client, manifest, key);
  const current = new Map(values.map((row) => [row.key, row]));
  const history = await client.query(
    "SELECT key,previous,following FROM medora.promotion_history ORDER BY sequence",
  );
  for (const event of history.rows) {
    if (
      !mappedKey.test(event.key) ||
      !isDeepStrictEqual(current.get(event.key) ?? null, event.previous) ||
      (event.following && event.following.key !== event.key)
    )
      throw Error("Divergent campaign history");
    if (event.following) current.set(event.key, event.following);
    else current.delete(event.key);
  }
  const { rows } = await client.query(
    "SELECT to_jsonb(p) AS item FROM medora.promotion_values p",
  );
  if (
    rows.length !== current.size ||
    rows.some(({ item }) => !isDeepStrictEqual(item, current.get(item.key)))
  )
    throw Error("Frozen campaign census mismatch");
  return { entry, events: history.rows };
}
