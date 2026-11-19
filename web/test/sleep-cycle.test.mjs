import test from "node:test";
import assert from "node:assert/strict";
import { sleepConflicts, sleepDay, sleepInstant, sleepMinutes, sleepReport } from "../../apps/web/product-assets/public/medication/domain/sleep.js";
import { cycleEstimate, cyclePatterns, cycleRoutineOccurs, withoutCycle } from "../../apps/web/product-assets/public/medication/domain/cycle.js";
import { sharedCare } from "../../apps/web/product-assets/public/medication/domain/family.js";
import { scheduleForPush } from "../../apps/web/product-assets/public/medication/domain/care-plan.js";
import { nextCareReminder, validSchedule } from "../../apps/web/product-assets/public/medication/domain/reminder-schedule.js";
import { portable, validateCareRecords } from "../../apps/web/product-assets/public/medication/domain/care-records.js";
import { reminderCopy } from "../src/reminders/copy.mjs";

const zone = "Asia/Tehran";
const day = Date.parse("2026-11-17T00:00:00Z") / 86_400_000;
const start = sleepInstant("2026-11-16", "23:40", zone);
const end = sleepInstant("2026-11-17", "07:00", zone);
const sleep = { start, end, zone, kind: "main", quality: "good", note: "private note" };
const nap = { start: end + 3600000, end: end + 5100000, zone, kind: "nap", quality: "" };
const state = { medicines: {}, doses: {}, visits: {}, water: [], routines: {}, routineLogs: {},
  sleepEnabled: true, sleepRecords: { sleep, nap }, cycleEnabled: true,
  cycleRecords: { [day - 84]: { flow: "", end: day - 81 }, [day - 56]: { flow: "", end: day - 53 }, [day - 28]: { flow: "", end: day - 24 } },
  cycleDays: { [day - 28]: { flow: "spotting", symptoms: { cramps: 2 }, note: "private" } },
  cycleOptions: { hideToday: false, minute: 1200, routines: ["routine"] }, cycleSupport: "Good wishes" };

test("sleep persists through portable backup, spans midnight and keeps naps out of the main average", () => {
  assert.equal(sleepDay(sleep), day);
  assert.equal(sleepMinutes(sleep), 440);
  const report = sleepReport(state.sleepRecords, day, day);
  assert.equal(report.average, 440);
  assert.equal(report.naps, 25);
  assert.equal(sleepConflicts(state.sleepRecords, { ...sleep, end: null }), true);
  assert.equal(sleepConflicts({ sleep }, nap), false);
  const restored = validateCareRecords(portable({ ...state, sleepCardSize: "compact", cycleCardSize: "wide" }));
  assert.equal(restored.sleepRecords.sleep.note, sleep.note);
  assert.equal(restored.cycleDays[day - 28].symptoms.cramps, 2);
  assert.equal(restored.sleepCardSize, "compact");
  assert.equal(restored.cycleCardSize, "wide");
  assert.ok(Number.isNaN(sleepInstant("2026-03-08", "02:30", "America/New_York")));
});

test("cycle companion grants only expose the permitted content and local-only omits cycle data", () => {
  const wire = portable(state);
  assert.equal(sharedCare(wire, ["cycleForecast"]).cycleCompanionEstimate.first, day);
  const companion = sharedCare(wire, ["cycleSupport"]);
  assert.equal(companion.cycleCompanionMessage, "Good wishes");
  assert.equal(companion.cycleRecords, undefined);
  assert.equal(companion.cycleDays, undefined);
  const sleepShare = sharedCare(wire, ["sleep"]);
  assert.equal(sleepShare.sleepRecords.sleep.note, undefined);
  assert.equal(sharedCare(wire, ["profile"]).sleepRecords, undefined);
  const privateSnapshot = withoutCycle(wire);
  assert.equal(privateSnapshot.cycleDays, undefined);
  assert.equal(privateSnapshot.settings.cycleSupport, undefined);
  assert.equal(privateSnapshot.sleepRecords.sleep.start, start);
  assert.equal(cyclePatterns(state.cycleRecords, state.cycleDays).logged, 1);
  assert.equal(cycleEstimate(state.cycleRecords).uncertain, true);
  assert.equal(cycleRoutineOccurs(state, { id: "routine", start: day - 100 }, day - 28, false), true);
  assert.equal(cycleRoutineOccurs(state, { id: "routine", start: day - 100 }, day - 22, true), false);
});

test("sleep and discreet cycle reminders enter the actual timezone-aware push schedule", () => {
  const now = Date.parse("2026-11-17T12:00:00Z");
  const plan = validSchedule(scheduleForPush({ ...state, sleepSettings: { bedtime: "22:00", wake: "07:00", mask: 127, goal: 480 } }, zone, day, now));
  assert.deepEqual(nextCareReminder(plan, now).kinds, ["sleepBed"]);
  assert.deepEqual(nextCareReminder(plan, Date.parse("2026-11-18T05:00:00Z")).kinds, ["cycle"]);
  const copy = reminderCopy({}, ["cycle"], "fa", zone, now);
  assert.equal(copy.title, "یادآوری مدورا");
  assert.doesNotMatch(copy.body, /چرخه|پریود/);
  assert.equal(scheduleForPush({ ...state, cycleLocalOnly: true }, zone, day, now).cycleTimes, undefined);
});

test("overlapping records from two devices require a conflict choice before sync", async () => {
  const { mergeCare, CareConflict } = await import("../../apps/web/product-assets/public/medication/features/sync/merge.js");
  const ours = portable({ ...state, sleepRecords: { sleep } });
  const theirs = portable({ ...state, sleepRecords: { other: { ...sleep, start: start + 60_000 } } });
  assert.throws(() => mergeCare(null, ours, theirs), CareConflict);
  const merged = mergeCare(null, ours, theirs, () => "device");
  assert.deepEqual(Object.keys(merged.sleepRecords), ["sleep"]);
});

test("account protection encrypts sleep notes and cycle daily notes and tags", async () => {
  const { generateRecoveryKey, importRecoveryKey, openPrivateCare, sealPrivateCare } =
    await import("../../apps/web/product-assets/public/medication/features/sync/private-care.js");
  const key = await importRecoveryKey(generateRecoveryKey());
  const withTags = portable({ ...state, cycleDays: { [day]: { flow: "light", symptoms: {}, note: "private", tags: "personal" } } });
  const encrypted = await sealPrivateCare(withTags, key);
  assert.equal(encrypted.sleepRecords.sleep.note, undefined);
  assert.equal(encrypted.cycleDays[day].tags, undefined);
  assert.ok(encrypted.cycleDays[day].privateText);
  validateCareRecords(encrypted);
  assert.deepEqual(await openPrivateCare(encrypted, key), withTags);
});
