import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { s3Storage } from "../../apps/api/src/objects.ts";

export function backupStorage(env) {
  const parts = [
    "S3_ENDPOINT",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ].map((key) => env[key]);
  return parts.every(Boolean)
    ? s3Storage(...parts, env.S3_REGION ?? "us-east-1")
    : undefined;
}
const directory = (doRoot) => join(doRoot, ".medora-journal-backups");
const objectKey = (row) => "backups/" + row.owner + "/" + row.digest;
const identity = (row) => row.owner + ":" + row.digest;
const hash = (bytes) =>
  createHash("sha256").update(new Uint8Array(bytes)).digest("hex");
const sign = (key, body) =>
  createHmac("sha256", key)
    .update("medora-backup-recovery-v1\0")
    .update(body)
    .digest("hex");
function valid(row) {
  if (
    !row ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(row.owner) ||
    !/^[0-9a-f]{64}$/.test(row.digest) ||
    !Number.isSafeInteger(row.bytes) ||
    row.bytes < 52 ||
    row.bytes > 16 * 1024 * 1024 ||
    !Number.isFinite(Date.parse(row.created_at)) ||
    typeof row.ready !== "boolean"
  )
    throw Error("Invalid backup projection");
  return row;
}
function verified(row, bytes) {
  if (!bytes || bytes.byteLength !== row.bytes || hash(bytes) !== row.digest)
    throw Error("Backup object digest mismatch");
}
export async function backupReplay(client) {
  const { rows: events } = await client.query(
    "SELECT previous,following FROM medora.backup_history ORDER BY sequence",
  );
  // The source application had no server backup catalog. Begin at the
  // authenticated empty target reserved by beginFixtureTransition.
  const current = new Map();
  for (const { previous, following } of events) {
    const id = identity(valid(previous ?? following));
    if (!isDeepStrictEqual(current.get(id) ?? null, previous))
      throw Error("Divergent backup journal");
    if (following) {
      if (identity(valid(following)) !== id)
        throw Error("Backup identity changed");
      current.set(id, following);
    } else current.delete(id);
  }
  const { rows } = await client.query(
    "SELECT to_jsonb(b) AS item FROM medora.backups b ORDER BY owner,digest",
  );
  if (
    rows.length !== current.size ||
    rows.some(
      ({ item }) => !isDeepStrictEqual(item, current.get(identity(item))),
    )
  )
    throw Error("Frozen backup inventory mismatch");
  if (rows.some(({ item }) => !item.ready))
    throw Error("Unresolved backup reservation");
  return rows.map(({ item }) => item);
}
export async function writeRecoveredBackups(
  doRoot,
  rows,
  storage,
  snapshot,
  key,
) {
  if (!rows.length) return;
  if (!storage)
    throw Error("A separate authorized backup object source is required");
  const root = directory(doRoot);
  await mkdir(root, { mode: 0o700 });
  for (const row of rows) {
    const bytes = await storage.get(objectKey(row));
    verified(row, bytes);
    await writeFile(
      join(root, row.owner + "_" + row.digest),
      new Uint8Array(bytes),
      { mode: 0o600, flag: "wx" },
    );
  }
  const body = JSON.stringify({ version: 1, snapshot, rows });
  await writeFile(
    join(root, "catalog.json"),
    JSON.stringify({ body, signature: sign(key, body) }),
    { mode: 0o600, flag: "wx" },
  );
}
export async function restoreBackupCatalog(client, storage, doRoot, key) {
  const root = directory(doRoot),
    envelope = JSON.parse(await readFile(join(root, "catalog.json"), "utf8"));
  if (
    !/^[0-9a-f]{64}$/.test(envelope.signature ?? "") ||
    !timingSafeEqual(
      Buffer.from(envelope.signature, "hex"),
      Buffer.from(sign(key, envelope.body), "hex"),
    )
  )
    throw Error("Backup recovery authentication failed");
  const catalog = JSON.parse(envelope.body);
  if (
    catalog.version !== 1 ||
    !/^[0-9a-f]{32}$/.test(catalog.snapshot) ||
    !Array.isArray(catalog.rows)
  )
    throw Error("Unsupported backup catalog");
  const rows = catalog.rows.map(valid);
  if (
    rows.some((row) => !row.ready) ||
    new Set(rows.map(identity)).size !== rows.length
  )
    throw Error("Invalid recovery catalog");
  await client.query("BEGIN");
  try {
    await client.query("SELECT medora.lock_writer()");
    const {
      rows: [phase],
    } = await client.query(
      "SELECT phase FROM medora.writer_transition WHERE singleton",
    );
    if (phase.phase !== "open")
      throw Error("A separate open catalog target is required");
    for (const row of rows) {
      const active = await client.query(
        "SELECT id FROM medora.accounts WHERE id=$1 AND sync_generation=2 FOR UPDATE",
        [row.owner],
      );
      if (!active.rowCount)
        throw Error("Backup owner missing from recovery target");
      const existing = await client.query(
        "SELECT to_jsonb(b) AS item FROM medora.backups b WHERE owner=$1 AND digest=$2",
        [row.owner, row.digest],
      );
      if (existing.rowCount && !isDeepStrictEqual(existing.rows[0].item, row))
        throw Error("Recovery catalog would replace a different backup");
    }
    for (const row of rows) {
      const bytes = await readFile(join(root, row.owner + "_" + row.digest));
      verified(row, bytes);
      await storage.put(objectKey(row), bytes);
      verified(row, await storage.get(objectKey(row)));
      await client.query(
        `INSERT INTO medora.backups(owner,digest,bytes,ready,created_at) VALUES($1,$2,$3,true,$4)
        ON CONFLICT(owner,digest) DO NOTHING`,
        [row.owner, row.digest, row.bytes, row.created_at],
      );
    }
    await client.query("COMMIT");
    return rows.length;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
