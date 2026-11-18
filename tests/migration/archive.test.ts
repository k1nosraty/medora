import { expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { Client } from "pg";
import {
  classes,
  exportObjects,
  importObjects,
} from "../../scripts/migration/object-archive.mjs";

it.skipIf(!process.env.MEDORA_TEST_DATABASE_URL)(
  "round-trips a seven-namespace census through PostgreSQL, resumes partial import and rejects divergent ciphertext",
  async () => {
    const tmp = await mkdtemp(join(tmpdir(), "medora-fixture-"));
    const src = join(tmp, "source"),
      out = join(tmp, "archive");
    await mkdir(src);
    const census: Record<string, string[]> = {};
    const key = randomBytes(32);
    const db = new Client({
      connectionString: process.env.MEDORA_TEST_DATABASE_URL,
    });
    await db.connect();
    try {
      for (const kind of classes()) {
        const ns = "fixture-" + kind;
        census[ns] = ["metadata.sqlite", "example.sqlite"];
        await mkdir(join(src, ns));
        for (const name of census[ns]) {
          const s = new DatabaseSync(join(src, ns, name));
          s.exec(
            "CREATE TABLE future_history(id INTEGER PRIMARY KEY, owner TEXT, flags BLOB, ts INTEGER, parent INTEGER REFERENCES future_history(id))",
          );
          s.prepare("INSERT INTO future_history VALUES (?,?,?,?,?)").run(
            1,
            "synthetic",
            Buffer.from([0, 255]),
            2147483648123,
            null,
          );
          s.prepare("INSERT INTO future_history VALUES (?,?,?,?,?)").run(
            2,
            "synthetic",
            Buffer.from([9]),
            2147483648124,
            1,
          );
          s.close();
        }
      }
      const m = await exportObjects(src, census, out, key);
      const last = m.entries.at(-1)!;
      const path = join(out, last.file),
        bytes = await readFile(path);
      await writeFile(path, bytes.subarray(0, 40));
      await expect(importObjects(db, out, key)).rejects.toThrow();
      await writeFile(path, bytes);
      expect(await importObjects(db, out, key)).toEqual({
        namespaces: 7,
        objects: 14,
        rows: 28,
      });
      expect(await importObjects(db, out, key)).toEqual(
        await importObjects(db, out, key, true),
      );
      await db.query(
        "UPDATE medora.source_objects SET archive=$1 WHERE snapshot=$2 AND object_id=$3",
        [Buffer.alloc(64), m.snapshot, last.object],
      );
      await expect(importObjects(db, out, key, true)).rejects.toThrow();
    } finally {
      await db.end();
      await rm(tmp, { recursive: true, force: true });
    }
  },
);
