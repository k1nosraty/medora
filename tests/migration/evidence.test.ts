import { expect, it } from "vitest";
import { fixtureDatabase } from "../../scripts/verification/fixture-database.mjs";
import {
  accessibilityScenes, evidenceVersion, handoffAccounts, offlineCase,
  offlineOperations, verifyCoverage, visualCase, visualProfiles, visualScenes,
} from "../../scripts/verification/evidence.mjs";

it("restricts mutation-capable rehearsals to dedicated loopback databases", () => {
  const fixture = "postgresql://127.0.0.1:50889/medora_handoff_target";
  expect(fixtureDatabase(fixture)).toBe(fixture);
  expect(fixtureDatabase(undefined)).toBeUndefined();
  for (const invalid of [
    "postgresql://example.test/medora_fixture",
    "postgresql://localhost/medora",
    fixture + "?host=example.test",
  ]) expect(() => fixtureDatabase(invalid)).toThrow(/dedicated loopback/);
});

it("requires all current handoff, visual and accessibility scenarios", () => {
  const handoff = {
    schemaVersion: evidenceVersion,
    offlineCases: handoffAccounts.flatMap((account) => offlineOperations.map((operation) =>
      ({ id: offlineCase(account, operation), replayed: true }))),
  };
  const profiles = ["chromium", "webkit"].flatMap((engine) =>
    visualProfiles.map(([lang, , width]) => ({ engine, lang, width })));
  const visual = {
    schemaVersion: evidenceVersion,
    visualMismatches: [],
    cases: profiles.flatMap(({ engine, lang, width }) => visualScenes.map((name) =>
      ({ id: visualCase(engine, lang, width, name), layout: true, capture: "exact" }))),
    accessibility: profiles.flatMap((profile) => accessibilityScenes.map((screen) =>
      ({ ...profile, screen, newViolations: 0 }))),
  };
  expect(visual.cases).toHaveLength(160);
  expect(visual.accessibility).toHaveLength(64);
  expect(handoff.offlineCases).toHaveLength(8);
  expect(() => verifyCoverage(handoff, visual)).not.toThrow();
  expect(() => verifyCoverage({ ...handoff, schemaVersion: 0 }, visual)).toThrow(/version/);
  expect(() => verifyCoverage(handoff, { ...visual, accessibility: visual.accessibility.slice(1) })).toThrow(/Missing accessibility/);
  const [first, ...rest] = handoff.offlineCases;
  expect(() => verifyCoverage({ ...handoff, offlineCases: [...rest, rest[0]] }, visual)).toThrow(/Invalid offline/);
  expect(() => verifyCoverage({ ...handoff, offlineCases: [{ ...first, replayed: false }, ...rest] }, visual)).toThrow(/Invalid offline/);
});
