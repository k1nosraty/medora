import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { Client } from "pg";
import { s3Storage } from "../../apps/api/src/objects.ts";

const state = "medora.infrastructure_handoff";
const identifier = (value) => '"' + value.replaceAll('"', '""') + '"';
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

function dbEndpoint(value) {
  const address = new URL(value);
  const port = address.port || "5432";
  if (
    !["postgresql:", "postgres:"].includes(address.protocol) ||
    address.pathname.length < 2
  )
    throw Error("Supply an explicit PostgreSQL database");
  return address.hostname.toLowerCase() + ":" + port + address.pathname;
}

async function withClient(url, work) {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    return await work(c);
  } finally {
    await c.end();
  }
}

export async function initializePrimary(url) {
  return withClient(url, async (c) => {
    await c.query("BEGIN");
    try {
      await c.query("SELECT installation FROM " + state + " FOR UPDATE");
      const updated = await c.query(`
        UPDATE ${state} SET phase='active'
        WHERE phase='compatibility'
          AND (SELECT phase FROM medora.writer_transition WHERE singleton)='open'
          AND NOT EXISTS(SELECT 1 FROM medora.accounts)
          AND NOT EXISTS(SELECT 1 FROM medora.imports)
          AND NOT EXISTS(SELECT 1 FROM medora.backups)`);
      if (!updated.rowCount)
        throw Error("A new isolated PostgreSQL installation is required");
      await c.query("COMMIT");
    } catch (error) {
      await c.query("ROLLBACK");
      throw error;
    }
  });
}

async function handoff(c) {
  const {
    rows: [row],
  } = await c.query("SELECT * FROM " + state);
  return row;
}

async function freeze(source, transfer) {
  return withClient(source, async (c) => {
    await c.query("BEGIN");
    try {
      const {
        rows: [row],
      } = await c.query(
        `
        UPDATE ${state} SET phase='frozen',transfer=$1
        WHERE phase='active' AND (SELECT phase FROM medora.writer_transition WHERE singleton)='open'
        RETURNING installation`,
        [transfer],
      );
      if (!row) throw Error("Source is not an active PostgreSQL installation");
      const {
        rows: [pending],
      } = await c.query(`
        SELECT EXISTS(SELECT 1 FROM medora.backups WHERE NOT ready)
          OR EXISTS(SELECT 1 FROM medora.backup_cleanup) AS tasks`);
      if (pending.tasks)
        throw Error(
          "Resolve unfinished object writes and erasure before handoff",
        );
      await c.query("COMMIT");
      return row.installation;
    } catch (error) {
      await c.query("ROLLBACK");
      throw error;
    }
  });
}

async function inventory(url) {
  return withClient(url, async (c) => {
    await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const tables = await c.query(`
      SELECT schemaname,tablename FROM pg_tables
      WHERE (schemaname='medora' AND tablename<>'infrastructure_handoff')
        OR (schemaname='public' AND tablename='medora_migrations')
      ORDER BY schemaname,tablename COLLATE "C"`);
    const rows = [];
    for (const { schemaname, tablename } of tables.rows) {
      const digest = createHash("sha256");
      let count = 0;
      await c.query(`DECLARE relation NO SCROLL CURSOR FOR
        SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS digest
        FROM ${identifier(schemaname)}.${identifier(tablename)} t ORDER BY digest`);
      for (;;) {
        const batch = await c.query("FETCH 1000 FROM relation");
        for (const row of batch.rows) digest.update(row.digest);
        count += batch.rowCount;
        if (batch.rowCount < 1000) break;
      }
      await c.query("CLOSE relation");
      rows.push([schemaname + "." + tablename, count, digest.digest("hex")]);
    }
    const sequences = await c.query(`
      SELECT sequencename FROM pg_sequences WHERE schemaname='medora'
      ORDER BY sequencename COLLATE "C"`);
    const counters = [];
    for (const { sequencename } of sequences.rows) {
      const {
        rows: [sequence],
      } = await c.query(
        "SELECT last_value::text,is_called FROM medora." +
          identifier(sequencename),
      );
      counters.push([sequencename, sequence.last_value, sequence.is_called]);
    }
    const constraints = await c.query(`
      SELECT rel.relname, con.conname, pg_get_constraintdef(con.oid) AS definition, con.convalidated
      FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid
      WHERE con.connamespace='medora'::regnamespace ORDER BY 1,2`);
    const indexes = await c.query(`SELECT indexname,indexdef FROM pg_indexes
      WHERE schemaname='medora' ORDER BY indexname COLLATE "C"`);
    const { rows: objects } = await c.query(`
      SELECT owner,digest,bytes FROM medora.backups WHERE ready ORDER BY owner,digest`);
    await c.query("COMMIT");
    return {
      rows,
      counters,
      constraints: constraints.rows,
      indexes: indexes.rows,
      objects,
    };
  });
}

