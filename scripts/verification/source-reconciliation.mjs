import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { exportObjects, importObjects, restoreCopy, sha } from "../migration/object-archive.mjs";
import { projectArchive } from "../migration/project.mjs";
import { fixtureDatabase } from "./fixture-database.mjs";

export async function reconcileSourceCopy({ source, census, identities, output, key, database }) {
  if (!fixtureDatabase(database)) throw Error("Supply a dedicated loopback fixture database");
  if (!identities || typeof identities !== "object" || Array.isArray(identities))
    throw Error("Independent object identities required");
  const frozen = await realpath(source);
  const destination = join(await realpath(dirname(output)), basename(output));
  const fromSource = relative(frozen, destination);
  if (!isAbsolute(fromSource) && fromSource !== ".." && !fromSource.startsWith(".." + sep))
    throw Error("The output directory must be outside the frozen source copy");
  await mkdir(destination, { mode: 0o700 });
  const archive = join(destination, "archive");
  const restored = join(destination, "restored");
  // SQLite can open a WAL shared-memory file even for a read-only connection.
  const scratch = await mkdtemp(join(destination, ".source-"));
  let manifest;
  try {
    const working = join(scratch, "do");
    await cp(frozen, working, { recursive: true, verbatimSymlinks: true });
    manifest = await exportObjects(working, census, archive, key, identities);
  } finally {
    await rm(scratch, { force: true, recursive: true });
  }
  const client = new pg.Client({ connectionString: database });
  await client.connect();
  try {
    const { rows: [{ acquired }] } = await client.query("SELECT pg_try_advisory_lock(694211262) AS acquired");
    const existing = await client.query(`SELECT 1 FROM pg_namespace
      WHERE nspname NOT IN ('public', 'information_schema') AND left(nspname, 3) <> 'pg_'
      UNION ALL SELECT 1 FROM pg_class WHERE relnamespace = 'public'::regnamespace LIMIT 1`);
    if (!acquired || existing.rowCount)
      throw Error("Source verification requires an unused, dedicated fixture database");
    for (let attempt = 0; attempt < 2; attempt++)
      execFileSync(process.execPath, ["scripts/migration/apply.mjs"], {
        env: { PATH: process.env.PATH, DATABASE_URL: database },
        stdio: "pipe",
      });

    const physical = await importObjects(client, archive, key);
    assert.deepEqual(await importObjects(client, archive, key), physical);
    assert.deepEqual(await importObjects(client, archive, key, true), physical);
    const projected = await projectArchive(client, archive, key);
    assert.deepEqual(await projectArchive(client, archive, key), projected);
    assert.deepEqual(await projectArchive(client, archive, key, true), projected);
    await mkdir(restored, { mode: 0o700 });
    assert.deepEqual(await restoreCopy(client, archive, key, join(restored, "do")), physical);
    return {
      snapshot: manifest.snapshot,
      manifestSha256: sha(await readFile(join(archive, "manifest.json"))),
      archive,
      restored,
      physical,
      projected,
    };
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [scope, source, censusFile, identityFile, output] = process.argv.slice(2);
  const database = fixtureDatabase(process.env.MEDORA_TEST_DATABASE_URL);
  const keyFile = process.env.MEDORA_ARCHIVE_KEY_FILE;
  if (!["--authorized-copy", "--synthetic"].includes(scope) ||
      process.argv.length !== 7 || ![source, censusFile, identityFile, output, database, keyFile].every(Boolean)) {
    console.error("Use --authorized-copy or --synthetic FROZEN_COPY CENSUS IDENTITIES NEW_DIRECTORY with a loopback MEDORA_TEST_DATABASE_URL and MEDORA_ARCHIVE_KEY_FILE");
    process.exitCode = 2;
  } else {
    let key;
    try {
      const metadata = await stat(keyFile);
      if (!metadata.isFile() || (metadata.mode & 0o077) !== 0) throw Error("Private archive key file required");
      const hex = (await readFile(keyFile, "utf8")).trim();
      if (!/^[a-f0-9]{64}$/.test(hex)) throw Error("Invalid archive key");
      key = Buffer.from(hex, "hex");
      const census = JSON.parse(await readFile(censusFile, "utf8"));
      const identities = JSON.parse(await readFile(identityFile, "utf8"));
      const { manifestSha256, physical, projected } = await reconcileSourceCopy({ source, census, identities, output, key, database });
      console.log(JSON.stringify({ input: scope.slice(2), manifestSha256, physical, projected, restoredImagesVerified: true, readiness: "NOT READY" }));
    } catch {
      console.error("Source reconciliation failed. Preserve the source, output and target checkpoints for isolated inspection.");
      process.exitCode = 1;
    } finally {
      key?.fill(0);
    }
  }
}
