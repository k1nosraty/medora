import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(694211260)");
  await client.query(
    "CREATE TABLE IF NOT EXISTS public.medora_migrations (filename text PRIMARY KEY, digest text NOT NULL, applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  );
  const dir = new URL("../../migrations/server/", import.meta.url);
  const files = (await readdir(dir))
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort();
  const applied = await client.query(
    "SELECT filename,digest FROM public.medora_migrations ORDER BY filename",
  );
  for (const [index, row] of applied.rows.entries()) {
    if (files[index] !== row.filename)
      throw new Error("Migration history diverged");
  }
  for (const [index, name] of files.entries()) {
    const sql = await readFile(new URL(name, dir), "utf8");
    const digest = createHash("sha256").update(sql).digest("hex");
    if (applied.rows[index]) {
      if (applied.rows[index].digest !== digest)
        throw new Error("Applied migration checksum mismatch");
    } else {
      await client.query(sql);
      await client.query(
        "INSERT INTO public.medora_migrations(filename,digest) VALUES ($1,$2)",
        [name, digest],
      );
    }
  }
  await client.query("COMMIT");
  console.log("Verified", files.length, "database migrations");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
