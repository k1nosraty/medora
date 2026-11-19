import {
  cycleDataFields,
  cyclePreferenceFields,
} from "@medora/domain/browser/cycle";
import {
  readWebBackup,
  isWebBackup,
  writeWebBackup,
  validBackupPassword,
} from "../../../product-assets/public/medication/features/backups/web-format.js";
import { readAndroidBackup } from "../../../product-assets/public/medication/features/backups/android-format.js";
import {
  decryptBackup,
  encryptBackup,
  hasBackupMagic,
  maxBackupBytes,
} from "@medora/domain/crypto/backup";
import { validateCareRecords } from "@medora/domain/browser/care-records";
import * as engine from "@medora/domain/browser/medication-rules";
import { compilePhases } from "@medora/domain/browser/care-index";
import { archiveImage, DeviceArchive } from "./archive";
import type { Journal } from "./journal";

const cycleMagic = new TextEncoder().encode("MDORCYC1");
const phases = (value: unknown) =>
  engine.validMedicationPhases(compilePhases(engine, value));
export async function restoreFile(
  file: Blob,
  password: string,
  db: DeviceArchive,
) {
  if (file.size > maxBackupBytes) throw new Error("backup_size");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const cycle = cycleMagic;
  let state: Record<string, unknown>;
  if (isWebBackup(bytes)) state = await readWebBackup(bytes, password, phases);
  else if (hasBackupMagic(bytes, cycle)) {
    const data = await decryptBackup(bytes, password, cycle);
    if(!data || typeof data!=="object" || !Object.hasOwn(data,"cycleDays") || !Object.hasOwn(data,"cycleRecords"))throw Error("invalid_cycle_archive");
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
  destination: "device" | "cloud" | "cycle" = "device",
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
    const values = { ...profile?.settings };
    if (destination === "cloud" && values.cycleLocalOnly === true) {
      for (const key of [
        ...cycleDataFields,
        ...cyclePreferenceFields,
        "cycleCardSize",
      ])
        delete values[key];
    }
    return { medicines: {}, doses: {}, ...values, water } as Record<
      string,
      unknown
    >;
  });
  if (!validBackupPassword(password)) throw Error("backup_password");
  const bytes =
    destination === "cycle"
      ? await encryptBackup(
          {
            cycleDays: state.cycleDays ?? {},
            cycleRecords: state.cycleRecords ?? {},
          },
          password,
          cycleMagic,
        )
      : await writeWebBackup(state, password, phases);
  return new Blob([Uint8Array.from(bytes)], {
    type: "application/octet-stream",
  });
}
