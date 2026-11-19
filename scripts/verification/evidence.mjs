export const evidenceVersion = 1;
export const visualProfiles = [
  ["fa", "light", 390, 844],
  ["fa", "dark", 1280, 850],
  ["en", "light", 390, 844],
  ["en", "dark", 1280, 850],
];
const engines = ["chromium", "webkit"];
export const visualScenes = [
  "onboarding", "today", "medications", "appointments", "routines", "water",
  "edit-water", "cycle", "sleep", "insights", "water-report", "medicine-cabinet",
  "medicine-details", "medicine-editor", "medicine-appearance", "medicine-schedule",
  "medicine-featured", "medicine-snooze-settings", "today-grouped", "cycle-populated",
];
export const accessibilityScenes = [
  "onboarding", "today", "edit-water", "medicine-cabinet", "medicine-details",
  "medicine-editor", "medicine-schedule", "medicine-appearance",
];
export const handoffAccounts = ["first-account", "second-account"];
export const offlineOperations = ["water-first", "water-second", "medication", "dose"];
export const visualCase = (engine, lang, width, name) => `${engine}/${lang}/${width}/${name}`;
export const offlineCase = (account, operation) => `${account}/${operation}`;

function checkCases(rows, expected, getId, passed, label) {
  const missing = new Set(expected);
  if (!Array.isArray(rows)) throw Error(`Missing ${label} evidence`);
  for (const row of rows) {
    const id = getId(row);
    if (!missing.delete(id) || !passed(row)) throw Error(`Invalid ${label} evidence: ${id}`);
  }
  if (missing.size) throw Error(`Missing ${label} cases: ${[...missing].join(", ")}`);
}

export function verifyCoverage(handoff, visual) {
  if (handoff?.schemaVersion !== evidenceVersion || visual?.schemaVersion !== evidenceVersion)
    throw Error("Unsupported candidate evidence version");
  const visualIds = (screens) => engines.flatMap((engine) =>
    visualProfiles.flatMap(([lang, , width]) => screens.map((name) => visualCase(engine, lang, width, name))),
  );
  checkCases(visual.cases, visualIds(visualScenes), (row) => row.id, (row) =>
    row.layout === true && (row.capture === "exact" || (
      row.capture === "verified-renderer" && /^webkit\//.test(row.id) &&
      /\/medicine-(details|editor|schedule|appearance)$/.test(row.id)
    )), "visual");
  checkCases(visual.accessibility, visualIds(accessibilityScenes),
    ({ engine, lang, width, screen }) => visualCase(engine, lang, width, screen),
    (row) => row.newViolations === 0, "accessibility");
  if (!Array.isArray(visual.visualMismatches) || visual.visualMismatches.length)
    throw Error("Unresolved visual mismatches");
  checkCases(handoff.offlineCases, handoffAccounts.flatMap((account) =>
    offlineOperations.map((operation) => offlineCase(account, operation))),
    (row) => row.id, (row) => row.replayed === true, "offline handoff");
}

export function verifyStartupPerformance(report, entry) {
  if (report?.entry !== entry || !Array.isArray(report.trials) ||
      report.trials.length !== 3)
    throw Error("Incomplete startup measurements for " + entry);
  const times = report.trials.map((trial) => trial?.usableMs);
  if (times.some((time) => !Number.isFinite(time) || time <= 0))
    throw Error("Incomplete startup measurements for " + entry);
  const median = times.toSorted((a, b) => a - b)[1];
  if (median !== report.median?.usableMs || median > 6000)
    throw Error(`Startup budget failed for ${entry}: ${median} ms (limit 6000 ms)`);
}
