import { activateHouseholds } from "./activate-households.mjs";
import { projectArchive } from "./project.mjs";
import { DatabaseSync } from "node:sqlite";
import { deserialize } from "node:v8";
import { readManifest, unseal } from "./object-archive.mjs";
import { waterEntry } from "../../packages/contracts/src/index.ts";

export async function beginFixtureTransition(client, archive, key) {
  const { hostname, port, pathname } = new URL(
    process.env.MEDORA_TEST_DATABASE_URL,
  );
  const {
    rows: [database],
  } = await client.query(
    "SELECT current_database() AS name, inet_server_addr() IS NOT NULL AS tcp",
  );
  if (
    !["localhost", "127.0.0.1"].includes(hostname) ||
    client.host !== hostname ||
    Number(client.port) !== Number(port || 5432) ||
    !database.tcp ||
    database.name !== decodeURIComponent(pathname.slice(1))
  )
    throw Error("Isolated fixture database required");
  const manifest = await readManifest(archive, key);
  const { snapshot } = manifest;
  await projectArchive(client, archive, key, true);
  await client.query("BEGIN");
  try {
    const {
      rows: [gate],
    } = await client.query(
      "SELECT * FROM medora.writer_transition WHERE singleton FOR UPDATE",
    );
    if (gate.phase !== "open") throw Error("Transition already started");
    const {
      rows: [counts],
    } = await client.query(
      `
      SELECT (SELECT count(*) FROM medora.accounts) AS accounts,
        (SELECT count(*) FROM medora.legacy_people WHERE snapshot=$1) AS people,
        (SELECT count(*) FROM medora.accounts a JOIN medora.legacy_people p ON a.id=p.owner
          WHERE p.snapshot=$1 AND a.sync_generation=1 AND a.cursor=0) AS eligible`,
      [snapshot],
    );
    if (
      counts.accounts === "0" ||
      counts.accounts !== counts.eligible ||
      counts.people !== counts.eligible
    )
      throw Error(
        "Target contains unrelated accounts or unsupported identity mappings",
      );
    for (const table of [
      "changes",
      "records",
      "families",
      "challenges",
      "sessions",
      "backups",
      "login_attempts",
      "cutover_accounts",
      "rollback_exceptions",
    ]) {
      if (
        (await client.query("SELECT 1 FROM medora." + table + " LIMIT 1"))
          .rowCount
      )
        throw Error("A fresh projection is required");
    }
    const { rows: water } = await client.query(
      "SELECT value FROM medora.legacy_care WHERE snapshot=$1 AND kind='water'",
      [snapshot],
    );
    for (const {
      value: { amount, day, time },
    } of water)
      waterEntry.parse({ amount, day, time });
    // Seed the real change feed so existing devices using cursor zero receive historical rows.
    await client.query(
      `INSERT INTO medora.records(owner,kind,id,revision,body)
      SELECT owner,kind,id,row_number() OVER (PARTITION BY owner ORDER BY id COLLATE "C"),
        jsonb_build_object('amount',value->'amount','day',value->'day','time',value->'time')
      FROM medora.legacy_care WHERE snapshot=$1 AND kind='water'`,
      [snapshot],
    );
    await client.query(`INSERT INTO medora.changes(owner,kind,record_id,cursor,body,operation,base_revision)
      SELECT owner,kind,id,revision,body,gen_random_uuid(),0 FROM medora.records`);
    await activateHouseholds(client, snapshot);
    for (const entry of manifest.entries.filter(
      (e) =>
        (e.namespace.endsWith("-EmailAccount") ||
          e.namespace.endsWith("-Families")) &&
        e.object !== "metadata.sqlite",
    )) {
      const owner = manifest.identities[entry.namespace][entry.object];
      const {
        rows: [stored],
      } = await client.query(
        "SELECT archive FROM medora.source_objects WHERE snapshot=$1 AND namespace=$2 AND object_id=$3",
        [snapshot, entry.namespace, entry.object],
      );
      const bytes = unseal(key, snapshot, entry, stored.archive),
        image = new DatabaseSync(":memory:");
      try {
        image.deserialize(bytes);
        if (entry.namespace.endsWith("-Families")) {
          if (owner === "care-groups") {
            for (const row of image
              .prepare("SELECT * FROM family_invites")
              .all()) {
              await client.query(
                `INSERT INTO medora.family_invites(id,family,email,created_at,expires_at,status,recipient_label)
                VALUES($1,$2,$3,to_timestamp($4::double precision/1000),to_timestamp($5::double precision/1000),$6,$7)`,
                [
                  row.id,
                  row.group_id,
                  row.email,
                  row.created,
                  row.expires,
                  row.status,
                  row.recipient_label ?? null,
                ],
              );
            }
            const { maximum } = image
              .prepare("SELECT max(id) AS maximum FROM family_audit")
              .get();
            if (maximum)
              await client.query(
                "SELECT setval(pg_get_serial_sequence('medora.access_audit','id'),$1,true)",
                [maximum],
              );
          }
          continue;
        }
        const kv = (k) => {
          if (
            !image
              .prepare("SELECT 1 FROM sqlite_schema WHERE name='_cf_KV'")
              .get()
          )
            return undefined;
          const row = image
            .prepare("SELECT value FROM _cf_KV WHERE key=?")
            .get(k);
          return row ? deserialize(row.value) : undefined;
        };
        const tables = image
          .prepare("SELECT name FROM sqlite_schema WHERE type='table'")
          .all()
          .map((r) => r.name);
        if (tables.includes("family_operations"))
          for (const row of image
            .prepare("SELECT operation,expires FROM family_operations")
            .all())
            await client.query(
              "INSERT INTO medora.family_operations(owner,key,expires_ms) VALUES($1,$2,$3)",
              [owner, row.operation, row.expires],
            );
        if (tables.includes("_cf_KV"))
          for (const row of image
            .prepare(
              "SELECT key,value FROM _cf_KV WHERE key LIKE 'family-operation:%'",
            )
            .all()) {
            const expiry = deserialize(row.value) + 7 * 86400000;
            if (!Number.isSafeInteger(expiry))
              throw Error("Invalid historical delegated receipt");
            await client.query(
              `INSERT INTO medora.family_operations(owner,key,expires_ms) VALUES($1,$2,$3) ON CONFLICT(owner,key)
            DO UPDATE SET expires_ms=greatest(medora.family_operations.expires_ms,excluded.expires_ms)`,
              [owner, row.key, expiry],
            );
          }
        const state = kv("care-sync");
        await client.query(
          "INSERT INTO medora.care_state(owner,revision,records,zone) VALUES ($1,$2,coalesce($3::jsonb,medora.empty_care()),$4)",
          [
            owner,
            state?.revision ?? 0,
            state?.records ? JSON.stringify(state.records) : null,
            kv("care-zone") ?? null,
          ],
        );
      } finally {
        image.close();
        bytes.fill(0);
      }
    }
    await client.query(`UPDATE medora.accounts a SET sync_generation=2,
      cursor=coalesce((SELECT max(revision) FROM medora.records r WHERE r.owner=a.id),0)`);
    await client.query(
      "INSERT INTO medora.cutover_accounts SELECT id,cursor FROM medora.accounts",
    );
    await client.query(
      "UPDATE medora.writer_transition SET phase='rehearsal', snapshot=$1 WHERE singleton",
      [snapshot],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

// This state is deliberately persistent. An interrupted recovery leaves both writers fenced.
export async function freezeWriter(client, snapshot) {
  const result = await client.query(
    `UPDATE medora.writer_transition SET phase='frozen'
    WHERE singleton AND snapshot=$1 AND phase IN ('rehearsal','frozen') RETURNING phase`,
    [snapshot],
  );
  if (result.rowCount !== 1) throw Error("Writer transition mismatch");
}
