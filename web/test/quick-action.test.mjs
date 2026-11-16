import assert from "node:assert/strict";
import test from "node:test";
import { quickActions } from "../public/medication/features/family/quick-action.js";

test("quick family retry reuses both the operation ID and time until acknowledgement", () => {
  let count = 0;
  const actions = quickActions({ id: () => String(++count), now: () => 0 });
  assert.equal(actions.start("water", () => "08:00").operation, "1");
  assert.equal(actions.start("water", () => "08:01"), null);
  actions.finish("water", false);
  const retry = actions.start("water", () => "08:02");
  assert.equal(retry.operation, "1");
  assert.equal(retry.time, "08:00");
  actions.finish("water", true);
  assert.equal(actions.start("water", () => "08:03").operation, "2");
});

test("a browser reload retains an unacknowledged quick action", () => {
  let saved = null;
  const storage = { getItem: () => saved, setItem(_key, value) { saved = value; } };
  const make = () => quickActions({ id: () => crypto.randomUUID(), now: () => 0, storage });
  const original = make().start("water", () => "08:00");
  const afterReload = make();
  assert.deepEqual(afterReload.start("water", () => "08:01"), original);
  afterReload.finish("water", true);
  assert.notEqual(make().start("water", () => "08:02").operation, original.operation);
});
