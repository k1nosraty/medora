import { boundedCarePayload, boundedText } from "./care-contract.js";
import { isRecoveryKeyId, privateFields, privateRows, validPrivateText } from "./private-fields.js";
import { maxRoutineAmount, maxRoutineSteps } from "./routine-plan.js";
import { availableAccents } from "./accents.js";
import { finishes, genders, validPersonalProfile } from "./profile.js";
import { timezone } from "./wall-clock.js";
import { compilePhases } from "./care-index.js";
import * as medicationRules from "./medication-rules.js";

const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const text = value => typeof value === "string";
const optional = (value, check) => value === undefined || check(value);
const day = value => integer(value, -719162, 2932896);
const instant = value => integer(value, 0, 8_640_000_000_000_000);
const minute = value => integer(value, 0, 1439);
const clock = value => text(value) && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?$/.test(value);
const safeId = value => text(value) && value.length > 0 && value.length <= 512 &&
  !Object.hasOwn(Object.prototype, value) && value !== "prototype";
const zone = value => {
  if (!text(value)) return false;
  try { timezone(value); return true; } catch { return false; }
};
const whole = value => integer(value, 0, Number.MAX_SAFE_INTEGER);
const quantity = value => value === null || integer(value, 1, Number.MAX_SAFE_INTEGER);
const flag = value => typeof value === "boolean";
const record = (value, check, validKey = safeId) => object(value) &&
  Object.entries(value).every(([key, item]) => validKey(key) && object(item) && check(item, key));

const settings = {
  theme: value => ["system", "light", "dark"].includes(value),
  accent: value => availableAccents(true).some(accent => accent.id === value),
  finish: value => finishes.includes(value),
  gender: value => genders.includes(value),
  personalProfile: validPersonalProfile,
  cycleEnabled: flag,
  calendar: value => ["persian", "gregory"].includes(value),
  waterGoal: value => integer(value, 1, 20000),
  waterReminders: value => object(value) && flag(value.enabled) && clock(value.start) && clock(value.end) &&
    integer(value.interval, 15, 240) && integer(value.repeat, 0, value.interval - 1) && instant(value.pauseUntil),
  appointmentReminders: value => object(value) && clock(value.start) && [60, 120].includes(value.interval),
  medicationSnoozeMinutes: value => integer(value, 1, 1440),
  reminderDetails: flag
};
export const webBackupSettings = Object.keys(settings);

export function portable(state) {
  return {
    medicines: state.medicines, doses: state.doses, water: state.water ?? [], visits: state.visits ?? {},
    routines: state.routines ?? {}, routineLogs: state.routineLogs ?? {},
    ...(Object.keys(state.scheduleHistory ?? {}).length ? { scheduleHistory: state.scheduleHistory } : {}),
    ...(state.cycleRecords !== undefined ? { cycleRecords: state.cycleRecords } : {}),
    ...(state.careSchemaVersion !== undefined && { careSchemaVersion: state.careSchemaVersion }),
    ...(state.privacyVersion !== undefined && { privacyVersion: state.privacyVersion, privacyKey: state.privacyKey,
      ...(state.privacyRotation !== undefined && { privacyRotation: state.privacyRotation }) }),
    settings: Object.fromEntries(webBackupSettings.filter(key => state[key] !== undefined).map(key => [key, state[key]]))
  };
}

function validMedicine(row, validatePhases) {
  return text(row.name) && text(row.unit) && optional(row.instructions, text) && Array.isArray(row.phases) &&
    row.phases.length > 0 && row.phases.every(phase => object(phase) && Array.isArray(phase.slots) &&
      phase.slots.every(slot => object(slot) && minute(slot.minute) && quantity(slot.amount))) &&
    validatePhases(row.phases) && optional(row.dates, dates => Array.isArray(dates) && dates.every(day)) &&
    (row.stock == null || Number.isSafeInteger(row.stock)) && optional(row.threshold, whole) &&
    optional(row.effectiveFrom, instant) && optional(row.stockTrackedFrom, instant) && optional(row.revision, whole) &&
    optional(row.scheduleFrom, instant);
}

function validRoutine(row) {
  if (!text(row.name) || !text(row.category) || !(row.minute === null || minute(row.minute))) return false;
  if (row.mode === "quantity") {
    return integer(row.target, 1, maxRoutineAmount) && text(row.unit) &&
      optional(row.amount, value => integer(value, 1, maxRoutineAmount));
  }
  if (row.mode === "steps") {
    return Array.isArray(row.steps) && row.steps.length > 0 && row.steps.length <= maxRoutineSteps && row.steps.every(text) &&
      optional(row.checked, values => Array.isArray(values) && values.every(value => integer(value, 0, row.steps.length - 1)));
  }
  return row.mode === "done" && optional(row.done, flag);
}

function validRoutinePlan(row) {
  return day(row.start) && integer(row.interval, 1, 4) && integer(row.mask, 1, 127) &&
    optional(row.scheduleFrom, instant) && validRoutine(row);
}

