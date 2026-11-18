import { expect, it } from "vitest";
import { dailyReport } from "../../packages/domain/src/report";
it("includes the period boundaries and excludes tombstones and cancelled visits", () => {
  expect(
    dailyReport(
      10,
      11,
      [null, { day: 11, amount: 250 }, { day: 12, amount: 100 }],
      {
        visits: { a: { day: 10 }, b: { day: 10, cancelled: true } },
        doses: {
          a: { day: 11, status: "taken" },
          b: { day: 10, status: "skipped" },
        },
      },
    ),
  ).toEqual([
    { day: 11, water: 250, taken: 1, skipped: 0, visits: 0 },
    { day: 10, water: 0, taken: 0, skipped: 1, visits: 1 },
  ]);
});
