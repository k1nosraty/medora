import { dayMs, localWall, timezone } from "./wall-clock.js";

export const maxBackupBytes = 16 * 1024 * 1024;
const headerSize = 36;
const magic = new Uint8Array([77, 69, 68, 79, 82, 65, 0, 1]);
const maxQuantity = 1_000_000_000;
const clockPattern = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?$/;
const icons = { TABLET: "tablet", CAPSULE: "capsule", SYRUP: "syrup", AMPOULE: "injection",
  OINTMENT: "ointment", DROPS: "drops", SPRAY: "spray", SACHET: "sachet", POWDER: "powder" };
const colors = { ORANGE: "gold", TEAL: "green", BLUE: "blue", LAVENDER: "purple", ROSE: "rose", SLATE: "slate" };
const statuses = { PENDING: null, TAKEN: "taken", SNOOZED: null, SKIPPED: "skipped" };
const medicineLook = row => ({
  icon: Object.hasOwn(icons, row.icon) ? icons[row.icon] : "capsule",
  color: Object.hasOwn(colors, row.color) ? colors[row.color] : "gold"
});

function requireValue(condition) {
  if (!condition) throw new Error("invalid_backup");
}
function integer(value, min, max) {
  requireValue(Number.isSafeInteger(value) && value >= min && value <= max);
  return value;
}
function array(value) {
  requireValue(Array.isArray(value));
  return value;
}
function string(value, required = false) {
  requireValue(typeof value === "string" && (!required || value.trim()));
  return value;
}
function boolean(value) {
  requireValue(typeof value === "boolean");
  return value;
}
function identifier(value) {
  string(value, true);
  requireValue(value.length <= 512 && !Object.hasOwn(Object.prototype, value) && value !== "prototype");
  return value;
}
function timestamp(value, min = 0) {
  return integer(value, min, 8_640_000_000_000_000);
}
function day(value) {
  requireValue(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value));
  const date = new Date(`${value}T00:00:00Z`);
  requireValue(Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value);
  return date.getTime() / dayMs;
}
function clock(value) {
  requireValue(typeof value === "string" && clockPattern.test(value));
  return value;
}
function wall(value) {
  const [date, time, extra] = string(value).split("T");
  requireValue(extra === undefined);
  return { day: day(date), time: clock(time) };
}
const minute = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const quantity = value => value == null ? null : integer(value, 1, maxQuantity);

function unique(rows, convert, key = item => item.id) {
  const entries = new Map();
  for (const row of array(rows)) {
    const item = convert(row);
    const id = key(item);
    requireValue(!entries.has(id));
    entries.set(id, item);
  }
  return entries;
}

function decodeMedication(row, validatePhases) {
  const id = identifier(row.id);
  const start = day(row.startDay);
  const dates = [...new Set(array(row.dates).map(day))].sort((a, b) => a - b);
  const weekdays = array(row.weekdays).reduce((mask, value) => mask | (1 << (integer(value, 1, 7) - 1)), 0);
  const times = [...new Set(array(row.times).map(time => minute(clock(time))))].sort((a, b) => a - b);
  requireValue(times.length >= 1 && times.length <= 12 && (dates.length || weekdays));
  const amount = quantity(row.amount);
  const phases = array(row.phases ?? []).map(phase => ({
    start: integer(phase.start, -719162, 2932896),
    end: phase.endBefore == null ? null : integer(phase.endBefore, -719162, 2932896),
    interval: integer(phase.intervalWeeks, 1, 52),
    mask: integer(phase.weekdayMask, 1, 127),
    slots: array(phase.slots).map(slot => ({ minute: integer(slot.minute, 0, 1439), amount: quantity(slot.amount) }))
  }));
  const phased = phases.length > 0;
  if (!phased) phases.push({ start, end: null, interval: 1, mask: dates.length ? 127 : weekdays,
    slots: times.map(minute => ({ minute, amount })) });
  requireValue(validatePhases(phases));
  const unit = string(row.unit ?? "");
  requireValue(unit.length <= 40 && (unit.trim() || !phases.some(phase => phase.slots.some(slot => slot.amount !== null))));
  const stock = row.stock;
  if (stock) requireValue(unit.trim() && phases.every(phase => phase.slots.every(slot => slot.amount !== null)));
  return {
    id, name: string(row.name, true), instructions: string(row.instructions), unit, phases, phased,
    dates: phased ? [] : dates, paused: !boolean(row.active), effectiveFrom: timestamp(row.effectiveFrom ?? 0),
    stock: stock ? integer(stock.balance, -maxQuantity, maxQuantity) : null,
    threshold: stock ? integer(stock.threshold, 0, maxQuantity) : 2000,
    stockTrackedFrom: stock ? timestamp(stock.trackedFrom) : 0, revision: 1,
    ...medicineLook(row)
  };
}

