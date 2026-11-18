import { isDeepStrictEqual } from "node:util";
import { reminderImages } from "./reminder-images.mjs";

export async function reminderReplay(client, manifest, key) {
  const { namespace, devices } = await reminderImages(client, manifest, key);
  const state = ({ id, values, wake }) => ({
    id,
    values,
    wake: wake === null ? null : Number(wake),
  });
  const latest = new Map([...devices].map(([id, entry]) => [id, state(entry)]));
  const edits = new Set();
  const { rows: history } = await client.query(
    "SELECT * FROM medora.reminder_history ORDER BY sequence",
  );
  for (const { device, previous, following } of history) {
    if (
      !isDeepStrictEqual(
        latest.get(device) ?? null,
        previous && state(previous),
      ) ||
      (following && following.id !== device) ||
      !following
    )
      throw Error("Divergent reminder history");
    latest.set(device, state(following));
    edits.add(device);
  }
  const { rows } = await client.query("SELECT * FROM medora.reminder_devices");
  if (
    rows.length !== latest.size ||
    rows.some((row) => !isDeepStrictEqual(state(row), latest.get(row.id)))
  )
    throw Error("Frozen reminder census mismatch");
  return {
    namespace,
    edited: [...edits].map((id) => ({
      before: devices.get(id),
      after: latest.get(id),
    })),
  };
}
