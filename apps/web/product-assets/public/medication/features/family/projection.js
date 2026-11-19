import { profileName } from "../../domain/profile.js";
import { emptyCareRecords } from "../../domain/family.js";
import { sleepIsEnabled } from "../../domain/sleep.js";
import {
  dayMs,
  instantForWall,
  localWall,
  timezone,
} from "../../domain/wall-clock.js";

const programScopes = {
  medications: ["medicines", "doses"],
  appointments: ["visits"],
  routines: ["routines"],
  water: ["water"],
  cycle: ["cycle"],
  sleep: ["sleep"],
  insights: [
    "doses",
    "visits",
    "routines",
    "water",
    "cycle",
    "medicines",
    "sleep",
  ],
};

const actionScopes = {
  medicine: "medicines",
  visit: "visits",
  routine: "routines",
  water: "water",
  cycle: "cycle",
};

export function sharedContext(
  data,
  group,
  member,
  { authorName, record, add, profile },
) {
  const { records, policy, synced, zone } = data;
  const has = (key) => policy.sections.includes(key);
  const clock = timezone(zone);
  const offsets = new Map();
  const today = () => Math.floor(localWall(Date.now(), clock) / dayMs);
  const timeOf = (day, minute) =>
    instantForWall(day * dayMs + minute * 60_000, clock, offsets);
  const canView = (page) =>
    !programScopes[page] || programScopes[page].some(has);
  const canRecord = (kind, day = today()) =>
    synced &&
    policy.record &&
    day <= today() &&
    has(actionScopes[kind]) &&
    (kind !== "medicine" || has("doses")) &&
    (kind !== "cycle" || records.cycleEnabled);
  const canAdd = (kind) =>
    synced &&
    policy.add &&
    ["medicine", "visit", "routine"].includes(kind) &&
    has(actionScopes[kind]);
  const name = profileName(records.profile) || member.label;
  return {
    group,
    member,
    name,
    firstName: records.profile?.firstName || member.label,
    has,
    canView,
    canRecord,
    canAdd,
    state: {
      ...emptyCareRecords(),
      ...records,
      sleepEnabled: has("sleep") && sleepIsEnabled(records),
      cycleEnabled: Boolean(
        records.cycleEnabled || Object.keys(records.cycleRecords ?? {}).length,
      ),
    },
    zone,
    get today() {
      return today();
    },
    timeOf,
    authorName,
    record,
    add,
    profile: has("profile") ? profile : null,
    synced,
  };
}
