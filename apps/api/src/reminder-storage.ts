import type { Pool, PoolClient } from "pg";

type Stored = {
  id: string;
  values: Record<string, unknown>;
  wake: string | null;
};

class ReminderStorage {
  readonly values: Stored["values"];
  private wake: number | null;
  changed = false;

  constructor(row?: Stored) {
    this.values = row?.values ?? {};
    this.wake = row?.wake == null ? null : Number(row.wake);
  }
  get(key: string) {
    return this.values[key];
  }
  put(key: string, value: unknown) {
    this.values[key] = value;
    this.changed = true;
  }
  delete(keys: string[]) {
    for (const key of keys) delete this.values[key];
    this.changed = true;
  }
  getAlarm() {
    return this.wake;
  }
  setAlarm(value: number) {
    this.wake = value;
    this.changed = true;
  }
  deleteAlarm() {
    this.wake = null;
    this.changed = true;
  }
  async transaction<T>(work: (store: this) => Promise<T>) {
    return work(this);
  }
  async save(c: PoolClient, id: string) {
    if (!this.changed) return;
    await c.query(
      "UPDATE medora.reminder_devices SET values=$2,wake=$3 WHERE id=$1",
      [id, JSON.stringify(this.values), this.wake],
    );
  }
}

export async function withReminder<T>(
  pool: Pool,
  id: string,
  mode: "read" | "write" | "scheduled",
  work: (storage: ReminderStorage, connection: PoolClient) => Promise<T>,
) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    if (mode !== "read") await c.query("SELECT medora.lock_writer()");
    if (mode === "write") {
      await c.query(
        "INSERT INTO medora.reminder_devices(id) VALUES($1) ON CONFLICT DO NOTHING",
        [id],
      );
    }
    const lock =
      mode === "scheduled"
        ? " FOR UPDATE SKIP LOCKED"
        : mode === "write"
          ? " FOR UPDATE"
          : "";
    const result = await c.query<Stored>(
      "SELECT * FROM medora.reminder_devices WHERE id=$1" + lock,
      [id],
    );
    const row = result.rows[0];
    const storage = new ReminderStorage(row);
    const response =
      row || mode !== "scheduled" ? await work(storage, c) : undefined;
    await storage.save(c, id);
    await c.query("COMMIT");
    return response;
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
}
