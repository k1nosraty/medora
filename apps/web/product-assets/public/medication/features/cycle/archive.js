import { cycleDataFields } from "../../domain/cycle.js";
import { portable, validateCareRecords } from "../../domain/care-records.js";
import {
  decryptBackup,
  encryptBackup,
  maxBackupBytes,
} from "../../shared/crypto/backup.js";

const cycleMagic = new TextEncoder().encode("MDORCYC1");

/** @param {File} file @param {string} password */
export async function readCycleArchive(file, password) {
  if (file.size > maxBackupBytes) throw new Error("size");
  const archive = await decryptBackup(
    new Uint8Array(await file.arrayBuffer()),
    password,
    cycleMagic,
  );
  return validateCareRecords({
    medicines: {},
    doses: {},
    water: [],
    visits: {},
    routines: {},
    routineLogs: {},
    cycleRecords: archive.cycleRecords,
    cycleDays: archive.cycleDays,
    settings: {},
  });
}

/** @param {Parameters<typeof portable>[0]} state @param {string} password */
export function writeCycleArchive(state, password) {
  const safe = portable(state);
  const data = Object.fromEntries(
    cycleDataFields.map((key) => [key, safe[key] ?? {}]),
  );
  return encryptBackup(data, password, cycleMagic);
}
