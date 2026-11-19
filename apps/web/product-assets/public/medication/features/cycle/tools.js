import {
  cycleEntries,
  cycleSymptoms,
  cycleTotals,
} from "../../domain/cycle.js";
import messagesFa from "../../shared/i18n/messages-fa.js";

const flowLabel = (flow, translate) =>
  flow === "none"
    ? translate("ui.cycle-no-flow")
    : flow === "spotting"
      ? translate("ui.cycle-spotting")
      : flow
        ? translate(`ui.cycle-flow-${flow}`)
        : "";

export function describeCycleDay(row, translate) {
  return [
    flowLabel(row.flow, translate),
    ...Object.entries(row.symptoms ?? {}).map(
      ([key, severity]) =>
        translate(`ui.cycle-${key}`) +
        " (" +
        translate(`ui.cycle-strength-${severity}`) +
        ")",
    ),
    row.tags,
    row.note,
  ].filter(Boolean);
}

/**
 * Reject the whole batch on overlap; the caller owns persistence.
 * @template {{end?: number | null}} Period
 * @param {Record<number, Period>} records
 * @param {{start: number; end: number | null}[]} additions
 * @returns {Record<number, Period | {end: number | null; flow: ""}> | null}
 */
export function mergeCyclePeriods(records, additions) {
  /** @type {Record<number, Period | {end: number | null; flow: ""}>} */
  const rows = { ...records };
  for (const row of additions) {
    if (
      Object.hasOwn(rows, row.start) ||
      Object.entries(rows).some(
        ([start, other]) =>
          Number(start) <= (row.end ?? row.start) &&
          row.start <= (other.end ?? Number(start)),
      )
    )
      return null;
    rows[row.start] = { end: row.end, flow: "" };
  }
  return rows;
}

/** @returns {{title: string; lines: string[]}} */
export function cyclePrintReport(
  state,
  first,
  last,
  { symptoms, notes, medicines },
) {
  const dateFormat = new Intl.DateTimeFormat("fa-IR", {
    calendar: "persian",
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const date = (day) => dateFormat.format(day * 86_400_000);
  const digits = new Intl.NumberFormat("fa-IR").format;
  const fa = (key, ...values) =>
    messagesFa[key].replace(/\{(\d+)\}/g, (_, index) => values[index]);
  const totals = cycleTotals(state.cycleRecords, first, last, state.cycleDays);
  const selected = Object.entries(state.cycleDays ?? {}).filter(
    ([day]) => Number(day) >= first && Number(day) <= last,
  );
  const summaries = [
    fa("ui.cycle-visit-period-count", digits(totals.starts)),
    fa("ui.cycle-visit-days-count", digits(totals.days)),
  ];
  for (const [flow, label] of [
    ["light", "ui.cycle-flow-light"],
    ["medium", "ui.cycle-flow-medium"],
    ["heavy", "ui.cycle-flow-heavy"],
    ["spotting", "ui.cycle-spotting"],
  ]) {
    const count = selected.filter(([, row]) => row.flow === flow).length;
    if (count) summaries.push(fa(label) + " · " + digits(count));
  }
  if (symptoms)
    for (const key of cycleSymptoms) {
      const count = selected.filter(([, row]) => row.symptoms?.[key]).length;
      if (count) summaries.push(fa(`ui.cycle-${key}`) + " · " + digits(count));
    }
  const detail = new Map();
  for (const [day, row] of selected) {
    const filtered = describeCycleDay(
      {
        ...row,
        symptoms: symptoms ? row.symptoms : {},
        note: notes ? row.note : undefined,
        tags: notes ? row.tags : undefined,
      },
      fa,
    );
    if (filtered.length) detail.set(Number(day), filtered);
  }
  if (medicines)
    for (const dose of Object.values(state.doses ?? {})) {
      if (dose.status !== "taken" || dose.day < first || dose.day > last)
        continue;
      const name = state.medicines?.[dose.medicineId]?.name ?? dose.name;
      const entries = detail.get(dose.day) ?? [];
      if (name && !entries.includes(name))
        detail.set(dose.day, [...entries, name]);
    }
  return {
    title: fa("ui.cycle-visit-report"),
    lines: [
      date(first) + " – " + date(last),
      summaries.join(" · "),
      ...cycleEntries(state.cycleRecords)
        .filter((row) => row.start <= last && (row.end ?? row.start) >= first)
        .slice(0, 7)
        .map(
          (row) =>
            date(row.start) +
            (row.end === null ? "" : " – " + date(row.end)) +
            (notes && row.note ? " · " + row.note.slice(0, 110) : ""),
        ),
      ...[...detail]
        .sort(([a], [b]) => b - a)
        .slice(0, 10)
        .map(
          ([day, values]) =>
            date(day) + " · " + values.join("، ").slice(0, 160),
        ),
    ],
  };
}