async function fileHash(path) {
  const hash = createHash("sha256");
  for await (const piece of createReadStream(path)) hash.update(piece);
  return hash.digest("hex");
}

function pgTool(name, url, args) {
  const executable = process.env.MEDORA_PG_BIN
    ? join(process.env.MEDORA_PG_BIN, name)
    : name;
  const db = new URL(url);
  const env = {
    PATH: process.env.PATH,
    PGHOST: db.hostname.replace(/^\[|\]$/g, ""),
    PGPORT: db.port || "5432",
    PGDATABASE: decodeURIComponent(db.pathname.slice(1)),
    PGUSER: decodeURIComponent(db.username),
    PGPASSWORD: decodeURIComponent(db.password),
    PGCONNECT_TIMEOUT: "10",
  };
  const supported = {
    sslmode: "PGSSLMODE",
    sslrootcert: "PGSSLROOTCERT",
    sslcert: "PGSSLCERT",
    sslkey: "PGSSLKEY",
    channel_binding: "PGCHANNELBINDING",
  };
  for (const [key, value] of db.searchParams) {
    if (!Object.hasOwn(supported, key))
      throw Error(
        "Use a direct PostgreSQL connection with supported libpq options",
      );
    env[supported[key]] = value;
  }
  return new Promise((resolve, reject) => {
    const child = spawn(
      executable,
      name === "pg_restore" ? ["--dbname", env.PGDATABASE, ...args] : args,
      {
        env,
        stdio: "ignore",
      },
    );
    child.once("error", () => reject(Error(name + " unavailable")));
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(Error(name + " failed")),
    );
  });
}

function objectKey(row) {
  if (
    !/^[A-Za-z0-9_-]{1,128}$/.test(row.owner) ||
    !/^[a-f0-9]{64}$/.test(row.digest) ||
    !Number.isSafeInteger(row.bytes) ||
    row.bytes < 52 ||
    row.bytes > 16 * 1024 * 1024
  )
    throw Error("Invalid backup catalog row");
  return "backups/" + row.owner + "/" + row.digest;
}

async function verifyObjects(storage, expected) {
  const left = new Set(expected.map(objectKey));
  for await (const key of storage.listKeys()) {
    if (!left.delete(key))
      throw Error("Object inventory contains an unaccounted key");
  }
  if (left.size) throw Error("Object inventory is missing cataloged backups");
  for (const row of expected) {
    const bytes = await storage.get(objectKey(row));
    if (
      !bytes ||
      bytes.byteLength !== row.bytes ||
      sha(new Uint8Array(bytes)) !== row.digest
    )
      throw Error("Encrypted object size or digest mismatch");
  }
}

export async function prepareHandoff({ source, target, from, to, output }) {
  if (dbEndpoint(source) === dbEndpoint(target))
    throw Error("Independent databases are required");
  await withClient(target, async (c) => {
    const {
      rows: [row],
    } = await c.query(`SELECT
      to_regnamespace('medora') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_tables
        WHERE schemaname NOT IN ('pg_catalog','information_schema')) AS occupied`);
    if (row.occupied) throw Error("Destination database must be empty");
  });
  await verifyObjects(to, []);
  await withClient(source, async (c) => {
    const extra = await c.query(`SELECT 1 FROM pg_tables
      WHERE schemaname NOT IN ('medora','pg_catalog','information_schema')
        AND NOT (schemaname='public' AND tablename='medora_migrations') LIMIT 1`);
    if (extra.rowCount) throw Error("Use a dedicated Medora database");
  });
  await mkdir(output, { mode: 0o700 });
  const transfer = randomUUID();
  // Keep the transfer UUID even if the copy is interrupted before verification.
  await writeFile(join(output, "transfer"), transfer, {
    mode: 0o600,
    flag: "wx",
    flush: true,
  });
  const sourceId = await freeze(source, transfer);
  const before = await inventory(source);
  await verifyObjects(from, before.objects);
  const dump = join(output, "database.dump");
  await pgTool("pg_dump", source, [
    "--no-password",
    "--format=custom",
    "--no-owner",
    "--no-acl",
    "--file",
    dump,
  ]);
  const dumpHash = await fileHash(dump);
  await pgTool("pg_restore", target, [
    "--no-password",
    "--single-transaction",
    "--exit-on-error",
    "--no-owner",
    "--no-acl",
    dump,
  ]);
  const targetId = randomUUID();
  await withClient(target, async (c) => {
    const changed = await c.query(
      `UPDATE ${state} SET installation=$1
      WHERE installation=$2 AND phase='frozen' AND transfer=$3`,
      [targetId, sourceId, transfer],
    );
    if (!changed.rowCount) throw Error("Restored installation mismatch");
  });
  for (const row of before.objects) {
    const key = objectKey(row);
    const bytes = await from.get(key);
    if (
      !bytes ||
      bytes.byteLength !== row.bytes ||
      sha(new Uint8Array(bytes)) !== row.digest
    )
      throw Error("Object changed during copy");
    await to.put(key, new Uint8Array(bytes));
  }
  await verifyObjects(to, before.objects);
  const after = await inventory(target);
  if (
    !isDeepStrictEqual(before, await inventory(source)) ||
    !isDeepStrictEqual(before, after)
  )
    throw Error("Target PostgreSQL inventory mismatch");
  const receipt = {
    transfer,
    sourceId,
    targetId,
    dumpHash,
    inventoryHash: sha(JSON.stringify(before)),
  };
  await writeFile(join(output, "verified.json"), JSON.stringify(receipt), {
    mode: 0o600,
    flag: "wx",
    flush: true,
  });
  return {
    tables: before.rows.length,
    sequences: before.counters.length,
    constraints: before.constraints.length,
    objects: before.objects.length,
  };
}

