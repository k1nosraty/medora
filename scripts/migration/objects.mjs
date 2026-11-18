import { backupStorage, restoreBackupCatalog } from "./backup-recovery.mjs";
import pg from "pg";
import { readFile } from "node:fs/promises";
import {
  exportObjects,
  importObjects,
  restoreCopy,
} from "./object-archive.mjs";
import { projectArchive } from "./project.mjs";
const [action, dir, census, output, names] = process.argv.slice(2);
if (!process.env.MEDORA_ARCHIVE_KEY_FILE)
  throw new Error("MEDORA_ARCHIVE_KEY_FILE required");
const raw = (
  await readFile(process.env.MEDORA_ARCHIVE_KEY_FILE, "utf8")
).trim();
if (!/^[a-f0-9]{64}$/.test(raw))
  throw new Error("A separate 32-byte hex archive key is required");
const key = Buffer.from(raw, "hex");
try {
  if (action === "export") {
    const m = await exportObjects(
      dir,
      JSON.parse(await readFile(census, "utf8")),
      output,
      key,
      names ? JSON.parse(await readFile(names, "utf8")) : undefined,
    );
    console.log("Authenticated archive written;", m.entries.length, "objects");
  } else if (
    [
      "import",
      "verify",
      "project",
      "verify-projection",
      "restore-copy",
      "restore-after-writes",
      "restore-backup-catalog",
    ].includes(action) &&
    process.env.DATABASE_URL
  ) {
    const client = new pg.Client({
      connectionString: process.env.DATABASE_URL,
    });
    await client.connect();
    try {
      const storage = backupStorage(process.env);
      if (action === "restore-backup-catalog") {
        if (!storage)
          throw Error("An isolated backup storage target is required");
        console.log(
          JSON.stringify({
            restoredBackupObjects: await restoreBackupCatalog(
              client,
              storage,
              dir,
              key,
            ),
          }),
        );
      } else
        console.log(
          JSON.stringify(
            await (action === "restore-after-writes"
              ? (await import("./reverse-care.mjs")).reverseCare(
                  client,
                  dir,
                  key,
                  census,
                  storage,
                )
              : action === "restore-copy"
                ? restoreCopy(client, dir, key, census)
                : action.includes("project")
                  ? projectArchive(
                      client,
                      dir,
                      key,
                      action === "verify-projection",
                    )
                  : importObjects(client, dir, key, action === "verify")),
          ),
        );
    } finally {
      await client.end();
    }
  } else
    throw new Error(
      "Use export FROZEN_COPY CENSUS NEW_DIRECTORY or import|verify ARCHIVE_DIRECTORY with DATABASE_URL",
    );
} catch {
  console.error(
    "Object migration failed. Preserve source, target and checkpoints; inspect the isolated environment.",
  );
  process.exitCode = 1;
} finally {
  key.fill(0);
}
