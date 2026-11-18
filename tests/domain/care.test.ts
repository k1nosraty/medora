import { expect, it } from "vitest";
import {
  addPlan,
  markDose,
  completeRoutine,
  collection,
  type Fields,
  type PlanInput,
} from "../../packages/domain/src/care";
const input: PlanInput = {
  kind: "medicines",
  name: "Synthetic schedule",
  day: 20000,
  minute: 720,
  zone: "UTC",
  start: 100,
  end: 200,
  flow: "light",
  unit: "units",
  quantity: "0.5",
  stock: "10",
};
it("keeps fractional stock balanced when a dose is recorded twice and later marked skipped", () => {
  const s: Fields = {};
  addPlan(s, input, "m", 0, 20000);
  const record = (choice: "taken" | "skipped") =>
    markDose(s, "m", 20000, 720, choice, "UTC", 20000, 1728043200000);
  record("taken");
  record("taken");
  expect(collection(s, "medicines").m?.stock).toBe(9500);
  record("skipped");
  expect(collection(s, "medicines").m?.stock).toBe(10000);
  expect(() => markDose(s, "m", 20001, 720, "taken", "UTC", 20000, 0)).toThrow(
    "future",
  );
});
it("preserves cycle extensions, rejects overlapping sleep and keeps routine history", () => {
  const s: Fields = { cycleDays: { "20000": { future: true, symptoms: {} } } };
  addPlan(s, { ...input, kind: "cycleDays" }, "unused", 500, 20000);
  expect(collection(s, "cycleDays")["20000"]?.future).toBe(true);
  addPlan(s, { ...input, kind: "sleepRecords" }, "sleep", 500, 20000);
  expect(() =>
    addPlan(s, { ...input, kind: "sleepRecords" }, "second", 500, 20000),
  ).toThrow("invalid_sleep");
  addPlan(s, { ...input, kind: "routines" }, "r", 500, 20000);
  completeRoutine(s, "r", 20000);
  expect(collection(s, "routineLogs")["20000"]?.r).toMatchObject({
    done: true,
  });
});

import {
  agenda,
  addStock,
  changeVisit,
  setPaused,
  visitDay,
} from "../../packages/domain/src/care";
it("maintains schedule history, clinic-local time and attendance metadata", () => {
  const day = 20000,
    now = day * 86400000 + 3600000;
  const state: Record<string, unknown> = {
    medicines: {
      m: {
        id: "m",
        name: "Fixture",
        unit: "tablet",
        stock: 1000,
        phases: [
          {
            start: day,
            end: null,
            interval: 1,
            mask: 127,
            slots: [{ minute: 720, amount: 1000 }],
          },
        ],
        paused: false,
        revision: 1,
      },
    },
    visits: {
      v: {
        id: "v",
        name: "Clinic",
        day,
        time: "00:30",
        zone: "Asia/Tehran",
        extension: 5,
      },
    },
  };
  const visit = (state.visits as Record<string, Record<string, unknown>>).v!;
  expect(visitDay(visit, "UTC")).toBe(day - 1);
  expect(
    agenda(state, day - 1, "UTC", day).some(
      (x) => x.id === "v" && x.time === "21:00",
    ),
  ).toBe(true);
  addStock(state, "m", "1.5");
  expect((state.medicines as Record<string, { stock: number }>).m!.stock).toBe(
    2500,
  );
  setPaused(state, "medicines", "m", true, now);
  expect(state.scheduleHistory).toBeTruthy();
  changeVisit(state, "v", "attend", day - 1, "UTC", now);
  expect(visit.resolvedAt).toBe(now);
  changeVisit(state, "v", "cancel", day, "UTC", now);
  expect(visit.completed).toBeUndefined();
  expect(visit.extension).toBe(5);
});
