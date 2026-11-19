import assert from "node:assert/strict";
import test from "node:test";
import { ReminderDevice } from "../../packages/server-shared/src/reminders/device.mjs";
import { portablePush } from "../../packages/server-shared/src/reminders/push.mjs";

test("paused delivery is distinct from a disabled or pending device schedule", async () => {
  const values = new Map();
  const storage = {
    transaction: (action) => action(storage),
    get: (key) => values.get(key),
    put: (key, value) => values.set(key, value),
    deleteAlarm: () => {},
  };
  let paused = true;
  const device = new ReminderDevice(storage, {
    paused: () => paused,
    accountRevision: () => 2,
    send: portablePush({}, true),
  });
  const plan = { zone: "UTC", rules: [], subscription: {}, language: "en" };
  const saved = await device.replace(1, plan, { owner: "fixture", revision: 1, details: false });
  assert.equal(saved.enabled, true);
  assert.equal(saved.deliveryPaused, true);
  const status = await device.status();
  assert.equal(status.deliveryPaused, true);
  assert.equal(status.accountSchedule.status, "pending");
  assert.deepEqual(await device.test(), { status: "paused" });
  paused = false;
  assert.equal((await device.status()).deliveryPaused, undefined);
  assert.equal((await device.status()).accountSchedule.status, "pending");
  paused = true;
  assert.equal((await device.replace(2, null)).deliveryPaused, undefined);
});
