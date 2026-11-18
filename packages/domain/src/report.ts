import { collection, type Fields } from "./collections";

export function dailyReport(
  first: number,
  last: number,
  water: ({ day: number; amount: number } | null)[],
  state: Fields,
) {
  if (
    !Number.isSafeInteger(first) ||
    !Number.isSafeInteger(last) ||
    first > last ||
    last - first >= 366
  )
    throw Error("invalid_report_range");
  const rows = Array.from({ length: last - first + 1 }, (_, index) => ({
    day: first + index,
    water: 0,
    taken: 0,
    skipped: 0,
    visits: 0,
  }));
  for (const entry of water) {
    if (entry && rows[entry.day - first])
      rows[entry.day - first]!.water += entry.amount;
  }
  for (const dose of Object.values(collection(state, "doses"))) {
    const row = typeof dose.day === "number" && rows[dose.day - first];
    if (row && (dose.status === "taken" || dose.status === "skipped"))
      row[dose.status]++;
  }
  for (const visit of Object.values(collection(state, "visits"))) {
    const row = typeof visit.day === "number" && rows[visit.day - first];
    if (row && !visit.cancelled) row.visits++;
  }
  return rows.reverse();
}
