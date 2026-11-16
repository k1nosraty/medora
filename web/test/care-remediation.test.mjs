import assert from "node:assert/strict";
import test from "node:test";
import { assertRestoreRevision, restoreTarget } from "../public/medication/domain/restore-intent.js";
import { saveMedicinePlan } from "../public/medication/domain/medicine-command.js";
import { CareConflict, conflictChoice, mergeCare, mergeRestoredCare } from "../public/medication/features/sync/merge.js";
import { emptyCareRecords, sharedCare } from "../public/medication/domain/family.js";
import { validateCareRecords } from "../public/medication/domain/care-records.js";
import { reminderCareProjection } from "../public/medication/domain/care-plan.js";

test("replacement is scoped to the confirmed revision and recognizes a lost acknowledgement", () => {
  const cloud = { owner: "a".repeat(64), revision: 4 };
  const replacement = restoreTarget("replace", cloud);
  assert.throws(() => assertRestoreRevision(replacement, { ...cloud, revision: 5 }, false), /restore_conflict/);
  assert.doesNotThrow(() => assertRestoreRevision(replacement, { ...cloud, revision: 5 }, true));
  assert.throws(() => assertRestoreRevision(replacement, { ...cloud, owner: "b".repeat(64) }, true), /restore_conflict/);
  assert.throws(() => restoreTarget("replace", { ...cloud, revision: 0.5 }), /invalid_restore_target/);
});

test("conflicting dose outcomes and incompatible medication schedule edits keep both stores intact", () => {
  const medicine = { id: "m", name: "Synthetic", unit: "tablet", dates: [20000],
    phases: [{ start: 20000, end: null, interval: 1, mask: 127, slots: [{ minute: 480, amount: 1000 }] }] };
  const dose = { status: null, actual: null, debit: 0, medicineId: "m", day: 20000, minute: 480 };
  const base = { medicines: { m: medicine }, doses: { "m|20000|480": dose } };
  const taken = { ...base, doses: { "m|20000|480": { ...dose, status: "taken", actual: 1000 } } };
  const skipped = { ...base, doses: { "m|20000|480": { ...dose, status: "skipped" } } };
  assert.throws(() => mergeCare(base, taken, skipped), /care_conflict/);
  const localNote = { ...taken, doses: { "m|20000|480": { ...taken.doses["m|20000|480"], instructions: "Local note" } } };
  const cloudNote = { ...taken, doses: { "m|20000|480": { ...taken.doses["m|20000|480"], instructions: "Cloud note" } } };
  assert.throws(() => mergeCare(taken, localNote, cloudNote), /care_conflict/);
  const dates = { ...base, medicines: { m: { ...medicine, dates: [20001] } } };
  const phases = { ...base, medicines: { m: { ...medicine, phases: [{ ...medicine.phases[0], mask: 1 }] } } };
  assert.throws(() => mergeCare(base, dates, phases), /care_conflict/);
  assert.throws(() => mergeCare(base, { ...base, medicines: {} }, phases), /care_conflict/);
  assert.deepEqual(mergeRestoredCare(taken, skipped).doses, skipped.doses);
  assert.equal(taken.doses["m|20000|480"].status, "taken");
});

test("medicine edits check the current revision and preserve tracked units and stock", () => {
  const plan = { id: "m", name: "Synthetic", unit: "tablet", stock: 10 };
  const state = { medicines: {} };
  assert.equal(saveMedicinePlan(state, plan, null, 1), true);
  assert.equal(saveMedicinePlan(state, { ...plan, stock: 999 }, 0, 2), false);
  assert.equal(saveMedicinePlan(state, { ...plan, unit: "ml", stock: 999 }, 1, 3), true);
  assert.equal(state.medicines.m.unit, "tablet");
  assert.equal(state.medicines.m.stock, 10);
  assert.equal(state.medicines.m.revision, 2);
});

