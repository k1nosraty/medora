import Dexie, { type Table } from "dexie";
import {
  captureLegacy,
  fingerprint,
  type Image,
  type SourceRow,
} from "./legacy";

interface Manifest {
  id: string;
  version: number;
  schema: unknown[];
  preferences: Record<string, string>;
  digests: string[];
  checked: boolean;
}
interface ArchivedRow extends SourceRow {
  image: string;
  ordinal: number;
}
export class DeviceArchive extends Dexie {
  images!: Table<Manifest, string>;
  rows!: Table<ArchivedRow, [string, number]>;
  constructor(name = "medora-device-archive-v1") {
    super(name);
    this.version(1).stores({ images: "id", rows: "[image+ordinal],image" });
  }
}

export async function archiveImage(db: DeviceArchive, image: Image) {
  const digests: string[] = [];
  for (const row of image.rows) digests.push(await fingerprint(row));
  const metadata = {
    version: image.version,
    schema: image.schema,
    preferences: image.preferences,
    digests,
  };
  const id = await fingerprint(metadata);
  await db.transaction("rw", db.images, async () => {
    if (await db.images.get(id)) await db.images.update(id, { checked: false });
    else await db.images.add({ ...metadata, id, checked: false });
  });
  for (let i = 0; i < image.rows.length; i += 128) {
    const batch = image.rows
      .slice(i, i + 128)
      .map((r, n) => ({ ...r, image: id, ordinal: i + n }));
    await db.transaction("rw", db.rows, async () => {
      const existing = await db.rows.bulkGet(batch.map((r) => [id, r.ordinal]));
      await db.rows.bulkAdd(batch.filter((_, index) => !existing[index]));
    });
  }
  const manifest = await db.images.get(id);
  if (!manifest) throw new Error("missing_manifest");
  const { id: storedId, checked, ...contents } = manifest;
  if (
    storedId !== (await fingerprint(contents)) ||
    (await db.rows.where("image").equals(id).count()) !== digests.length
  )
    throw new Error("manifest_mismatch");
  for (let i = 0; i < digests.length; i += 128) {
    const stored = await db.rows.bulkGet(
      digests.slice(i, i + 128).map((_, j) => [id, i + j]),
    );
    for (const [j, row] of stored.entries()) {
      if (
        !row ||
        (await fingerprint({
          store: row.store,
          key: row.key,
          value: row.value,
        })) !== digests[i + j]
      )
        throw new Error("reconciliation_failed");
    }
  }
  if (!checked) await db.images.update(id, { checked: true });
  return { id, version: image.version, count: digests.length };
}
export async function archiveDevice() {
  const db = new DeviceArchive();
  try {
    return await archiveImage(db, await captureLegacy(localStorage));
  } finally {
    db.close();
  }
}
