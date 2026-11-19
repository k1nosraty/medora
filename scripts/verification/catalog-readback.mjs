import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomBytes, createHash } from "node:crypto";
import assert from "node:assert/strict";
import { Client } from "pg";
import {
  backupStorage,
  restoreBackupCatalog,
} from "../migration/backup-recovery.mjs";
import { fixtureObjects } from "./fixture-objects.mjs";
import { fixtureDatabase } from "./fixture-database.mjs";

export async function verifyRecoveredCatalog(
  source,
  url,
  doRoot,
  key,
  owner,
  digest,
) {
  const db = new URL(fixtureDatabase(url));
  const name = "medora_catalog_fixture_" + randomBytes(8).toString("hex");
  await source.query("CREATE DATABASE " + name);
  db.pathname = "/" + name;
  const sink = await fixtureObjects();
  const storage = backupStorage(sink.bindings);
  const isolated = new Client({ connectionString: db.href });
  try {
    const migrate = spawn(process.execPath, ["scripts/migration/apply.mjs"], {
      env: { PATH: process.env.PATH, DATABASE_URL: db.href },
      stdio: "ignore",
    });
    const [code] = await once(migrate, "exit");
    assert.equal(code, 0);
    await isolated.connect();
    await isolated.query(
      `INSERT INTO medora.accounts(id,email,username,password_salt,password_proof,password_key,sync_generation)
      VALUES($1,'catalog-fixture@example.test','catalog_fixture','','','fixture',2)`,
      [owner],
    );
    assert.equal(await restoreBackupCatalog(isolated, storage, doRoot, key), 1);
    assert.equal(await restoreBackupCatalog(isolated, storage, doRoot, key), 1);
    const { rows } = await isolated.query(
      "SELECT owner,digest,bytes,ready FROM medora.backups",
    );
    assert.deepEqual(rows, [{ owner, digest, bytes: 192, ready: true }]);
    const bytes = Buffer.from(
      await storage.get("backups/" + owner + "/" + digest),
    );
    assert.equal(createHash("sha256").update(bytes).digest("hex"), digest);
  } finally {
    await isolated.end();
    await sink.close();
    await source.query("DROP DATABASE " + name);
  }
}
