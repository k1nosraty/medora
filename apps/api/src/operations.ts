import type { Pool, PoolClient } from "pg";
import type { Repository } from "./repository";

const day = 86_400_000;
const tehranDay = () => Math.floor((Date.now() + 12_600_000) / day);

export interface OperationsEnv {
  ADMIN_EMAIL?: string;
  SUPPORT_EMAILS?: string;
}
export interface OperationsConfig {
  flags: { promotions: number; support: number };
  notice: {
    title: string;
    message: string;
    enabled: boolean;
    start: number | null;
    end: number | null;
  } | null;
}
type Diagnostics = {
  version: string;
  platform: string;
  permission: string;
} | null;

export function operationService(
  pool: Pool,
  repo: Repository,
  env: OperationsEnv,
) {
  const admins = env.ADMIN_EMAIL?.trim().toLowerCase();
  const support =
    env.SUPPORT_EMAILS?.split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean) ?? [];
  const role = (email: string) =>
    email === admins ? "admin" : support.includes(email) ? "support" : null;
  async function config(connection: Pool | PoolClient = pool) {
    const { rows } = await connection.query<{ config: OperationsConfig }>(
      "SELECT config FROM medora.operations_config WHERE singleton",
    );
    const stored = rows[0]!.config;
    return {
      ...stored,
      flags: {
        promotions: stored.flags?.promotions ?? 100,
        support: stored.flags?.support ?? 100,
      },
    };
  }
  async function transactional<T>(work: (c: PoolClient) => Promise<T>) {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT medora.lock_writer()");
      // Use the singleton to serialize ticket quotas and dashboard edits.
      await c.query(
        "SELECT singleton FROM medora.operations_config WHERE singleton FOR UPDATE",
      );
      const result = await work(c);
      await c.query("COMMIT");
      return result;
    } catch (error) {
      await c.query("ROLLBACK");
      throw error;
    } finally {
      c.release();
    }
  }
  function prune(c: Pool | PoolClient, now: number) {
    return c.query(
      "DELETE FROM medora.operations_tickets WHERE (status='closed' AND at<$1) OR at<$2",
      [now - 90 * day, now - 180 * day],
    );
  }
  async function audit(c: PoolClient, actor: string, action: string) {
    await c.query(
      "INSERT INTO medora.operations_audit(at,actor,action) VALUES($1,$2,$3)",
      [Date.now(), actor, action],
    );
    await c.query(
      "DELETE FROM medora.operations_audit WHERE id<=(SELECT max(id)-200 FROM medora.operations_audit)",
    );
  }
  return {
    log: (actor: string, action: string, connection?: PoolClient) =>
      connection
        ? audit(connection, actor, action)
        : transactional((c) => audit(c, actor, action)),
    async dashboard() {
      const today = tehranDay();
      const [settings, activity, counters, events, sizes] = await Promise.all([
        config(),
        pool.query(
          "SELECT day,count::float8 FROM medora.operations_counters WHERE metric='activity:open' AND day >= $1 ORDER BY day",
          [today - 13],
        ),
        pool.query(
          "SELECT metric,sum(count)::float8 AS count FROM medora.operations_counters WHERE day >= $1 GROUP BY metric",
          [today - 6],
        ),
        pool.query(
          "SELECT at::float8,actor,action FROM medora.operations_audit ORDER BY id DESC LIMIT 30",
        ),
        pool.query(`SELECT pg_total_relation_size('medora.promotion_values')::float8 AS promotions,
          pg_total_relation_size('medora.accounts')::float8 AS accounts,
          (pg_total_relation_size('medora.operations_tickets')+pg_total_relation_size('medora.operations_audit')+
           pg_total_relation_size('medora.operations_config')+pg_total_relation_size('medora.operations_counters'))::float8 AS operations`),
      ]);
      return {
        ...settings,
        activity: activity.rows,
        counters: counters.rows,
        audit: events.rows,
        storage: sizes.rows[0],
      };
    },
    saveConfig(next: OperationsConfig, email: string) {
      return transactional(async (c) => {
        await c.query(
          "UPDATE medora.operations_config SET config=$1 WHERE singleton",
          [JSON.stringify(next)],
        );
        await audit(c, email, "operations_updated");
      });
    },
    supportAccounts: support.length,
    role,
    config,
    async count(metrics: string[], connection: Pool | PoolClient = pool) {
      if (!metrics.length) return;
      const current = tehranDay();
      await connection.query(
        `INSERT INTO medora.operations_counters(day,metric,count)
        SELECT $1,metric,n FROM (SELECT metric,count(*) AS n FROM unnest($2::text[]) metric GROUP BY metric) counts
        ON CONFLICT(day,metric) DO UPDATE SET count=medora.operations_counters.count+excluded.count`,
        [current, metrics],
      );
    },
    budget: () => repo.loginBudget("operations-activity", 900),
    async tickets(email?: string) {
      const result = email
        ? await pool.query(
            `SELECT id,at::float8,message,reply,status
        FROM medora.operations_tickets WHERE email=$1 ORDER BY at DESC LIMIT 30`,
            [email],
          )
        : await pool.query(`SELECT id,email,at::float8,message,diagnostics,reply,status
          FROM medora.operations_tickets ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END,at DESC LIMIT 100`);
      return result.rows;
    },
    addTicket(email: string, message: string, diagnostics: Diagnostics) {
      return transactional(async (c) => {
        if ((await config(c)).flags.support === 0) return { disabled: true };
        const now = Date.now();
        const recent = await c.query(
          "SELECT 1 FROM medora.operations_tickets WHERE email=$1 AND at >= $2 LIMIT 5",
          [email, now - day],
        );
        if (recent.rowCount === 5) return { ticket: null };
        await prune(c, now);
        const total = await c.query(
          "SELECT 1 FROM medora.operations_tickets LIMIT 2000",
        );
        if (total.rowCount === 2000) return { ticket: null };
        const ticket = {
          id: crypto.randomUUID(),
          at: now,
          message,
          reply: "",
          status: "open",
        };
        await c.query(
          "INSERT INTO medora.operations_tickets(id,email,at,message,diagnostics) VALUES($1,$2,$3,$4,$5)",
          [ticket.id, email, now, message, JSON.stringify(diagnostics)],
        );
        return { ticket };
      });
    },
    replyTicket(id: string, reply: string, status: string, email: string) {
      return transactional(async (c) => {
        const updated = await c.query(
          "UPDATE medora.operations_tickets SET reply=$2,status=$3 WHERE id=$1",
          [id, reply, status],
        );
        if (!updated.rowCount) return false;
        await audit(c, email, "ticket_updated");
        return true;
      });
    },
    async maintenance() {
      if ((await repo.productWriter()) !== "postgres") return;
      await prune(pool, Date.now());
      await pool.query("DELETE FROM medora.operations_counters WHERE day<$1", [
        tehranDay() - 30,
      ]);
    },
  };
}
