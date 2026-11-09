import assert from "node:assert/strict";
import test from "node:test";
import {
  WebPhase, WebSlot, validMedicationPhases, medicationSlots,
  quantityFromText, updateStock, isLowStock
} from "../public/care-engine/care-core.mjs";
import { nextMedicationReminder, validSchedule } from "../src/medication-schedule.mjs";

const day = iso => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
const instant = iso => Date.parse(iso);

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