export async function commitHandoff({ source, target, to, output }) {
  if (dbEndpoint(source) === dbEndpoint(target))
    throw Error("Independent databases are required");
  const receipt = JSON.parse(
    await readFile(join(output, "verified.json"), "utf8"),
  );
  const current = await withClient(target, handoff);
  if (
    current.installation !== receipt.targetId ||
    (current.phase !== "active" &&
      (current.phase !== "frozen" || current.transfer !== receipt.transfer))
  )
    throw Error("Wrong cutover target");
  if (current.phase === "frozen") {
    const after = await inventory(target);
    if (
      sha(JSON.stringify(after)) !== receipt.inventoryHash ||
      (await fileHash(join(output, "database.dump"))) !== receipt.dumpHash
    )
      throw Error("Cutover verification changed");
    await verifyObjects(to, after.objects);
  }
  await withClient(source, async (c) => {
    const result = await c.query(
      `UPDATE ${state} SET phase='retired',destination=$1
      WHERE installation=$2 AND transfer=$3 AND (phase='frozen' OR (phase='retired' AND destination=$1))`,
      [receipt.targetId, receipt.sourceId, receipt.transfer],
    );
    if (!result.rowCount) throw Error("Source cannot retire for this cutover");
  });
  if (current.phase === "active") return;
  await withClient(target, async (c) => {
    const result = await c.query(
      `UPDATE ${state} SET phase='active',transfer=NULL
      WHERE installation=$1 AND transfer=$2 AND phase='frozen'`,
      [receipt.targetId, receipt.transfer],
    );
    if (!result.rowCount && (await handoff(c)).phase !== "active")
      throw Error(
        "Target activation incomplete; retry the previously verified cutover",
      );
  });
}

export async function abortHandoff(source, output) {
  const transfer = await readFile(join(output, "transfer"), "utf8");
  return withClient(source, async (c) => {
    const result = await c.query(
      `UPDATE ${state} SET phase='active',transfer=NULL
      WHERE phase='frozen' AND transfer=$1`,
      [transfer],
    );
    if (!result.rowCount)
      throw Error("Only the frozen original source can resume");
  });
}

function storage(prefix) {
  const parts = [
    "ENDPOINT",
    "BUCKET",
    "ACCESS_KEY_ID",
    "SECRET_ACCESS_KEY",
  ].map((name) => process.env[prefix + "_S3_" + name]);
  if (!parts.every(Boolean))
    throw Error("Explicit independent object storage is required");
  return s3Storage(...parts, process.env[prefix + "_S3_REGION"] || "auto");
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [action, output] = process.argv.slice(2);
  const source = process.env.MEDORA_SOURCE_DATABASE_URL;
  const target = process.env.MEDORA_TARGET_DATABASE_URL;
  try {
    if (action === "initialize" && source && !output)
      await initializePrimary(source);
    else if (action === "abort" && source && output)
      await abortHandoff(source, output);
    else if (action === "prepare" && source && target && output)
      console.log(
        JSON.stringify(
          await prepareHandoff({
            source,
            target,
            output,
            from: storage("MEDORA_SOURCE"),
            to: storage("MEDORA_TARGET"),
          }),
        ),
      );
    else if (action === "commit" && source && target && output)
      await commitHandoff({
        source,
        target,
        output,
        to: storage("MEDORA_TARGET"),
      });
    else
      throw Error(
        "Expected initialize, prepare, commit or abort, with explicit installation configuration",
      );
  } catch (error) {
    console.error(
      "Handoff stopped. Inspect the private transfer state before retrying.",
      error.code ?? error.name,
    );
    process.exitCode = 1;
  }
}
