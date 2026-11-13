import { decryptBackup, encryptBackup, hasBackupMagic } from "./crypto.js";
import { maxRoutineAmount, maxRoutineSteps } from "../../domain/routine-plan.js";
import { isBaseAccent } from "../../styles/theme.js";
import { timezone } from "../../domain/wall-clock.js";

const magic = new Uint8Array([77, 69, 68, 79, 82, 65, 87, 1]);
export const isWebBackup = bytes => hasBackupMagic(bytes, magic);
export const validBackupPassword = password => [...password].length >= 15 && password.length <= 128;

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
  accent: isBaseAccent,
  calendar: value => ["persian", "gregory"].includes(value),
  waterGoal: value => integer(value, 1, 20000),
  waterReminders: value => object(value) && flag(value.enabled) && clock(value.start) && clock(value.end) &&
    integer(value.interval, 15, 240) && integer(value.repeat, 0, value.interval - 1) && instant(value.pauseUntil),
  appointmentReminders: value => object(value) && clock(value.start) && [60, 120].includes(value.interval),
  medicationSnoozeMinutes: value => integer(value, 1, 1440),
  reminderDetails: flag
};
export const webBackupSettings = Object.keys(settings);

function portable(state) {
  return {
    medicines: state.medicines, doses: state.doses, water: state.water ?? [], visits: state.visits ?? {},
    routines: state.routines ?? {}, routineLogs: state.routineLogs ?? {},
    ...(Object.keys(state.scheduleHistory ?? {}).length ? { scheduleHistory: state.scheduleHistory } : {}),
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

function validate(data, validatePhases) {
  if (!object(data) || !object(data.settings) || !Object.entries(data.settings).every(([key, value]) =>
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
    !optional(data.scheduleHistory, history => validHistory(history, validatePhases)) ||
    !record(data.routineLogs, (rows, key) => String(Number(key)) === key && day(Number(key)) &&
      record(rows, validRoutine))) throw new Error("invalid_backup");
  const { settings: preferences, ...records } = portable({ ...data, ...data.settings });
  return { ...records, ...preferences, intro: "done" };
}

export async function writeWebBackup(state, password, validatePhases) {
  if (!validBackupPassword(password)) throw new Error("backup_password");
  const data = portable(state);
  validate(data, validatePhases);
  return encryptBackup(data, password, magic);
}

export async function readWebBackup(bytes, password, validatePhases) {
  return validate(await decryptBackup(bytes, password, magic), validatePhases);
}