function convertBackup(data, validatePhases, zone) {
  integer(data.schema, 2, 8);
  const s = data.settings;
  const start = clock(s.start).slice(0, 5);
  const end = clock(s.end).slice(0, 5);
  const interval = integer(s.interval, 15, 240);
  const calendar = s.calendar ?? "jalali";
  requireValue(start < end && ["jalali", "gregorian"].includes(calendar));
  const appointmentInterval = s.appointmentInterval ?? 120;
  requireValue([60, 120].includes(appointmentInterval));
  const displayClock = timezone(zone);
  const water = unique(data.water, row => ({
    id: identifier(row.id), amount: integer(row.ml, 1, 10000), day: day(row.day),
    time: new Date(localWall(timestamp(row.at, -8_640_000_000_000_000), displayClock)).toISOString().slice(11, 16)
  }));
  const medicines = unique(data.medications, row => decodeMedication(row, validatePhases));
  const doseIds = new Set();
  const doses = unique(data.doses, row => {
    const id = identifier(row.id);
    requireValue(!doseIds.has(id) && Object.hasOwn(statuses, row.status));
    doseIds.add(id);
    const slot = wall(row.wall);
    const actual = quantity(row.actualAmount);
    const debit = integer(row.stockDebit ?? 0, 0, maxQuantity);
    requireValue(debit === 0 || row.status === "TAKEN" && debit === actual);
    return { medicineId: identifier(row.medicationId), day: slot.day, minute: minute(slot.time),
      planned: quantity(row.amount), status: statuses[row.status], actual, debit, snoozeUntil: 0, imported: true,
      name: string(row.name), instructions: string(row.instructions), unit: string(row.unit ?? ""), ...medicineLook(row) };
  }, item => `${item.medicineId}|${item.day}|${item.minute}`);
  const visits = unique(data.appointments, row => {
    const zone = string(row.zone, true);
    timezone(zone);
    return { id: identifier(row.id), name: string(row.title, true), ...wall(row.wall), zone,
      place: string(row.location), note: string(row.notes), contact: string(row.contact),
      offsets: [...new Set(array(row.offsets).map(value => integer(value, 0, 43200)))], cancelled: boolean(row.cancelled) };
  });
  return {
    medicines: Object.fromEntries(medicines), doses: Object.fromEntries(doses), visits: Object.fromEntries(visits),
    water: [...water.values()], waterGoal: integer(s.goal, 1, 20000),
    waterReminders: { start, end, interval, enabled: boolean(s.waterEnabled), repeat: integer(s.repeat, 0, interval - 1), pauseUntil: 0 },
    appointmentReminders: { start: clock(s.appointmentStart ?? "08:00").slice(0, 5), interval: appointmentInterval },
    medicationSnoozeMinutes: integer(s.medicationSnoozeMinutes ?? 10, 1, 1440),
    calendar: calendar === "gregorian" ? "gregory" : "persian",
    intro: "done"
  };
}

export async function readAndroidBackup(bytes, password, validatePhases, zone) {
  requireValue(bytes.length >= headerSize + 16 && bytes.length <= maxBackupBytes &&
    magic.every((byte, index) => bytes[index] === byte) && password.length > 0 && password.length <= 128);
  const encoded = new TextEncoder().encode(password);
  let passwordKey;
  try {
    passwordKey = await crypto.subtle.importKey("raw", encoded, "PBKDF2", false, ["deriveKey"]);
  } finally {
    encoded.fill(0);
  }
  const key = await crypto.subtle.deriveKey({
    name: "PBKDF2", salt: bytes.subarray(8, 24), iterations: 600_000, hash: "SHA-256"
  }, passwordKey, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const plain = new Uint8Array(await crypto.subtle.decrypt({
    name: "AES-GCM", iv: bytes.subarray(24, headerSize), additionalData: bytes.subarray(0, headerSize), tagLength: 128
  }, key, bytes.subarray(headerSize)));
  try {
    return convertBackup(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plain)), validatePhases, zone);
  } finally {
    plain.fill(0);
  }
}