test("reminder projection excludes private text, profiles, old history, and routine step descriptions", () => {
  const day = 20_000;
  const source = { settings: { personalProfile: { weightKg: 42 }, waterGoal: 1000 },
    doses: { old: { day: day - 3, status: "taken" }, postponed: { day: day - 3, status: "snoozed", snoozeUntil: day * 86_400_000 + 1 } },
    visits: { v: { day, time: "12:00", note: "Synthetic note" } },
    routineLogs: { [day]: { r: { mode: "steps", checked: [0], steps: ["Private step"] } } },
    cycleRecords: { [day]: { note: "Synthetic cycle" } } };
  const projected = reminderCareProjection(source, day * 86_400_000);
  assert.deepEqual(projected.settings, { waterGoal: 1000 });
  assert.deepEqual(Object.keys(projected.doses), ["postponed"]);
  assert.deepEqual(projected.routineLogs[day].r, { mode: "done", done: true });
  assert.doesNotMatch(JSON.stringify(projected), /Synthetic note|Private step|Synthetic cycle|weightKg/);
});

test("versioned care writes reject duplicate identities, while legacy data remains recoverable", () => {
  const water = { id: "water", day: 20000, time: "10:00", amount: 250 };
  const legacy = { ...emptyCareRecords(), water: [water, water] };
  assert.doesNotThrow(() => validateCareRecords(legacy));
  assert.throws(() => mergeCare(null, legacy, null), /invalid_backup/);
  assert.throws(() => validateCareRecords({ ...legacy, careSchemaVersion: 1 }), /invalid_backup/);
  assert.doesNotThrow(() => validateCareRecords({ ...legacy, water: [water], careSchemaVersion: 1 }));
});


test("a choice is scoped to the competing record versions and independent edits still merge", () => {
  const original = { id: "visit", name: "Synthetic", day: 20000, time: "09:00" };
  const base = { visits: { visit: original } };
  const local = { visits: { visit: { ...original, time: "10:00" } }, settings: { waterGoal: 1000 } };
  const cloud = { visits: { visit: { ...original, time: "11:00" } } };
  let choices = [];
  assert.throws(() => mergeCare(base, local, cloud), error => {
    assert.ok(error instanceof CareConflict);
    assert.deepEqual(error.path, ["visits", "visit"]);
    choices = [{ ...error, side: "cloud" }];
    return true;
  });
  const merged = mergeCare(base, local, cloud, conflict => conflictChoice(conflict, choices));
  assert.equal(merged.visits.visit.time, "11:00");
  assert.equal(merged.settings.waterGoal, 1000);
  assert.throws(() => mergeCare(base, local, { visits: { visit: { ...original, time: "12:00" } } },
    conflict => conflictChoice(conflict, choices)), /care_conflict/);
});

test("bounded snapshots reject oversized and deeply nested extensions without invalidating legacy reads", () => {
  const visit = { id: "v", name: "Synthetic", day: 20000, time: "09:00", note: "x".repeat(17_000) };
  const legacy = { ...emptyCareRecords(), visits: { v: visit } };
  assert.doesNotThrow(() => validateCareRecords(legacy));
  assert.throws(() => validateCareRecords({ ...legacy, careSchemaVersion: 2 }), /invalid_backup/);
  let extension = {};
  for (let i = 0; i < 15; i++) extension = { nested: extension };
  assert.throws(() => validateCareRecords({ ...emptyCareRecords(), extension, careSchemaVersion: 2 }), /invalid_backup/);
  assert.throws(() => validateCareRecords({ ...emptyCareRecords(), careSchemaVersion: 3 }), /invalid_backup/);
});

test("family projections exclude unknown fields and deeply nested legacy extensions", () => {
  const source = { ...emptyCareRecords(), medicines: { sample: {
    id: "sample", name: "Synthetic", unit: "tablet", sharedInstructions: "Share this",
    extension: "private legacy extra",
    phases: [{ start: 20000, end: null, interval: 1, mask: 127, slots: [{ minute: 480, amount: 1000, extension: "private slot extra" }] }]
  } }, water: [{ id: "water", day: 20000, time: "10:00", amount: 200, extension: "private water extra" }] };
  const view = sharedCare(source, ["medicines", "water"]);
  assert.equal(view.medicines.sample.sharedInstructions, "Share this");
  assert.equal(view.medicines.sample.phases[0].slots[0].amount, 1000);
  assert.equal(view.water[0].amount, 200);
  assert.doesNotMatch(JSON.stringify(view), /private .* extra/);
});
