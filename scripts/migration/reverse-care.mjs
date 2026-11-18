import { householdReplay } from "./reverse-households.mjs";
import { isDeepStrictEqual } from "node:util";
import { createHmac, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
import { restoreCopy, readManifest } from "./object-archive.mjs";
import { operation } from "../../packages/contracts/src/index.ts";
const require = createRequire(
  new URL("../../web/package.json", import.meta.url),
);
const { Miniflare, convertV4MiniflareOptions } = require("miniflare");
const { build } = require("esbuild");

// Workerd writes the serialized value and alarm through its own storage API.
// The temporary worker has no network-facing RPC or delivery integration.
async function recoveryWorker(root, namespace, families) {
  const { outputFiles } = await build({
    entryPoints: [new URL("./reverse-object.mjs", import.meta.url).pathname],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    external: ["cloudflare:workers"],
  });
  return new Miniflare(
    convertV4MiniflareOptions({
      name: "reverse-copy",
      cf: false,
      modules: true,
      script: outputFiles[0].text,
      compatibilityDate: "2026-10-29",
      resourcePersistencePath: root,
      durableObjects: {
        ACCOUNT: {
          className: "Recovery",
          useSQLite: true,
          unsafeUniqueKey: namespace,
        },
        FAMILY: {
          className: "HouseholdRecovery",
          useSQLite: true,
          unsafeUniqueKey: families,
        },
      },
      outboundService: () => new Response(null, { status: 503 }),
    }),
  );
}

export async function reverseCare(client, archive, key, output) {
  const manifest = await readManifest(archive, key);
  const ns = Object.keys(manifest.inventory).filter((k) =>
    k.endsWith("-EmailAccount"),
  );
  if (ns.length !== 1 || !manifest.identities?.[ns[0]])
    throw Error("Ambiguous account namespace");
  const gate = await client.query(
    "SELECT phase FROM medora.writer_transition WHERE singleton AND snapshot=$1",
    [manifest.snapshot],
  );
  if (gate.rows[0]?.phase !== "frozen")
    throw Error("Both writers must be fenced before recovery");
  if (
    (await client.query("SELECT 1 FROM medora.rollback_exceptions LIMIT 1"))
      .rowCount
  )
    throw Error("A committed change requires a different reverse projection");
  const { rows: owners } = await client.query(
    `SELECT a.id, a.cursor, c.seed_cursor, p.source_revision FROM medora.accounts a
    JOIN medora.cutover_accounts c ON c.owner=a.id JOIN medora.legacy_people p ON a.id=p.owner AND p.snapshot=$1`,
    [manifest.snapshot],
  );
  if (owners.length !== Object.keys(manifest.identities[ns[0]]).length)
    throw Error("Reverse owner census mismatch");
  // Reserve a NEW directory exclusively. Only the final rename publishes a bootable do/ tree.
  let fresh = true;
  try {
    await mkdir(output, { mode: 0o700 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const directory = await lstat(output);
    if (
      !directory.isDirectory() ||
      (directory.mode & 0o077) !== 0 ||
      (await lstat(join(output, "do")).then(
        () => true,
        (e) => {
          if (e.code !== "ENOENT") throw e;
          return false;
        },
      ))
    )
      throw error;
    fresh = false;
  }
  const marker = join(output, ".recovery-source");
  const signature = createHmac("sha256", key)
    .update(
      JSON.stringify([
        "reverse-care-v1",
        manifest.snapshot,
        await realpath(output),
      ]),
    )
    .digest("hex");
  if (fresh)
    await writeFile(marker, signature, {
      mode: 0o600,
      flag: "wx",
      flush: true,
    });
  else if ((await readFile(marker, "utf8")) !== signature)
    throw Error("Recovery destination belongs to another snapshot");
  const scratch = await mkdtemp(join(output, ".recovery-"));
  let replayed = 0;
  try {
    await restoreCopy(client, archive, key, join(scratch, "do"));
    const familyNs = Object.keys(manifest.inventory).filter((k) =>
      k.endsWith("-Families"),
    );
    if (familyNs.length !== 1) throw Error("Ambiguous household namespace");
    const group = await householdReplay(client, manifest.snapshot);
    const worker = await recoveryWorker(scratch, ns[0], familyNs[0]);
    try {
      const families = await worker.getDurableObjectNamespace("FAMILY");
      const familyId = families.idFromName("care-groups");
      if (
        manifest.identities[familyNs[0]][familyId.toString() + ".sqlite"] !==
        "care-groups"
      )
        throw Error("Household namespace identity mismatch");
      await families.get(familyId).replay(group.events, group.final);
      const binding = await worker.getDurableObjectNamespace("ACCOUNT");
      for (const owner of owners) {
        const id = binding.idFromName(owner.id);
        if (manifest.identities[ns[0]][id.toString() + ".sqlite"] !== owner.id)
          throw Error("Account identity mismatch");
        const { rows } = await client.query(
          `SELECT cursor, kind, record_id AS id, base_revision, body, operation, care_operation
          FROM medora.changes WHERE owner=$1 ORDER BY cursor`,
          [owner.id],
        );
        const versions = new Map(),
          seeds = [];
        for (const [index, row] of rows.entries()) {
          const cursor = Number(row.cursor);
          const op = operation.parse({
            kind: row.kind,
            id: row.id,
            operation: row.operation,
            baseRevision: Number(row.base_revision),
            body: row.body,
          });
          if (
            cursor !== index + 1 ||
            op.baseRevision !== (versions.get(op.id)?.revision ?? 0)
          )
            throw Error("Divergent reverse feed");
          versions.set(op.id, { revision: cursor, body: op.body });
          if (cursor <= Number(owner.seed_cursor)) seeds.push(op);
        }
        if (
          Number(owner.cursor) !== rows.length ||
          seeds.length !== Number(owner.seed_cursor)
        )
          throw Error("Incomplete reverse feed");
        const actual = await client.query(
          "SELECT id,revision,body,kind FROM medora.records WHERE owner=$1",
          [owner.id],
        );
        if (
          actual.rowCount !== versions.size ||
          actual.rows.some(
            (r) =>
              r.kind !== "water" ||
              !isDeepStrictEqual(versions.get(r.id), {
                revision: Number(r.revision),
                body: r.body,
              }),
          )
        )
          throw Error("Record and journal mismatch");
        // Send only the JSON required by the mapper. Do not log rows or identifiers.
        const {
          rows: [live],
        } = await client.query(
          "SELECT records,revision,zone FROM medora.care_state WHERE owner=$1",
          [owner.id],
        );
        const log = await client.query(
          "SELECT revision,operation,request FROM medora.care_log WHERE owner=$1 ORDER BY revision",
          [owner.id],
        );
        if (
          !live ||
          Number(live.revision) !== Number(owner.source_revision) + log.rowCount
        )
          throw Error("Incomplete care history");
        const water = live.records.water,
          liveWater = new Map(water.map((row) => [row.id, row]));
        if (liveWater.size !== water.length)
          throw Error("Duplicate live water ID");
        for (const [key, version] of versions) {
          const row = liveWater.get(key);
          const value = row
            ? { amount: row.amount, day: row.day, time: row.time }
            : null;
          if (!isDeepStrictEqual(value, version.body))
            throw Error("Water projections diverged");
          liveWater.delete(key);
        }
        if (liveWater.size)
          throw Error("Water feed does not cover all records");
        const receiptIds = new Set(log.rows.map((r) => r.operation));
        for (const row of rows.slice(seeds.length)) {
          if (!receiptIds.has(row.care_operation ?? row.operation))
            throw Error("Unlinked care change");
        }
        await binding
          .get(id)
          .restore(
            owner.id,
            Number(owner.source_revision),
            seeds,
            log.rows,
            live,
            randomUUID(),
            group.receipts.get(owner.id) ?? [],
          );
        replayed += log.rowCount;
      }
    } finally {
      await worker.dispose();
    }
    await rename(join(scratch, "do"), join(output, "do"));
    await rm(marker);
    return { owners: owners.length, replayed };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
