// @vitest-environment jsdom
import { expect, it } from "vitest";
import {
  doseId,
  doseTime,
} from "../../packages/domain/src/browser/care-index.js";
import { saveMedicinePlan } from "../../packages/domain/src/browser/medicine-command.js";
import { dayNumber } from "../../apps/web/product-assets/public/medication/shared/ui/dates.js";
import {
  deleteSchedule,
  recordDose,
  refillStock,
  type MedicationCare,
} from "../../apps/web/src/product/medication/model";
import {
  InvalidMedicineField,
  medicineDraft,
  stageDraft,
  validateDraft,
} from "../../apps/web/src/product/medication/editorModel";

const day = dayNumber("2026-11-18");
function careFixture() {
  const slot = { minute: 480, amount: 1000, slotExtension: { value: 1 } };
  const phase = {
    start: day,
    end: null,
    interval: 1,
    mask: 127,
    slots: [slot],
    phaseExtension: "retained",
  };
  const plan = {
    id: "sample",
    name: "Fixture",
    unit: "tablet",
    revision: 1,
    stock: 15000,
    threshold: 2000,
    phases: [phase],
    planExtension: true,
  };
  const state: MedicationCare = { medicines: { [plan.id]: plan }, doses: {} };
  return { state, plan };
}

it("validates schedule dates, staged end boundaries, dose times and localized amounts", () => {
  const { plan } = careFixture();
  const draft = medicineDraft(plan);
  draft.phased = true;
  draft.phases.push(
    stageDraft({
      start: day + 7,
      end: null,
      interval: 2,
      mask: 2,
      slots: [{ minute: 540, amount: 1000 }],
    }),
  );
  const first = draft.phases[0]!;
  first.slots[0]!.amount = "½";
  expect(validateDraft(draft, true, plan.id).phases).toMatchObject([
    {
      start: day,
      end: day + 7,
      autoEnd: true,
      phaseExtension: "retained",
      slots: [{ minute: 480, amount: 500, slotExtension: { value: 1 } }],
    },
    { start: day + 7, end: null, interval: 2, mask: 2 },
  ]);
  first.slots.push({ ...first.slots[0]! });
  expect(() => validateDraft(draft, true, plan.id)).toThrow(
    InvalidMedicineField,
  );
  first.slots.pop();
  first.slots[0]!.time = "";
  expect(() => validateDraft(draft, true, plan.id)).toThrow(
    InvalidMedicineField,
  );
  first.slots[0]!.time = "00:00";
  expect(validateDraft(draft, true, plan.id).phases[0]?.slots[0]?.minute).toBe(
    0,
  );
  first.repeat = "dates";
  draft.phased = false;
  draft.dates = [];
  expect(() => validateDraft(draft, true, plan.id)).toThrow(
    InvalidMedicineField,
  );
  draft.dates = [day, day + 3];
  expect(validateDraft(draft, true, plan.id).dates).toEqual([day, day + 3]);
});

it("retains extension fields on edit and rejects an outdated plan revision", () => {
  const { state, plan } = careFixture();
  const draft = medicineDraft(plan);
  draft.name = "Updated fixture";
  const update = validateDraft(draft, true, plan.id);
  expect(saveMedicinePlan(state, update, 1, doseTime(day, 600))).toBe(true);
  expect(state.medicines.sample).toMatchObject({
    revision: 2,
    name: draft.name,
    stock: 15000,
    planExtension: true,
    phases: [
      { phaseExtension: "retained", slots: [{ slotExtension: { value: 1 } }] },
    ],
  });
  expect(saveMedicinePlan(state, update, 1, doseTime(day, 610))).toBe(false);
  expect(state.medicines.sample?.revision).toBe(2);
});

it("uses the original dose identifier, reverses stock debits and preserves recorded history on deletion", () => {
  const { state, plan } = careFixture();
  const dose = {
    medicineId: plan.id,
    day,
    minute: 480,
    planned: 1000,
    recordExtension: { retained: true },
  };
  const id = doseId(plan, day, 480);
  const now = doseTime(day, 600);
  state.doses[id] = dose;
  recordDose(state, dose, "snoozed", null, day, now);
  expect(state.doses[id]).toMatchObject({
    snoozeUntil: now + 600000,
    actual: null,
  });
  recordDose(state, dose, "taken", 500, day, now + 1000);
  recordDose(state, dose, "taken", 500, day, now + 2000);
  expect(plan.stock).toBe(14500);
  expect(state.doses[id]).toMatchObject({
    actual: 500,
    recordExtension: { retained: true },
    resolvedAt: now + 1000,
  });
  recordDose(state, dose, "skipped", null, day, now + 3000);
  expect(plan.stock).toBe(15000);
  recordDose(state, dose, null, null, day, now + 4000);
  recordDose(state, dose, "taken", 1000, day, now + 5000);
  refillStock(state, plan.id, 2000);
  expect(plan.stock).toBe(16000);
  const future = doseId(plan, day + 1, 480);
  state.doses[future] = { ...dose, day: day + 1, status: "snoozed" };
  deleteSchedule(state, plan.id, now + 6000);
  expect(state.medicines.sample).toBeUndefined();
  expect(state.doses[future]).toBeUndefined();
  expect(state.doses[id]).toMatchObject({
    medicineId: plan.id,
    name: "Fixture",
    status: "taken",
    actual: 1000,
    recordExtension: { retained: true },
  });
});
