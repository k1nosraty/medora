import type { Pool, PoolClient } from "pg";
import {
  createHmac,
  randomBytes,
  randomInt,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { Conflict, type Repository } from "./repository";

export interface IdentitySettings {
  codeKey: string;
  passwordKey: string;
  passwordKeyId: string;
  mailKey: string;
}
export interface Mail {
  email: string;
  code: string;
  purpose: "register" | "reset";
}
export type Delivery = (mail: Mail, id: string) => Promise<void>;
async function transaction<T>(pool: Pool, work: (c: PoolClient) => Promise<T>) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const r = await work(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
const hmac = (key: string, data: string) =>
  createHmac("sha256", key).update(data).digest("hex");
const hexBytes = (v: string) => Uint8Array.from(Buffer.from(v, "hex"));
async function mailKey(key: string) {
  return crypto.subtle.importKey("raw", hexBytes(key), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
const proof = (key: string, id: string, code: string) =>
  hmac(key, "challenge:" + id + ":" + code);

export function identityService(
  pool: Pool,
  store: Repository,
  settings: IdentitySettings,
  deliver: Delivery,
) {
  const { passwordKey, passwordKeyId, codeKey } = settings;
  for (const k of [passwordKey, codeKey, settings.mailKey])
    if (!/^[a-f0-9]{64}$/i.test(k)) throw Error("Invalid identity key");
  const key = mailKey(settings.mailKey);
  return {
    async begin(email: string, purpose: Mail["purpose"]) {
      if (
        !(await store.loginBudget("service")) ||
        !(await store.loginBudget(hmac(codeKey, "email:" + email)))
      )
        return null;
      const id = crypto.randomUUID(),
        code = String(randomInt(1000000)).padStart(6, "0");
      const iv = crypto.getRandomValues(new Uint8Array(12)),
        aad = new TextEncoder().encode(id);
      const cipher = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: aad },
        await key,
        new TextEncoder().encode(JSON.stringify({ email, purpose, code })),
      );
      await transaction(pool, async (c) => {
        await c.query(
          "INSERT INTO medora.challenges(id,email,purpose,proof,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes')",
          [id, email, purpose, proof(codeKey, id, code)],
        );
        const account = await c.query(
          "SELECT sync_generation FROM medora.accounts WHERE email=$1",
          [email],
        );
        if (
          (purpose === "register" && !account.rowCount) ||
          (purpose === "reset" && account.rows[0]?.sync_generation === 2)
        )
          await c.query(
            "INSERT INTO medora.mail_outbox(challenge,nonce,ciphertext) VALUES($1,$2,$3)",
            [id, Buffer.from(iv), Buffer.from(cipher)],
          );
      });
      return id;
    },
    async finish(
      id: string,
      code: string,
      password: string,
      username: string | undefined,
    ) {
      return transaction(pool, async (c) => {
        const result = await c.query(
          "SELECT email,purpose,proof FROM medora.challenges WHERE id=$1 AND expires_at>now() AND attempts<5 FOR UPDATE",
          [id],
        );
        const row = result.rows[0];
        if (
          !row ||
          !timingSafeEqual(
            Buffer.from(row.proof),
            Buffer.from(proof(codeKey, id, code)),
          )
        ) {
          if (row)
            await c.query(
              "UPDATE medora.challenges SET attempts=attempts+1 WHERE id=$1",
              [id],
            );
          return false;
        }
        const salt = randomBytes(16).toString("hex"),
          input = hmac(passwordKey, "password-v1:" + password);
        const hash = await new Promise<Buffer>((resolve, reject) =>
          scrypt(
            input,
            salt,
            32,
            { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 },
            (err, b) => (err ? reject(err) : resolve(b)),
          ),
        );
        if (row.purpose === "register") {
          if (!username) return false;
          const created = await c.query(
            "INSERT INTO medora.accounts(id,email,username,password_salt,password_proof,password_key,created_at,sync_generation) VALUES($1,$2,$3,$4,$5,$6,$7,2) ON CONFLICT DO NOTHING RETURNING id",
            [
              randomBytes(32).toString("hex"),
              row.email,
              username,
              salt,
              hash.toString("hex"),
              passwordKeyId,
              Date.now(),
            ],
          );
          if (!created.rowCount) throw new Conflict("account_unavailable");
        } else {
          const changed = await c.query(
            "UPDATE medora.accounts SET password_salt=$1,password_proof=$2,password_key=$3 WHERE email=$4 AND sync_generation=2 RETURNING id",
            [salt, hash.toString("hex"), passwordKeyId, row.email],
          );
          if (!changed.rowCount) return false;
          await c.query("DELETE FROM medora.sessions WHERE owner=$1", [
            changed.rows[0].id,
          ]);
        }
        await c.query(
          "DELETE FROM medora.challenges WHERE email=$1 AND purpose=$2",
          [row.email, row.purpose],
        );
        return true;
      });
    },
    async drain() {
      await pool.query("DELETE FROM medora.challenges WHERE expires_at<=now()");
      await pool.query(
        "DELETE FROM medora.login_attempts WHERE expires_at<=now()",
      );
      const lease = crypto.randomUUID();
      const pending = await pool.query(
        `UPDATE medora.mail_outbox q SET lease=$1,available_at=now()+interval '1 minute'
    FROM (SELECT q0.challenge FROM medora.mail_outbox q0 JOIN medora.challenges c ON c.id=q0.challenge
    WHERE q0.sent_at IS NULL AND q0.available_at<=now() AND c.expires_at>now() ORDER BY q0.available_at LIMIT 8 FOR UPDATE OF q0 SKIP LOCKED) jobs
    WHERE q.challenge=jobs.challenge RETURNING q.challenge,q.nonce,q.ciphertext`,
        [lease],
      );
      for (const job of pending.rows) {
        const decrypted = await crypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv: Uint8Array.from(job.nonce as Buffer),
            additionalData: new TextEncoder().encode(job.challenge),
          },
          await key,
          Uint8Array.from(job.ciphertext as Buffer),
        );
        const bytes = new Uint8Array(decrypted);
        try {
          await deliver(
            JSON.parse(new TextDecoder().decode(bytes)),
            job.challenge,
          );
          await pool.query(
            "UPDATE medora.mail_outbox SET sent_at=now(),ciphertext=''::bytea WHERE challenge=$1 AND lease=$2",
            [job.challenge, lease],
          );
        } finally {
          bytes.fill(0);
        }
      }
    },
  };
}
export type IdentityService = ReturnType<typeof identityService>;
