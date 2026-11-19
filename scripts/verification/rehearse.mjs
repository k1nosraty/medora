import { verifyPostWrite } from "./post-write.mjs";
import { verifyFixture } from "./verify-fixture.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fixtureDatabase } from "./fixture-database.mjs";
const unmapped = process.argv[2] === "--unmapped";
const eraseImported = process.argv[2] === "--erase-imported";
if (process.argv.length !== (unmapped || eraseImported ? 3 : 2))
  throw Error("Unknown rehearsal mode");
const url = fixtureDatabase(process.env.MEDORA_TEST_DATABASE_URL);
if (!url)
  throw Error(
    "A fresh isolated loopback PostgreSQL fixture database is required",
  );
const dir = await mkdtemp(join(tmpdir(), "medora-rehearsal-"));
const source = join(dir, "fixture"),
  archive = join(dir, "archive"),
  key = join(dir, "key");
await writeFile(key, randomBytes(32).toString("hex"), { mode: 0o600 });
const env = { ...process.env, DATABASE_URL: url, MEDORA_ARCHIVE_KEY_FILE: key };
function run(args) {
  const result = spawnSync(process.execPath, args, { env, encoding: "utf8" });
  if (result.status !== 0) {
    const frames = (result.stderr ?? "")
      .split("\n")
      .filter((line) =>
        /^\s*at .*scripts\/(?:verification|migration)\//.test(line),
      )
      .slice(0, 3);
    throw Error(
      "Fixture rehearsal command failed: " +
        args[0] +
        " " +
        (args[1] ?? "").split("/").at(-1) +
        "\n" +
        frames.join("\n"),
    );
  }
  return result.stdout.trim();
}
try {
  run(["scripts/verification/legacy-source.mjs", source]);
  run(["scripts/migration/apply.mjs"]);
  const cli = "scripts/migration/objects.mjs";
  run([
    cli,
    "export",
    join(source, "do"),
    join(source, "census.json"),
    archive,
    join(source, "identity.json"),
  ]);
  const physical = JSON.parse(run([cli, "import", archive]));
  assert.deepEqual(physical, JSON.parse(run([cli, "import", archive])));
  assert.deepEqual(physical, JSON.parse(run([cli, "verify", archive])));
  const legacyRestore = join(dir, "restored");
  await mkdir(legacyRestore, { mode: 0o700 });
  assert.deepEqual(
    physical,
    JSON.parse(run([cli, "restore-copy", archive, join(legacyRestore, "do")])),
  );
  run([
    "scripts/verification/legacy-source.mjs",
    legacyRestore,
    join(source, "expectations.json"),
  ]);
  const records = JSON.parse(run([cli, "project", archive]));
  assert.deepEqual(records, JSON.parse(run([cli, "project", archive])));
  assert.deepEqual(
    records,
    JSON.parse(run([cli, "verify-projection", archive])),
  );
  assert.deepEqual(records, {
    accounts: 2,
    legacy_people: 2,
    legacy_sessions: 2,
    legacy_care: 1607,
    households: 1,
    memberships: 2,
    grants: 1,
    import_devices: 1,
    account_devices: 2,
  });
  const { manifest } = JSON.parse(
    await readFile(join(archive, "manifest.json"), "utf8"),
  );
  await verifyFixture(
    url,
    manifest.snapshot,
    JSON.parse(await readFile(join(source, "expectations.json"), "utf8")),
  );
  const expectationFile = join(source, "expectations.json");
  const expected = JSON.parse(await readFile(expectationFile, "utf8"));
  // Exercise the source fence on a restored copy, leaving the baseline immutable.
  const probeFencedSource = () =>
    run([
      "scripts/verification/legacy-source.mjs",
      legacyRestore,
      expectationFile,
      "fenced",
    ]);
  probeFencedSource();
  const restored = join(dir, "postwrite");
  const postWriteRollback = await verifyPostWrite({
    url,
    archive,
    key: Buffer.from(await readFile(key, "utf8"), "hex"),
    keyFile: key,
    restored,
    probeFencedSource,
    snapshot: manifest.snapshot,
    expected,
    unmapped,
    eraseImported,
  });
  if (!unmapped) {
    const postFile = join(dir, "postwrite-expectations.json");
    await writeFile(postFile, JSON.stringify(expected), { mode: 0o600 });
    for (const root of eraseImported
      ? [restored]
      : [restored, restored + "-retry"])
      run(["scripts/verification/legacy-source.mjs", root, postFile]);
  }
  console.log(
    JSON.stringify({
      source: "synthetic Workerd",
      snapshot: manifest.snapshot,
      physical,
      records,
      fixtureValuesCompared: true,
      privateFieldsDecrypted: true,
      restoredLegacyRuntime: true,
      replay: true,
      legacyWriterFenced: true,
      ...(unmapped
        ? { unsupportedMutation: postWriteRollback }
        : eraseImported
          ? { importedAccountErasure: postWriteRollback }
          : {
              postWriteRollback,
              releaseNotificationReplayed: true,
              operationsExportVerified: true,
              corruptBackupPublicationBlocked: true,
              passwordResetReplayed: true,
              registrationReplayed: true,
              legacySessionContinuity: true,
              operationsReplayed: true,
              campaignMediaReplayed: true,
            }),
      sourceProjectionReconciled: true,
      reconciled: !unmapped,
    }),
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
