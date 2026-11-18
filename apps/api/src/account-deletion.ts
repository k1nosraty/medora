import type { Pool, PoolClient } from "pg";
import type { ObjectStorage } from "./objects";
import { backupObjectKey } from "./backups";

export async function eraseAccount(
  c: PoolClient,
  owner: string,
  email: string,
) {
  await c.query("INSERT INTO medora.account_deletions(owner) VALUES($1)", [
    owner,
  ]);
  await c.query(
    `INSERT INTO medora.backup_cleanup(owner,digest)
    SELECT owner,digest FROM medora.backups WHERE owner=$1`,
    [owner],
  );

  const condition =
    "family IN (SELECT id FROM medora.families WHERE creator=$1)";
  const grants = await c.query(
    "DELETE FROM medora.water_grants WHERE owner=$1 OR viewer=$1 OR " +
      condition,
    [owner],
  );
  const invites = await c.query(
    "DELETE FROM medora.family_invites WHERE email=$2 OR " + condition,
    [owner, email],
  );
  const members = await c.query(
    "DELETE FROM medora.family_members WHERE person=$1 OR " + condition,
    [owner],
  );
  const groups = await c.query("DELETE FROM medora.families WHERE creator=$1", [
    owner,
  ]);

  const devices = await c.query(
    `UPDATE medora.reminder_devices
    SET values=jsonb_set(values,'{state}',(values->'state') || '{"plan":null,"next":null,"link":null,"accountPlanError":null,"rejectedAccountRevision":null,"suspendedKinds":[]}'::jsonb),wake=NULL
    WHERE split_part(values->'state'->'link'->>'owner','.',1)=$1`,
    [owner],
  );
  const receipts = await c.query(
    "DELETE FROM medora.family_operations WHERE owner=$1",
    [owner],
  );
  await c.query("DELETE FROM medora.challenges WHERE email=$1", [email]);
  await c.query("DELETE FROM medora.operations_tickets WHERE email=$1", [
    email,
  ]);
  for (const table of [
    "sessions",
    "legacy_session_access",
    "changes",
    "records",
    "care_log",
    "care_state",
    "backups",
    "password_resets",
    "account_registrations",
  ]) {
    await c.query("DELETE FROM medora." + table + " WHERE owner=$1", [owner]);
  }
  // Keep the foreign-key target and opaque owner identifier for retained audits.
  // The old email, login name and credential stop existing in the live account table.
  await c.query(
    `UPDATE medora.accounts SET username='deleted:'||id,email='deleted:'||id,
    password_salt='',password_proof='',password_key='',created_at=NULL,sync_generation=1,cursor=0 WHERE id=$1`,
    [owner],
  );
  return {
    familyRows: [grants, invites, members, groups].reduce(
      (total, result) => total + (result.rowCount ?? 0),
      0,
    ),
    devices: devices.rowCount ?? 0,
    operationKeys: receipts.rowCount ?? 0,
  };
}

export async function removeBackupObjects(
  pool: Pool,
  storage: ObjectStorage | undefined,
  owner?: string,
) {
  if (!storage) return;
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT medora.lock_writer()");
    const { rows } = await c.query<{ owner: string; digest: string }>(
      `SELECT owner,digest FROM medora.backup_cleanup
      WHERE ($1::text IS NULL OR owner=$1) ORDER BY owner,digest LIMIT 8 FOR UPDATE SKIP LOCKED`,
      [owner ?? null],
    );
    for (const item of rows) {
      const key = backupObjectKey(item.owner, item.digest);
      await storage.delete(key);
      if (await storage.get(key)) throw Error("Backup object still exists");
      await c.query(
        "DELETE FROM medora.backup_cleanup WHERE owner=$1 AND digest=$2",
        [item.owner, item.digest],
      );
    }
    await c.query("COMMIT");
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
}