function validHistory(history, validatePhases) {
  return object(history) && Object.entries(history).every(([kind, versions]) =>
    ["medicines", "routines"].includes(kind) && Array.isArray(versions) && versions.every(version => {
      if (!object(version) || !object(version.plan) || !safeId(version.plan.id)) return false;
      const medicine = kind === "medicines";
      return instant(version.until) && (medicine ? validMedicine(version.plan, validatePhases) : validRoutinePlan(version.plan)) &&
        (version.plan.scheduleFrom === undefined || version.plan.scheduleFrom < version.until);
    }));
}

// v0 is the original portable format. v1 is emitted by current sync
// clients that predate the bounded v2 contract. Older archives remain readable.
function validContract(data) {
  if (data.careSchemaVersion === undefined) return true;
  if (![1, 2].includes(data.careSchemaVersion)) return false;
  const ids = data.water.map(row => row.id);
  if (new Set(ids).size !== ids.length) return false;
  if (data.careSchemaVersion === 2 && !(
    Object.values(data.medicines).every(row => boundedText(row.name, 256) && boundedText(row.unit, 128) &&
      row.phases.length <= 364 && row.phases.every(phase =>
        phase.slots.length <= 1440 && optional(phase.autoEnd, flag)) &&
      optional(row.archived, flag) && optional(row.paused, flag) && optional(row.phased, flag)) &&
    Object.values(data.visits).every(row => boundedText(row.name, 256) &&
      optional(row.place, value => boundedText(value, 1024)) &&
      optional(row.offsets, offsets => offsets.length <= 1440)) &&
    Object.values(data.routines).every(row => boundedText(row.name, 256) && boundedText(row.category, 128) &&
      optional(row.paused, flag) && optional(row.reminder, flag)) &&
    Object.values(data.scheduleHistory ?? {}).every(rows => new Set(rows.map(({ plan, until }) =>
      JSON.stringify([plan.id, until]))).size === rows.length))) return false;
  return Object.values(data.visits).every(row =>
    optional(row.cancelled, flag) && optional(row.completed, flag) && optional(row.remindersOff, flag) &&
    optional(row.note, text) && optional(row.notes, text) && optional(row.contact, text));
}

function validPrivacy(data) {
  const protectedRecords = data.privacyVersion === 1 && isRecoveryKeyId(data.privacyKey);
  if (!protectedRecords && (data.privacyVersion !== undefined || data.privacyKey !== undefined || data.privacyRotation !== undefined)) return false;
  if (data.privacyRotation !== undefined &&
      (!isRecoveryKeyId(data.privacyRotation) || data.careSchemaVersion !== 2)) return false;
  for (const { kind, rows, key } of privateRows(data)) {
    const row = rows[key];
    if (!object(row) || (protectedRecords
      ? privateFields[kind].some(field => Object.hasOwn(row, field)) || !optional(row.privateText, validPrivateText)
      : row.privateText !== undefined)) return false;
  }
  return true;
}

export function validatePortable(data, validatePhases) {
  if (!object(data) || (data.careSchemaVersion === 2 && !boundedCarePayload(data)) || !object(data.settings) || !Object.entries(data.settings).every(([key, value]) =>
    Object.hasOwn(settings, key) && settings[key](value)) ||
    !record(data.medicines, (row, id) => row.id === id && validMedicine(row, validatePhases)) ||
    !record(data.doses, (row, id) => safeId(row.medicineId) && day(row.day) && minute(row.minute) &&
      id === `${row.medicineId}|${row.day}|${row.minute}` && [null, "taken", "skipped", "snoozed"].includes(row.status) &&
      quantity(row.planned) && quantity(row.actual) && whole(row.debit) && optional(row.snoozeUntil, instant), text) ||
    !Array.isArray(data.water) || !data.water.every(row => object(row) && safeId(row.id) &&
      day(row.day) && clock(row.time) && integer(row.amount, 1, 10000)) ||
    !record(data.visits, (row, id) => row.id === id && text(row.name) && day(row.day) && clock(row.time) &&
      optional(row.zone, zone) && optional(row.offsets, offsets => Array.isArray(offsets) &&
        offsets.every(offset => integer(offset, 0, 43200)))) ||
    !record(data.routines, (row, id) => row.id === id && validRoutinePlan(row)) ||
    !optional(data.cycleRecords, records => record(records, (row, id) =>
      day(Number(id)) && String(Number(id)) === id && (row.end === null || (day(row.end) && row.end >= Number(id))) &&
      ["", "light", "medium", "heavy"].includes(row.flow) &&
      optional(row.note, value => text(value) && value.length <= 500))) ||
    !optional(data.scheduleHistory, history => validHistory(history, validatePhases)) ||
    !record(data.routineLogs, (rows, key) => String(Number(key)) === key && day(Number(key)) &&
      record(rows, validRoutine)) || !validContract(data) || !validPrivacy(data)) throw new Error("invalid_backup");
  const { settings: preferences, ...records } = portable({ ...data, ...data.settings });
  return { ...records, ...preferences, intro: "done" };
}

export const careSyncLimit = 4 * 1024 * 1024;
export const validateCareRecords = records =>
  validatePortable(records, phases => medicationRules.validMedicationPhases(compilePhases(medicationRules, phases)));
export const careSnapshotFits = (owner, revision, records, zone) =>
  new TextEncoder().encode(JSON.stringify({ owner, revision, records, zone })).length <= careSyncLimit;
export const careVersion = (owner, revision) => `"${owner}:${revision}"`;
