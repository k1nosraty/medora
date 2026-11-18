import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { Journal } from "../../apps/web/src/storage/journal";
it("retains a pending write across restart and a conflicting pull, then applies its own receipt atomically", async () => {
  const name = "queue-" + crypto.randomUUID();
  let db = new Journal(name);
  const body = { amount: 200, day: 10, time: "09:00" };
  await db.save("owner", "id", body, 0);
  db.close();
  db = new Journal(name);
  const op = (await db.queue.toArray())[0]!;
  await db.apply(
    "owner",
    [{ ...op, operation: crypto.randomUUID(), cursor: 1 }],
    0,
  );
  expect(await db.queue.count()).toBe(1);
  expect((await db.conflicts.get(["owner", "id"]))?.revision).toBe(1);
  await db.resolve("owner", "id", 1, "local");
  const retry = (await db.queue.toArray())[0]!;
  expect(retry.baseRevision).toBe(1);
  await db.apply("owner", [{ ...retry, cursor: 2 }], 1);
  expect(await db.queue.count()).toBe(0);
  expect((await db.entries("owner", 10))[0]?.revision).toBe(2);
  expect(await db.entries("another", 10)).toEqual([]);
  db.close();
});
