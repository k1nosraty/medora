import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import type { Change, Operation } from "@medora/contracts";

export class Conflict extends Error {}
interface ChangeRow extends Record<string, unknown> {
  operation: string; kind: "water"; id: string; baseRevision: string; body: Operation["body"]; cursor: string;
}
const fields = sql`operation, kind, record_id AS id, base_revision AS "baseRevision", body, cursor`;
function fromRow(row: ChangeRow): Change {
  return {...row, cursor: Number(row.cursor), baseRevision: Number(row.baseRevision)};
}

export function repository(pool: Pool) {
  const db = drizzle(pool);
  return {
    async ready() {
      await db.execute(sql`SELECT cursor FROM medora.accounts LIMIT 0`);
    },
    async credential(username: string) {
      const result = await db.execute<{id:string; password_key:string; password_salt:string; password_proof:string}>(sql`
        SELECT id, password_key, password_salt, password_proof FROM medora.accounts WHERE username = ${username} AND sync_generation=2`);
      return result.rows[0];
    },
    async loginBudget(bucket: string) {
      const result = await db.execute<{attempts:number}>(sql`INSERT INTO medora.login_attempts(bucket,attempts,expires_at)
        VALUES (${bucket},1, now() + interval '15 minutes') ON CONFLICT (bucket) DO UPDATE SET
        attempts=CASE WHEN medora.login_attempts.expires_at <= now() THEN 1 ELSE medora.login_attempts.attempts+1 END,
        expires_at=CASE WHEN medora.login_attempts.expires_at <= now() THEN excluded.expires_at ELSE medora.login_attempts.expires_at END
        RETURNING attempts`);
      return result.rows[0]!.attempts <= (bucket === "service" ? 1500 : 10);
    },
    async createSession(owner:string, digest:string, expires:number, proof:string) {
      const result = await db.execute(sql`INSERT INTO medora.sessions(owner,digest,expires_at) SELECT id,${digest},${expires} FROM medora.accounts WHERE id=${owner} AND password_proof=${proof} AND sync_generation=2 RETURNING owner`);
      return result.rows.length === 1;
    },
    async endSession(digest:string) {
      await db.execute(sql`DELETE FROM medora.sessions WHERE digest=${digest}`);
    },
    async session(digest:string) {
      const result = await db.execute<{owner:string}>(sql`SELECT owner FROM medora.sessions JOIN medora.accounts ON id=owner WHERE sync_generation=2 AND digest=${digest} AND expires_at>${Date.now()}`);
      return result.rows[0]?.owner;
    },
    async pull(owner:string, after:number) {
      const result = await db.execute<ChangeRow>(sql`SELECT ${fields} FROM medora.changes
        WHERE owner=${owner} AND cursor>${after} ORDER BY cursor LIMIT 100`);
      return result.rows.map(fromRow);
    },
    async push(owner:string, op:Operation):Promise<Change> {
      return db.transaction(async tx => {
        const locked = await tx.execute<{sync_generation:number}>(sql`SELECT sync_generation FROM medora.accounts WHERE id=${owner} FOR UPDATE`);
        if (locked.rows[0]?.sync_generation !== 2) throw new Conflict("legacy_writer_active");
        const body = op.body === null ? null : JSON.stringify(op.body);
        const prior = await tx.execute<ChangeRow & {matches:boolean}>(sql`SELECT ${fields},
          (kind=${op.kind} AND record_id=${op.id} AND base_revision=${op.baseRevision} AND body IS NOT DISTINCT FROM ${body}::jsonb) AS matches
          FROM medora.changes WHERE owner=${owner} AND operation=${op.operation}`);
        if (prior.rows[0]) {
          if (!prior.rows[0].matches) throw new Conflict("operation_reused");
          const {matches, ...row} = prior.rows[0];
          if (matches) return fromRow(row);
        }
        const current = await tx.execute<{revision:string}>(sql`SELECT revision FROM medora.records WHERE owner=${owner} AND kind=${op.kind} AND id=${op.id}`);
        if (Number(current.rows[0]?.revision ?? 0) !== op.baseRevision || (!current.rows.length && op.body === null)) throw new Conflict("stale_revision");
        const sequence = await tx.execute<{cursor:string}>(sql`UPDATE medora.accounts SET cursor=cursor+1 WHERE id=${owner} RETURNING cursor`);
        const cursor = Number(sequence.rows[0]!.cursor);
        await tx.execute(sql`INSERT INTO medora.records(owner,kind,id,revision,body) VALUES
          (${owner},${op.kind},${op.id},${cursor},${body}::jsonb) ON CONFLICT (owner,kind,id)
          DO UPDATE SET revision=excluded.revision,body=excluded.body`);
        await tx.execute(sql`INSERT INTO medora.changes(owner,cursor,kind,record_id,operation,base_revision,body)
          VALUES (${owner},${cursor},${op.kind},${op.id},${op.operation},${op.baseRevision},${body}::jsonb)`);
        return {...op,cursor};
      });
    }
  };
}
export type Repository = ReturnType<typeof repository>;
