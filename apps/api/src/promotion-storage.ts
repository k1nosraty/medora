import type { Pool, PoolClient } from "pg";
type Entry = { key: string; value: unknown; bytes: Buffer | null };

export class PromotionStorage {
  constructor(
    private pool: Pool,
    private connection?: PoolClient,
  ) {}

  async get(keys: string | string[]) {
    const { rows } = await (this.connection ?? this.pool).query<Entry>(
      "SELECT key,value,bytes FROM medora.promotion_values WHERE key=ANY($1::text[])",
      [typeof keys === "string" ? [keys] : keys],
    );
    const values = new Map(
      rows.map((row) => [row.key, row.bytes ?? row.value]),
    );
    return typeof keys === "string" ? values.get(keys) : values;
  }
  async put(key: string | Record<string, unknown>, value?: unknown) {
    if (!this.connection) throw Error("Campaign transaction required");
    const entries = typeof key === "string" ? { [key]: value } : key;
    for (const [name, entry] of Object.entries(entries)) {
      const binary = entry instanceof Uint8Array;
      await this.connection.query(
        `INSERT INTO medora.promotion_values(key,value,bytes) VALUES($1,$2,$3)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value,bytes=excluded.bytes`,
        [name, binary ? null : JSON.stringify(entry), binary ? entry : null],
      );
    }
  }
  async delete(keys: string | string[]) {
    if (!this.connection) throw Error("Campaign transaction required");
    await this.connection.query(
      "DELETE FROM medora.promotion_values WHERE key=ANY($1::text[])",
      [typeof keys === "string" ? [keys] : keys],
    );
  }
  async transaction<T>(work: (storage: PromotionStorage) => Promise<T>) {
    const connection = await this.pool.connect();
    try {
      await connection.query("BEGIN");
      await connection.query("SELECT medora.lock_writer()");
      await connection.query("SELECT pg_advisory_xact_lock(694211261)");
      const result = await work(new PromotionStorage(this.pool, connection));
      await connection.query("COMMIT");
      return result;
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      connection.release();
    }
  }
}
