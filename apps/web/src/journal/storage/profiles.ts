import { DeviceArchive } from "./archive";
import { project } from "./project";
import { Journal } from "./journal";
import type { SourceRow } from "./legacy";
import { fingerprint } from "./legacy";
export async function importProfile(
  archive: DeviceArchive,
  db: Journal,
  id: string,
) {
  const manifest = await archive.images.get(id);
  if (!manifest?.checked) throw Error("unchecked_archive");
  const { id: stored, checked, ...contents } = manifest;
  if (!checked || stored !== id || (await fingerprint(contents)) !== id)
    throw Error("manifest_mismatch");
  const rows = await archive.rows.where("image").equals(id).sortBy("ordinal");
  if (rows.length !== manifest.digests.length) throw Error("missing_records");
  const source: SourceRow[] = [];
  for (const [index, r] of rows.entries()) {
    const row = { store: r.store, key: r.key, value: r.value };
    if ((await fingerprint(row)) !== manifest.digests[index])
      throw Error("archive_changed");
    source.push(row);
  }
  let settings: Record<string, unknown>;
  if (manifest.schema.length===2 && manifest.schema[0]==="file" && manifest.schema[1]==="restored" && source.some(row=>row.store==="file" && row.key==="encrypted")) {
    settings = Object.fromEntries(
      source
        .filter((row) => row.store === "restored")
        .map((row) => [String(row.key), row.value]),
    );
  } else {
    const result = project({
      version: manifest.version,
      rows: source,
      schema: manifest.schema,
      preferences: manifest.preferences,
    });
    settings = { ...result.settings, water: result.water };
    if (manifest.version >= 2) {
      const doses: Record<string, unknown> = Object.create(null);
      for (const bucket of result.days.values())
        for (const [key, dose] of Object.entries(bucket.doses ?? {})) {
          if (Object.hasOwn(doses, key)) throw Error("duplicate_dose");
          doses[key] = dose;
        }
      settings.doses = doses;
      settings.routineLogs = Object.fromEntries(
        [...result.days].map(([day, bucket]) => [day, bucket.routines ?? {}]),
      );
    }
  }
  const owner = "restore:" + id;
  const water: Record<string, unknown>[] = Array.isArray(settings.water)
    ? settings.water
    : [];
  const records = water.map((row) => {
    if (
      typeof row.id !== "string" ||
      typeof row.day !== "number" ||
      typeof row.amount !== "number" ||
      typeof row.time !== "string"
    )
      throw Error("invalid_water");
    return {
      owner,
      id: row.id,
      day: row.day,
      original: row,
      revision: 1,
      body: { amount: row.amount, day: row.day, time: row.time },
    };
  });
  await db.transaction("rw", db.profiles, db.water, async () => {
    if (await db.profiles.get(owner)) return;
    await db.water.bulkAdd(records);
    await db.profiles.add({ owner, source: id, settings, revision: 1 });
  });
  return owner;
}
