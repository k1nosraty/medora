import { eraseAccount, removeBackupObjects } from "./account-deletion";
import type { ObjectStorage } from "./objects";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";
import type { operationService } from "./operations";

interface AccountRow {
  id: string;
  email: string;
  username: string;
  created_at: string | null;
  password_salt: string;
}
type Session = { digest: string; legacy: boolean };

export function adminAccounts(
  pool: Pool,
  operations: ReturnType<typeof operationService>,
  key: string | undefined,
  storage?: ObjectStorage,
) {
  if (!key || !/^[a-f0-9]{64}$/i.test(key)) return;
  const tag = (row: AccountRow) =>
    createHmac("sha256", key)
      .update("delete-account-v1:" + row.id + ":" + row.password_salt)
      .digest();
  return {
    async list(after: string, search: string) {
      const { rows } = await pool.query<AccountRow>(
        `SELECT id,email,username,created_at,password_salt FROM medora.accounts
        WHERE sync_generation=2 AND username COLLATE "C">$1 AND (position($2 in username)>0 OR position($2 in email)>0)
        ORDER BY username COLLATE "C" LIMIT 26`,
        [after, search],
      );
      const users = rows.slice(0, 25).map((row) => ({
        email: row.email,
        username: row.username,
        createdAt: row.created_at === null ? null : Number(row.created_at),
        admin: operations.role(row.email) === "admin",
        emailVerified: true,
        tag: tag(row).toString("hex"),
      }));
      return { users, next: rows.length > 25 ? users.at(-1)!.username : null };
    },
    async change(
      actor: string,
      session: Session,
      username: string,
      priorTag: string,
      remove: boolean,
    ) {
      const c = await pool.connect();
      let committed = false;
      try {
        await c.query("BEGIN");
        await c.query("SELECT medora.lock_writer()");
        const cutoff =
          Date.now() + (session.legacy ? 30 : 1) * 86_400_000 - 600_000;
        const active = await c.query(
          `SELECT 1 FROM medora.${session.legacy ? "legacy_session_access" : "sessions"}
          WHERE owner=$1 AND digest=$2 AND expires_at>$3 FOR SHARE`,
          [actor, session.digest, cutoff],
        );
        if (!active.rowCount) return { error: "reauthenticate" as const };
        const {
          rows: [target],
        } = await c.query<AccountRow>(
          `SELECT id,email,username,created_at,password_salt
          FROM medora.accounts WHERE sync_generation=2 AND username=$1 FOR UPDATE`,
          [username],
        );
        if (
          !target ||
          !timingSafeEqual(tag(target), Buffer.from(priorTag, "hex"))
        )
          return { error: "account_changed" as const };
        if (operations.role(target.email) === "admin")
          return { error: "protected_account" as const };
        const counts = remove
          ? await eraseAccount(c, target.id, target.email)
          : null;
        if (!remove) {
          await c.query("DELETE FROM medora.sessions WHERE owner=$1", [
            target.id,
          ]);
          await c.query(
            "DELETE FROM medora.legacy_session_access WHERE owner=$1",
            [target.id],
          );
        }
        await operations.log(
          (
            await c.query<{ email: string }>(
              "SELECT email FROM medora.accounts WHERE id=$1",
              [actor],
            )
          ).rows[0]!.email,
          remove ? "account_removed" : "sessions_revoked",
          c,
        );
        await c.query("COMMIT");
        committed = true;
        if (!counts) return {};
        // Release this connection before opening the object cleanup transaction.
        c.release();
        await removeBackupObjects(pool, storage, target.id).catch(() => {});
        const pending = await pool.query(
          "SELECT count(*)::int n FROM medora.backup_cleanup WHERE owner=$1",
          [target.id],
        );
        const remainingBackups = pending.rows[0].n;
        return {
          cleanup: remainingBackups
            ? {
                status: "pending",
                ...counts,
                remainingDevices: 0,
                familyPending: false,
                remainingBackups,
              }
            : { status: "complete", ...counts },
        };
      } finally {
        if (!committed || !remove) {
          try {
            if (!committed) await c.query("ROLLBACK");
          } finally {
            c.release();
          }
        }
      }
    },
  };
}
