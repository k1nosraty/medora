import { fixtureDatabase } from "../../scripts/verification/fixture-database.mjs";
import { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { repository } from "../../apps/api/src/repository";
import { operationService } from "../../apps/api/src/operations";
import { releaseNotifications } from "../../apps/api/src/release-notifications";

const database = fixtureDatabase(process.env.MEDORA_TEST_DATABASE_URL);
it.skipIf(!database)(
  "retries release delivery and remembers an acknowledged device across workers",
  async () => {
    const pool = new Pool({ connectionString: database! });
    const store = repository(pool),
      operations = operationService(pool, store, {});
    const version = "a".repeat(40),
      id = "c".repeat(32),
      neighbor = "d".repeat(32);
    const send = vi
      .fn()
      .mockResolvedValueOnce({ status: "rejected", providerStatus: 429 })
      .mockResolvedValue({ status: "accepted", providerStatus: 201 });
    const active = { ...store, productWriter: async () => "postgres" as const };
    const options = { MEDORA_RELEASE: version };
    const service = releaseNotifications(
      pool,
      active,
      operations,
      options,
      send,
    )!;
    const competing = releaseNotifications(
      pool,
      active,
      operations,
      options,
      send,
    )!;
    const ready = () =>
      pool.query(
        "UPDATE medora.release_batches SET batch=batch-'readyAt' WHERE singleton",
      );
    try {
      for (const device of [id, neighbor]) {
        await pool.query(
          "INSERT INTO medora.reminder_devices(id,values) VALUES($1,$2)",
          [
            device,
            JSON.stringify({
              state: {
                revision: 1,
                plan: { language: "en", subscription: { endpoint: device } },
              },
            }),
          ],
        );
      }
      expect(await service.status()).toBe("pending");
      expect(await service.status()).toBe("pending");
      await service.tick();
      expect(await service.status()).toBe("queued");
      await ready();
      await service.tick();
      expect(send).toHaveBeenCalledTimes(2);
      expect(
        (
          await pool.query(
            "SELECT batch->>'attempt' AS attempt FROM medora.release_batches",
          )
        ).rows[0].attempt,
      ).toBe("1");
      await ready();
      await Promise.all([service.tick(), competing.tick()]);
      expect(send).toHaveBeenCalledTimes(3);
      expect(
        send.mock.calls.map(([subscription]) => subscription.endpoint),
      ).toEqual([id, neighbor, id]);
      expect(send.mock.calls[2]?.[1]).toMatchObject({
        tag: "medora-release",
        release: version,
        title: "Medora has been updated",
      });
      expect(
        (
          await pool.query(
            "SELECT values->>'release-sent' AS sent FROM medora.reminder_devices WHERE id=$1",
            [id],
          )
        ).rows[0].sent,
      ).toBe(version);
      expect(await service.status()).toBe("complete");
      await competing.tick();
      expect(send).toHaveBeenCalledTimes(3);
    } finally {
      await pool.query(
        "DELETE FROM medora.reminder_devices WHERE id IN ($1,$2)",
        [id, neighbor],
      );
      await pool.query(
        "UPDATE medora.release_batches SET batch=NULL WHERE batch->>'version'=$1",
        [version],
      );
      await pool.end();
    }
  },
);
