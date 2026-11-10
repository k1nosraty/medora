import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { readAndroidBackup } from "../public/medication/android-backup.js";
import {
  WebPhase, WebSlot, validMedicationPhases, medicationSlots,
  quantityFromText, updateStock, isLowStock
} from "../public/care-engine/care-core.mjs";
import { nextMedicationReminder, nextCareReminder, validSchedule } from "../src/medication-schedule.mjs";
import { scheduleForPush } from "../public/medication/care-plan.js";
import { routineComplete, routineLog } from "../public/medication/routine-plan.js";
import { createCareIndex } from "../public/medication/care-index.js";

const day = iso => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
const instant = iso => Date.parse(iso);

test("calendar index keeps exact-date plans and historical or removed doses visible", () => {
  const start = day("2026-11-09");
  const state = {
    medicines: {
      exact: { id: "exact", dates: [start + 2], phases: [{ start, end: null, interval: 1, mask: 127, slots: [{ minute: 480, amount: 500 }] }] },
      paused: { id: "paused", paused: true, phases: [] }
    },
    doses: {
      "paused|old": { medicineId: "paused", day: start, minute: 720, status: "taken" },
      "removed|old": { medicineId: "removed", day: start + 1, minute: 660, imported: true },
      "paused|obsolete": { medicineId: "paused", day: start + 3, minute: 720, status: null }
    },
    water: [{ day: start, amount: 250 }, { day: start, amount: 150 }],
    visits: { clinic: { day: start, time: "23:30", zone: "America/New_York" } }
  };
  const index = createCareIndex(state, { WebPhase, WebSlot, medicationSlots }, "Asia/Tehran");
  assert.deepEqual([0, 1, 2, 3].map(offset => index.hasDoses(start + offset)), [true, true, true, false]);
  assert.equal(index.dosesOn(start)[0].status, "taken");
  assert.equal(index.dosesOn(start + 1)[0].imported, true);
  assert.equal(index.dosesOn(start + 2)[0].planned, 500);
  assert.deepEqual(index.dosesOn(start + 3), []);
  assert.deepEqual(index.doseTotals(start, start + 3), { taken: 1, recorded: 1 });
  assert.equal(index.waterTotal(start), 400);
  assert.equal(index.visitsOn(start + 1)[0].time, "08:00");
});

test("browser exports use the shared phase and stock rules", () => {
  const half = new WebSlot(480, quantityFromText("۰٫۵"));
  const whole = new WebSlot(480, 1000);
  const phases = [new WebPhase(4, 11, 1, 9, [half]), new WebPhase(11, null, 2, 1, [whole])];
  assert.equal(validMedicationPhases(phases), true);
  assert.equal(medicationSlots(phases, 7)[0].milliUnits, 500);
  assert.equal(medicationSlots(phases, 11)[0].milliUnits, 1000);
  assert.deepEqual(medicationSlots(phases, 18), []);
  assert.equal(medicationSlots(phases, 25)[0].minuteOfDay, 480);
  assert.equal(updateStock(1500, 0, half.milliUnits, 0), 1000);
  assert.equal(updateStock(1000, 500, 500, 0), 1000);
  assert.equal(updateStock(1000, 500, 0, 0), 1500);
  assert.equal(isLowStock(500, 0, 1000), true);
});

test("closed app schedules distant phases and skips only the completed occurrence", () => {
  const start = day("2026-11-09");
  const rule = { start, end: null, interval: 52, mask: 1, minutes: [1200], skip: [[start, 1200]] };
  const schedule = validSchedule({ zone: "Asia/Tehran", rules: [rule] });
  const now = instant("2026-11-09T10:00:00Z");
  assert.deepEqual(nextMedicationReminder(schedule, now), {
    at: instant("2027-11-08T16:30:00Z"), day: start + 364
  });
  const simultaneous = validSchedule({ zone: "Asia/Tehran", rules: [rule, { ...rule, skip: [] }] });
  assert.equal(nextMedicationReminder(simultaneous, now).at, instant("2026-11-09T16:30:00Z"));
  assert.equal(nextMedicationReminder(validSchedule({ zone: "Asia/Tehran", rules: [{ ...rule, end: start + 1 }] }), now), null);
  assert.equal(validSchedule({ zone: "Not/AZone", rules: [] }), null);
});

