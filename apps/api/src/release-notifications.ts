import type { Pool, PoolClient } from "pg";
import { pilotConfig } from "../../../web/src/http/validation.mjs";
import { portablePush } from "../../../web/src/reminders/push.mjs";
import { sendReleaseNotice } from "../../../web/src/reminders/release.mjs";
import type { PushEnv } from "./reminders";
import { withReminder } from "./reminder-storage";
import type { Repository } from "./repository";
import type { operationService } from "./operations";

export interface ReleaseEnv extends PushEnv {
  MEDORA_RELEASE?: string;
  MEDORA_MAINTENANCE?: string;
}
interface Batch {
  version: string;
  after: string;
  attempt?: number;
  readyAt?: number;
  runningUntil?: number;
  done?: boolean;
}
type Sender = ReturnType<typeof portablePush>;
const page = 12;

export function releaseNotifications(
  pool: Pool,
  repo: Repository,
  operations: ReturnType<typeof operationService>,
  env: ReleaseEnv,
  sender?: Sender,
) {
  const version = env.MEDORA_RELEASE;
  if (!version || !/^[a-f0-9]{40}$/.test(version)) return;
  const config = pilotConfig(env);
  const send = sender ?? (config ? portablePush(config, false) : undefined);
  if (!send) return;
  const delivery = send;
  const paused = () =>
    env.MEDORA_PAUSE_PUSH === "true" || env.MEDORA_MAINTENANCE === "true";
  async function locked<T>(
    work: (c: PoolClient, batch: Batch | null) => Promise<T>,
  ) {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT medora.lock_writer()");
      const {
        rows: [row],
      } = await c.query<{ batch: Batch | null }>(
        "SELECT batch FROM medora.release_batches WHERE singleton FOR UPDATE",
      );
      const result = await work(c, row!.batch);
      await c.query("COMMIT");
      return result;
    } catch (error) {
      await c.query("ROLLBACK");
      throw error;
    } finally {
      c.release();
    }
  }
  const store = (c: PoolClient, batch: Batch) =>
    c.query("UPDATE medora.release_batches SET batch=$1 WHERE singleton", [
      JSON.stringify(batch),
    ]);
  async function publish() {
    if (paused()) return "paused";
    return locked(async (c, batch) => {
      if (batch && batch.version === version)
        return batch.done ? "complete" : "queued";
      await store(c, {
        version: version!,
        after: "",
        readyAt: Date.now() + 1000,
      });
      return "queued";
    });
  }
  return {
    version,
    publish,
    async tick() {
      if (paused() || (await repo.productWriter()) !== "postgres") return;
      const phase = await publish();
      if (phase !== "queued") return;
      const job = await locked(async (c, batch) => {
        const now = Date.now();
        if (
          !batch ||
          batch.version !== version ||
          batch.done ||
          (batch.readyAt ?? 0) > now ||
          (batch.runningUntil ?? 0) > now
        )
          return;
        const { rows } = await c.query<{ id: string }>(
          "SELECT id FROM medora.reminder_devices WHERE id>$1 ORDER BY id LIMIT $2",
          [batch.after, page],
        );
        const runningUntil = now + 180_000;
        await store(c, { ...batch, runningUntil });
        return { batch, runningUntil, ids: rows.map(({ id }) => id) };
      });
      if (!job) return;
      let retry = false;
      for (const id of job.ids) {
        const result = await withReminder(
          pool,
          id,
          "scheduled",
          async (device, c) => {
            const current = await c.query(
              "SELECT 1 FROM medora.release_batches WHERE singleton AND batch->>'version'=$1 AND (batch->>'runningUntil')::bigint=$2 FOR SHARE",
              [version, job.runningUntil],
            );
            if (!current.rowCount || device.get("release-sent") === version)
              return false;
            const state = device.get("state") as
              | { plan?: { subscription?: unknown; language?: string } }
              | undefined;
            if (!state?.plan?.subscription) return false;
            const outcome = await sendReleaseNotice(
              delivery,
              state.plan,
              version,
              async () => true,
            );
            await operations.count(["release:" + outcome.status], c);
            if (!outcome.retry) {
              device.delete(["release-send"]);
              device.put("release-sent", version);
            }
            return outcome.retry;
          },
        );
        retry ||= result !== false;
      }
      await locked(async (c, current) => {
        if (
          current?.version !== version ||
          current.runningUntil !== job.runningUntil
        )
          return;
        const { batch, ids } = job;
        if (retry && (batch.attempt ?? 0) < 2)
          await store(c, {
            version,
            after: batch.after,
            attempt: (batch.attempt ?? 0) + 1,
            readyAt: Date.now() + 30_000,
          });
        else
          await store(c, {
            version,
            after: ids.at(-1) ?? batch.after,
            done: ids.length < page,
          });
      });
    },
  };
}
