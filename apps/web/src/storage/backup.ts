import {
  readWebBackup,
  isWebBackup,
  writeWebBackup,
} from "../../../../web/public/medication/features/backups/web-format.js";
import { readAndroidBackup } from "../../../../web/public/medication/features/backups/android-format.js";
import {
  decryptBackup,
  hasBackupMagic,
  maxBackupBytes,
} from "../../../../web/public/medication/shared/crypto/backup.js";
import { validateCareRecords } from "../../../../web/public/medication/domain/care-records.js";
import * as engine from "../../../../web/public/medication/domain/medication-rules.js";
import { compilePhases } from "../../../../web/public/medication/domain/care-index.js";
import { archiveImage, DeviceArchive } from "./archive";
import type { Journal } from "./journal";

const phases = (value: unknown) =>
  engine.validMedicationPhases(compilePhases(engine, value));
export async function restoreFile(
  file: Blob,
  password: string,
  db: DeviceArchive,
) {
  if (file.size > maxBackupBytes) throw new Error("backup_size");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const cycle = new TextEncoder().encode("MDORCYC1");
  let state: Record<string, unknown>;
  if (isWebBackup(bytes)) state = await readWebBackup(bytes, password, phases);
  else if (hasBackupMagic(bytes, cycle)) {
    const data = await decryptBackup(bytes, password, cycle);
    state = validateCareRecords({
      medicines: {},
      doses: {},
      water: [],
      visits: {},
      routines: {},
      routineLogs: {},
      settings: {},
      cycleDays: data.cycleDays,
      cycleRecords: data.cycleRecords,
    });
  } else
    state = await readAndroidBackup(
      bytes,
      password,
      phases,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
  // Retain the authenticated original even when the historical reader projects fewer fields.
  const rows = [
    { store: "file", key: "encrypted", value: bytes as unknown },
    ...Object.entries(state).map(([key, value]) => ({
      store: "restored",
      key,
      value,
    })),
  ];
  return archiveImage(db, {
    schema: ["file", "restored"],
    version: 1,
    rows,
    preferences: {},
  });
}
export async function exportProfile(
  db: Journal,
  owner: string,
  password: string,
) {
  const state = await db.transaction("r", db.profiles, db.water, async () => {
    const profile = await db.profiles.get(owner);
    const rows = await db.water
      .where("[owner+day]")
      .between([owner, -719162], [owner, 2932896], true, true)
      .toArray();
    const water = rows
      .filter((r) => r.body)
      .map((r) => ({ ...r.original, id: r.id, ...r.body }));
    return { medicines: {}, doses: {}, ...profile?.settings, water };
  });
  const bytes = await writeWebBackup(state, password, phases);
  return new Blob([Uint8Array.from(bytes)], {
    type: "application/octet-stream",
  });
}
