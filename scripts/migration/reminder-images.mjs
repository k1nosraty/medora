import { DatabaseSync } from "node:sqlite";
import { deserialize } from "node:v8";
import { unseal } from "./object-archive.mjs";

export async function reminderImages(client, manifest, key) {
  const namespaces = Object.keys(manifest.inventory).filter((ns) =>
    ns.endsWith("-MedicationReminders"),
  );
  if (namespaces.length !== 1) throw Error("Ambiguous reminder namespace");
  const namespace = namespaces[0],
    alarms = new Map(),
    devices = new Map();
  for (const entry of manifest.entries.filter(
    (e) => e.namespace === namespace,
  )) {
    const {
      rows: [row],
    } = await client.query(
      "SELECT archive FROM medora.source_objects WHERE snapshot=$1 AND namespace=$2 AND object_id=$3",
      [manifest.snapshot, namespace, entry.object],
    );
    const bytes = unseal(key, manifest.snapshot, entry, row.archive);
    const image = new DatabaseSync(":memory:");
    try {
      image.deserialize(bytes);
      const has = (table) =>
        image.prepare("SELECT 1 FROM sqlite_schema WHERE name=?").get(table);
      if (entry.object === "metadata.sqlite") {
        if (has("_cf_ALARM"))
          for (const alarm of image
            .prepare("SELECT actor_id,scheduled_time FROM _cf_ALARM")
            .all())
            alarms.set(alarm.actor_id, alarm.scheduled_time);
        continue;
      }
      const id = manifest.identities[namespace][entry.object];
      if (!/^[a-f0-9]{32}$/.test(id ?? "") || devices.has(id))
        throw Error("Unresolved reminder device");
      const values = {};
      if (has("_cf_KV"))
        for (const item of image
          .prepare(
            "SELECT key,value FROM _cf_KV WHERE key IN ('state','lastTest')",
          )
          .all())
          values[item.key] = deserialize(item.value);
      devices.set(id, {
        id,
        values,
        wake: null,
        object: entry.object.slice(0, -7),
      });
    } finally {
      image.close();
      bytes.fill(0);
    }
  }
  for (const device of devices.values()) {
    device.wake = alarms.get(device.object) ?? null;
    alarms.delete(device.object);
    if (device.wake !== null && !Number.isSafeInteger(device.wake))
      throw Error("Unmapped reminder wake time");
  }
  if (alarms.size) throw Error("Unidentified reminder alarm");
  return { namespace, devices };
}