test("timezone gaps move forward and repeated local times send once", () => {
  const oneDay = date => validSchedule({ zone: "Europe/Berlin", rules: [
    { start: day(date), end: day(date) + 1, interval: 1, mask: 127, minutes: [150], skip: [] }
  ] });
  assert.equal(nextMedicationReminder(oneDay("2026-03-29"), instant("2026-03-29T00:00:00Z")).at,
    instant("2026-03-29T01:30:00Z"));
  assert.equal(nextMedicationReminder(oneDay("2026-10-25"), instant("2026-10-25T00:00:00Z")).at,
    instant("2026-10-25T00:30:00Z"));
  assert.equal(nextMedicationReminder(oneDay("2026-10-25"), instant("2026-10-25T00:45:00Z")), null);
});

test("snooze moves the original slot and stops after cancellation", () => {
  const today = day("2026-11-09");
  const now = instant("2026-11-09T07:59:00Z");
  const until = instant("2026-11-09T08:10:30Z");
  const medicine = { id: "one", phases: [{ start: today, end: null, interval: 1, mask: 127,
    slots: [{ minute: 480, amount: 500 }] }] };
  const dose = { medicineId: "one", day: today, minute: 480, status: "snoozed", snoozeUntil: until };
  const state = { medicines: { one: medicine }, doses: { one: dose } };
  const next = () => nextCareReminder(validSchedule(scheduleForPush(state, "UTC", today, now)), now);
  assert.equal(next().at, until);
  assert.deepEqual(next().kinds, ["dose"]);
  dose.status = "taken";
  assert.equal(next().at, instant("2026-11-10T08:00:00Z"));
  medicine.paused = true;
  assert.equal(next(), null);
});

test("water stops for the goal day, restarts tomorrow, and honours repeat and pause", () => {
  const today = day("2026-11-09");
  const now = instant("2026-11-09T08:02:00Z");
  const state = { medicines: {}, doses: {}, water: [], waterGoal: 2000,
    waterReminders: { enabled: true, start: "08:00", end: "10:00", interval: 60, repeat: 5, pauseUntil: 0 } };
  const next = () => nextCareReminder(validSchedule(scheduleForPush(state, "UTC", today, now)), now);
  assert.equal(next().at, instant("2026-11-09T08:05:00Z"));
  state.waterReminders.pauseUntil = instant("2026-11-09T09:00:00Z");
  assert.equal(next().at, state.waterReminders.pauseUntil);
  state.water.push({ day: today, amount: 2000 });
  assert.equal(next().at, instant("2026-11-10T08:00:00Z"));
  assert.deepEqual(next().kinds, ["water"]);
});

test("appointment uses clinic timezone, combines offsets, and omits disabled or cancelled visits", () => {
  const today = day("2026-11-09");
  const now = instant("2026-11-09T03:00:00Z");
  const visit = { day: today, time: "07:30", zone: "Asia/Tehran", offsets: [60, 120], name: "private" };
  const state = { medicines: {}, doses: {}, visits: { a: visit } };
  const plan = () => scheduleForPush(state, "UTC", today, now);
  assert.deepEqual(plan().appointments, []);
  visit.time = "08:00";
  assert.deepEqual(plan().appointments, [[instant("2026-11-09T03:30:00Z"), today, instant("2026-11-09T04:30:00Z")]]);
  assert.deepEqual(nextCareReminder(validSchedule(plan()), now).kinds, ["appointment"]);
  assert.doesNotMatch(JSON.stringify(plan()), /private/);
  visit.remindersOff = true;
  assert.deepEqual(plan().appointments, []);
  delete visit.remindersOff;
  assert.equal(plan().appointments.length, 1);
  visit.cancelled = true;
  assert.deepEqual(plan().appointments, []);
});

