import test from "node:test";
import assert from "node:assert/strict";
import {
  careDelta,
  applyCareDelta,
  preserveCareExtensions,
} from "../public/medication/domain/care-delta.js";
test("mixed program changes, keyed removals, encrypted values and water ordering round-trip", () => {
  const base = {
    water: [
      { id: "a", amount: 30 },
      { id: "b", amount: 40 },
    ],
    medicines: { m: { stock: 100 } },
    visits: { v: { privateText: "opaque" } },
    doses: { "m|1|1": {} },
    routines: { r: {} },
    routineLogs: {},
    cycleDays: { 1: {} },
    cycleRecords: {},
    sleepRecords: {},
    settings: { theme: "dark" },
  };
  const next = structuredClone(base);
  next.water = [{ id: "c", amount: 70 }, base.water[0]];
  next.medicines.m.stock = 90;
  next.visits.v.privateText = "sealed";
  delete next.routines.r;
  next.routineLogs["1"] = { r: { done: true } };
  next.cycleDays["1"].flow = "light";
  next.sleepRecords.s = { nap: true };
  next.settings.theme = "system";
  next.privacyVersion = 1;
  const delta = careDelta(base, next);
  assert.ok(delta.some((c) => c[0] === "waterOrder"));
  assert.deepEqual(applyCareDelta(base, delta), next);
  assert.equal(base.medicines.m.stock, 100);
  assert.equal(base.water[1].id, "b");
});
test("older collections, unknown extensions and malformed order are handled explicitly", () => {
  const legacy = {
    water: [{ id: "repeat" }, { id: "repeat" }],
    extension: { format: 7 },
  };
  assert.equal(careDelta(legacy, { water: [] }), null);
  assert.deepEqual(preserveCareExtensions(legacy, { water: [] }), {
    extension: { format: 7 },
    water: [],
  });
  assert.throws(
    () =>
      applyCareDelta({ water: [{ id: "a" }] }, [
        ["waterOrder", null, ["missing"]],
      ]),
    /invalid_delta/,
  );
});

test("bulk replacement cannot acknowledge a changed unknown extension", () => {
  const before = { water: [], future: { revision: 1 } };
  const water = Array.from({ length: 4100 }, (_, i) => ({
    id: "w" + i,
    amount: 50,
  }));
  const after = { water, future: before.future };
  assert.deepEqual(applyCareDelta(before, careDelta(before, after)), after);
  assert.equal(careDelta(before, { ...after, future: { revision: 2 } }), null);
});
