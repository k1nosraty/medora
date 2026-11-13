import assert from "node:assert/strict";
import test from "node:test";
import { cycleForecast } from "../public/medication/domain/cycle.js";
import { canEnableCycle, cycleIsEnabled } from "../public/medication/domain/profile.js";
import { readWebBackup, writeWebBackup } from "../public/medication/features/backups/web-format.js";

test("Cycle is opt-in and unavailable on a profile marked male", () => {
  assert.equal(cycleIsEnabled({}), false);
  assert.equal(cycleIsEnabled({ gender: "female" }), false);
  assert.equal(canEnableCycle({ gender: "undisclosed" }), true);
  assert.equal(cycleIsEnabled({ gender: "undisclosed", cycleEnabled: true }), true);
  assert.equal(cycleIsEnabled({ gender: "male", cycleEnabled: true }), false);
});

test("the cycle estimate uses the range of recent intervals", () => {
  assert.equal(cycleForecast({ 10: {}, 38: {} }), null);
  assert.deepEqual(cycleForecast({ 101: {}, 10: {}, 72: {}, 1: {}, 40: {} }), { first: 130, last: 133 });
});

test("encrypted web backups round-trip optional profile, style and cycle records", async () => {
  const records = { medicines: {}, doses: {}, visits: {}, routines: {}, routineLogs: {}, water: [] };
  const state = { ...records, finish: "matte", accent: "berry", gender: "female", cycleEnabled: true,
    cycleRecords: { 20600: { end: 20603, flow: "light", note: "sample" } } };
  const password = "example test backup password";
  const validatePhases = () => true;
  for (const input of [records, state]) {
    const encrypted = await writeWebBackup(input, password, validatePhases);
    assert.deepEqual(await readWebBackup(encrypted, password, validatePhases), { ...input, intro: "done" });
  }
});