test("an Android-exported encrypted backup restores and rejects incorrect or damaged input", async () => {
  // Synthetic data exported by the app's Backups screen on the Android emulator.
  const file = new URL("../test/fixtures/android-medora-v1.medora", import.meta.url);
  const bytes = new Uint8Array(await readFile(file));
  const validate = phases => validMedicationPhases(phases.map(phase => new WebPhase(
    phase.start, phase.end, phase.interval, phase.mask, phase.slots.map(slot => new WebSlot(slot.minute, slot.amount))
  )));
  const restore = (data, password = "MedoraInterop2026") => readAndroidBackup(data, password, validate, "Asia/Tehran");
  const state = await restore(bytes);
  assert.equal(Object.values(state.medicines)[0].icon, "capsule");
  assert.equal(Object.values(state.doses).filter(dose => dose.status === "taken").length, 1);
  assert.equal(state.water.length, 7);
  assert.equal(Object.values(state.visits)[0].zone, "Asia/Tehran");
  assert.equal(state.reminders, undefined);
  await assert.rejects(restore(bytes, "wrong password"));
  const altered = bytes.slice();
  altered[altered.length - 1] ^= 1;
  await assert.rejects(restore(altered));
});


test("routine targets preserve logged history and only suppress the completed occurrence", () => {
  const start = day("2026-11-09");
  const now = instant("2026-11-09T07:00:00Z");
  const plan = { id: "stretch", name: "Stretch", category: "stretch", start, mask: 5, interval: 2, minute: 480,
    reminder: true, paused: false, mode: "steps", steps: ["Warm up", "Stretch"] };
  const state = { medicines: {}, doses: {}, routines: { stretch: plan }, routineLogs: { [start]: {} } };
  const index = (today = start) => createCareIndex(state, {}, "UTC", today);
  const next = () => nextCareReminder(validSchedule(scheduleForPush(state, "UTC", start, now)), now);

  state.routineLogs[start].stretch = routineLog(plan, [1, 1, 2]);
  assert.equal(routineComplete(index().routinesOn(start)[0]), false);
  assert.deepEqual(next().kinds, ["routine"]);
  assert.equal(next().at, instant("2026-11-09T08:00:00Z"));
  assert.equal(index().routinesOn(start + 7).length, 0);
  assert.equal(index().routinesOn(start + 14).length, 1);

  state.routineLogs[start].stretch = routineLog(plan, [0, 1]);
  assert.equal(next().at, instant("2026-11-11T08:00:00Z"));
  assert.equal(index().routineTotals(start - 1, start).completed, 1);
  assert.equal(routineComplete(routineLog({ ...plan, mode: "quantity", target: 10, unit: "minutes" }, 9)), false);
  assert.equal(routineLog({ ...plan, mode: "quantity", target: 10 }, 0), null);

  delete state.routines.stretch;
  assert.equal(next(), null);
  assert.equal(index(start + 1).routinesOn(start)[0].name, "Stretch");
});

test("notification names stay private by default and opted-in reminders retain due details", async () => {
  const { reminderCopy } = await import("../src/reminder-copy.mjs");
  const start = day("2026-11-09");
  const now = instant("2026-11-09T07:59:00Z");
  const medicines = Object.fromEntries(["A", "B"].map((name, index) => [name, {
    id: name, name, unit: "قرص", phases: [{ start, end: null, interval: 1, mask: 127, slots: [{ minute: 480, amount: 500 + index * 1500 }] }]
  }]));
  const state = { medicines, doses: {},
    routines: { reading: { name: "Read", mode: "quantity", unit: "pages", target: 15, start, interval: 1, mask: 127, reminder: true, minute: 480 } },
    visits: { dentist: { name: "Dentist", day: start, time: "09:00", zone: "UTC" } }
  };
  const getPlan = () => validSchedule(scheduleForPush(state, "UTC", start, now));
  const getNext = () => nextCareReminder(getPlan(), now);
  const generic = getNext();
  assert.deepEqual(generic.kinds, ["dose", "appointment", "routine"]);
  assert.equal(generic.details, undefined);
  assert.match(reminderCopy(generic, generic.kinds, "en", "UTC", now).body, /Take your scheduled medicine/);
  state.reminderDetails = true;
  const next = getNext();
  const { body } = reminderCopy(next, next.kinds, "en", "UTC", now);
  assert.match(body, /A \(0\.5 tablet\).*B \(2 tablets\)/);
  assert.match(body, /Dentist \(09:00\)/);
  assert.match(body, /Read \(15 pages\)/);
  const plan = getPlan();
  plan.rules[0].name = "bad\nlabel";
  assert.equal(validSchedule(plan), null);
  state.visits.dentist.completed = true;
  assert.deepEqual(getNext().kinds, ["dose", "routine"]);
});
