import type { Pool } from "pg";
import { exportResponse } from "@medora/server-shared/operations/export";
import { CampaignStore } from "@medora/server-shared/promotions/campaigns";
import { PromotionStorage } from "./promotion-storage";
import type { operationService } from "./operations";

export function administrativeExport(
  pool: Pool,
  operations: ReturnType<typeof operationService>,
) {
  return async (actor: string) => {
    await operations.log(actor, "operations_exported");
    const connection = await pool.connect();
    try {
      await connection.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      return exportResponse({
        promotion: new CampaignStore(new PromotionStorage(pool, connection)),
        credentials: {
          async exportAccounts(after: string) {
            const result = await connection.query(
              `SELECT username,email,created_at::float8 AS created_at FROM medora.accounts
              WHERE sync_generation=2 AND username COLLATE "C">$1 ORDER BY username COLLATE "C" LIMIT 100`,
              [after],
            );
            return result.rows;
          },
        },
        store: {
          async exportData() {
            const config = await operations.config(connection);
            const counters = await connection.query(
              "SELECT day,metric,count::float8 FROM medora.operations_counters ORDER BY day,metric",
            );
            const audit = await connection.query(
              "SELECT id::float8,at::float8,actor,action FROM medora.operations_audit ORDER BY id",
            );
            const tickets = await connection.query(
              "SELECT id,email,at::float8,message,diagnostics,reply,status FROM medora.operations_tickets ORDER BY id",
            );
            return {
              config,
              counters: counters.rows,
              audit: audit.rows,
              tickets: tickets.rows,
            };
          },
        },
        async close() {
          try {
            await connection.query("ROLLBACK");
          } finally {
            connection.release();
          }
        },
      });
    } catch (error) {
      connection.release(true);
      throw error;
    }
  };
}
