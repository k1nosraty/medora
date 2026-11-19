import type { Pool, PoolClient } from "pg";
import { waterEntry, type CareCommit } from "@medora/contracts";
import {
  applyCareDelta,
  careDelta,
} from "../../web/product-assets/public/medication/domain/care-delta.js";
import {
  careSnapshotFits,
  validateCareRecords,
} from "../../web/product-assets/public/medication/domain/care-records.js";
import { digest } from "./auth";
import {
  rotationContents,
  hasPrivateText,
} from "../../web/product-assets/public/medication/domain/private-fields.js";
import { equalCareValues } from "../../web/product-assets/public/medication/domain/care-contract.js";
import { Conflict } from "./repository";

type Row = { id: string; amount: number; day: number; time: string };
type Document = {
  water: Row[];
  privacyKey?: string;
  privacyRotation?: string;
  [key: string]: unknown;
};
interface State {
  revision: string;
  records: Document;
  zone: string | null;
}
export class InvalidCare extends Error {}

async function reflectWater(
  client: PoolClient,
  owner: string,
  operation: string,
  previous: Row[],
  next: Row[],
) {
  const old = new Map(previous.map((row) => [row.id, row])),
    updated = new Map(next.map((row) => [row.id, row]));
  const edits = [];
  for (const id of new Set([...old.keys(), ...updated.keys()])) {
    const before = old.get(id),
      after = updated.get(id);
    if (equalCareValues(before, after)) continue;
    const value = after
      ? waterEntry.safeParse({
          amount: after.amount,
          day: after.day,
          time: after.time,
        })
      : null;
    if (value && !value.success) throw new InvalidCare();
    edits.push({ id, body: value?.data ?? null });
  }
  if (!edits.length) return;
  const {
    rows: [account],
  } = await client.query(
    "UPDATE medora.accounts SET cursor=cursor+$2 WHERE id=$1 RETURNING cursor",
    [owner, edits.length],
  );
  const first = Number(account.cursor) - edits.length + 1;
  // Both indexes are populated in one transaction under the account lock. The FK
  // for the feed references the upserted rows at the end of this statement.
  await client.query(
    `WITH incoming AS MATERIALIZED (
      SELECT row->>'id' AS id,nullif(row->'body','null'::jsonb) AS body,$3::bigint+ord-1 AS cursor
      FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS t(row,ord)),
    previous AS MATERIALIZED (
      SELECT i.*,coalesce(r.revision,0) AS base FROM incoming i LEFT JOIN medora.records r
      ON r.owner=$1 AND r.kind='water' AND r.id=i.id),
    saved AS (INSERT INTO medora.records(owner,kind,id,revision,body)
      SELECT $1,'water',id,cursor,body FROM previous ON CONFLICT(owner,kind,id) DO UPDATE
      SET revision=excluded.revision,body=excluded.body RETURNING id)
    INSERT INTO medora.changes(owner,cursor,operation,kind,record_id,base_revision,body,care_operation)
    SELECT $1,p.cursor,gen_random_uuid(),'water',p.id,p.base,p.body,$4 FROM previous p JOIN saved USING(id)`,
    [owner, JSON.stringify(edits), first, operation],
  );
}
export async function commitCare(
  client: PoolClient,
  owner: string,
  input: CareCommit,
) {
  const account = await client.query(
    "SELECT sync_generation FROM medora.accounts WHERE id=$1 FOR UPDATE",
    [owner],
  );
  if (account.rows[0]?.sync_generation !== 2)
    throw new Conflict("legacy_writer_active");
  const request = {
    baseRevision: input.baseRevision,
    changes: input.changes,
    ...(input.zone && { zone: input.zone }),
  };
  const fingerprint = {
    ...request,
    ...(input.rotationProof && {
      rotationDigest: await digest(input.rotationProof),
    }),
  };
  const prior = await client.query(
    "SELECT revision,input_digest=sha256(convert_to($3::jsonb::text,'UTF8')) AS same FROM medora.care_log WHERE owner=$1 AND operation=$2",
    [owner, input.operation, JSON.stringify(fingerprint)],
  );
  if (prior.rowCount) {
    if (!prior.rows[0].same) throw new Conflict("operation_reused");
    return { owner, revision: Number(prior.rows[0].revision) };
  }
  const {
    rows: [doc],
  } = await client.query<State>(
    "SELECT * FROM medora.care_state WHERE owner=$1 FOR UPDATE",
    [owner],
  );
  if (!doc || Number(doc.revision) !== input.baseRevision)
    throw new Conflict("stale_revision");
  const revision = input.baseRevision + 1,
    zone = input.zone ?? doc.zone;
  let next: Document;
  try {
    if (zone) new Intl.DateTimeFormat("en", { timeZone: zone });
    next = applyCareDelta(doc.records, input.changes) as Document;
    validateCareRecords(next);
    if (hasPrivateText(next)) throw new InvalidCare();
    if (input.rotationProof) {
      if (
        !doc.records.privacyRotation ||
        !next.privacyRotation ||
        doc.records.privacyKey === next.privacyKey ||
        doc.records.privacyRotation === next.privacyRotation ||
        fingerprint.rotationDigest !== doc.records.privacyRotation ||
        !equalCareValues(rotationContents(doc.records), rotationContents(next))
      )
        throw new InvalidCare();
    } else if (
      doc.records.privacyKey &&
      (next.privacyKey !== doc.records.privacyKey ||
        next.privacyRotation !== doc.records.privacyRotation)
    )
      throw new InvalidCare();
    if (!careSnapshotFits(owner, revision, next, zone)) throw new InvalidCare();
  } catch {
    throw new InvalidCare();
  }
  // The durable history contains only the committed, validated document delta.
  // Keep an input fingerprint for retries without retaining superseded payloads.
  const delta = careDelta(doc.records, next);
  if (!delta) throw new InvalidCare();
  const receipt = { ...request, changes: delta };
  await reflectWater(
    client,
    owner,
    input.operation,
    doc.records.water,
    next.water,
  );
  await client.query(
    "UPDATE medora.care_state SET records=$2,revision=$3,zone=$4 WHERE owner=$1",
    [owner, JSON.stringify(next), revision, zone],
  );
  await client.query(
    "INSERT INTO medora.care_log(owner,revision,operation,request,input_digest) VALUES($1,$2,$3,$4,sha256(convert_to($5::jsonb::text,'UTF8')))",
    [
      owner,
      revision,
      input.operation,
      JSON.stringify(receipt),
      JSON.stringify(fingerprint),
    ],
  );
  return { owner, revision };
}
export function careService(pool: Pool) {
  return {
    async read(owner: string) {
      const result = await pool.query<State>(
        "SELECT revision,records,zone FROM medora.care_state WHERE owner=$1",
        [owner],
      );
      const row = result.rows[0];
      if (!row) throw new Conflict("legacy_writer_active");
      return { ...row, revision: Number(row.revision), owner };
    },
    async write(owner: string, input: CareCommit) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const receipt = await commitCare(client, owner, input);
        await client.query("COMMIT");
        return receipt;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
export type CareService = ReturnType<typeof careService>;
