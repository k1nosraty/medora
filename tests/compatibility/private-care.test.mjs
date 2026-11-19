import assert from "node:assert/strict";
import test from "node:test";
import { portable, validateCareRecords } from "../../packages/domain/src/browser/care-records.js";
import { emptyCareRecords, sharedCare } from "../../packages/domain/src/browser/family.js";
import { generateRecoveryKey, importRecoveryKey, openPrivateCare, sealPrivateCare } from "../../apps/web/product-assets/public/medication/features/sync/private-care.js";

test("protects private text while preserving readable schedules, legacy records and family permissions", async () => {
  const legacy = { ...emptyCareRecords(),
    visits: { a: { id: "a", name: "Synthetic visit", day: 20000, time: "09:30", note: "Private note",
      notes: "Legacy note", contact: "Private contact", sharedNote: "Caregiver note" } },
    cycleRecords: { 20000: { end: null, flow: "light", note: "Private cycle note" } } };
  const recovery = await importRecoveryKey(generateRecoveryKey());
  assert.equal(recovery.key.extractable, false);
  await assert.rejects(sealPrivateCare(legacy), /private_key/);
  const wire = await sealPrivateCare(legacy, recovery);
  assert.equal(wire.privacyVersion, 1);
  assert.equal(wire.visits.a.time, "09:30");
  assert.doesNotMatch(JSON.stringify(wire), /Private note|Legacy note|Private contact|Private cycle note/);
  assert.notEqual(wire.visits.a.privateText.iv, (await sealPrivateCare(legacy, recovery)).visits.a.privateText.iv);
  assert.deepEqual(portable(validateCareRecords(wire)), wire);
  assert.deepEqual(await openPrivateCare(wire, recovery), legacy);
  assert.deepEqual(await openPrivateCare(legacy), legacy);
  for (const source of [legacy, wire]) {
    const family = sharedCare(source, ["visits", "cycle"]);
    assert.equal(family.visits.a.sharedNote, "Caregiver note");
    assert.doesNotMatch(JSON.stringify(family), /privateText|Private note|Legacy note|Private contact|Private cycle note/);
  }
  const incorrect = await importRecoveryKey(generateRecoveryKey());
  await assert.rejects(openPrivateCare(wire), /private_key/);
  await assert.rejects(openPrivateCare(wire, incorrect), /private_key/);

  const corrupt = structuredClone(wire);
  corrupt.visits.a.privateText.data = "A".repeat(corrupt.visits.a.privateText.data.length);
  await assert.rejects(openPrivateCare(corrupt, recovery), /private_corrupt/);
  const moved = { ...wire, visits: { b: { ...wire.visits.a, id: "b" } } };
  await assert.rejects(openPrivateCare(moved, recovery), /private_corrupt/);
  corrupt.visits.a.privateText.iv = "non-96-bit-nonce";
  assert.throws(() => validateCareRecords(corrupt), /invalid_backup/);
  await assert.rejects(openPrivateCare(corrupt, recovery), /private_corrupt/);
  assert.equal(wire.visits.a.privateText.iv.length, 24);
});

test("authenticated envelopes still reject malformed private field containers", async () => {
  const recovery = await importRecoveryKey(generateRecoveryKey());
  const records = await sealPrivateCare({ ...emptyCareRecords(),
    visits: { v: { id: "v", name: "Synthetic", day: 20000, time: "10:00", note: "Original" } }
  }, recovery);
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const additionalData = encoder.encode(JSON.stringify(["Medora private care", 1, "visits", "v"]));
  for (const invalid of [[], {}, "", { note: "" }]) {
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData }, recovery.key,
      encoder.encode(JSON.stringify(invalid)));
    const snapshot = structuredClone(records);
    snapshot.visits.v.privateText = { iv: Buffer.from(iv).toString("hex"), data: Buffer.from(encrypted).toString("base64") };
    await assert.rejects(openPrivateCare(snapshot, recovery), /private_corrupt/);
  }
  assert.equal((await openPrivateCare(records, recovery)).visits.v.note, "Original");
});
