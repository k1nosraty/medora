import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { DeviceArchive } from "../../apps/web/src/journal/storage/archive";
import { restoreFile } from "../../apps/web/src/journal/storage/backup";
it("restores the real Android fixture, retains its encrypted original and reconciles device rows", async () => {
  const bytes = await readFile(
    new URL(
      "../compatibility/fixtures/android-medora-v1.medora",
      import.meta.url,
    ),
  );
  const file = new Blob([Uint8Array.from(bytes)]),
    db = new DeviceArchive("restore-" + crypto.randomUUID());
  await expect(restoreFile(file, "incorrect", db)).rejects.toThrow();
  expect(await db.images.count()).toBe(0);
  const report = await restoreFile(file, "MedoraInterop2026", db);
  const rows = await db.rows.where("image").equals(report.id).toArray();
  expect(rows.find((r) => r.key === "encrypted")?.value).toEqual(
    Uint8Array.from(bytes),
  );
  expect(rows.find((r) => r.key === "water")?.value).toHaveLength(7);
  expect(
    Object.values(
      rows.find((r) => r.key === "visits")!.value as Record<
        string,
        { zone: string }
      >,
    )[0]?.zone,
  ).toBe("Asia/Tehran");
  expect(await restoreFile(file, "MedoraInterop2026", db)).toEqual(report);
  db.close();
});

import { Journal } from "../../apps/web/src/journal/storage/journal";
import { exportProfile } from "../../apps/web/src/journal/storage/backup";
import { importProfile } from "../../apps/web/src/journal/storage/profiles";
it("respects device-only cycle care in account backups and round trips a separate cycle archive", async () => {
  const journal = new Journal("privacy-" + crypto.randomUUID()),
    archive = new DeviceArchive("images-" + crypto.randomUUID());
  const password = "synthetic archive passphrase";
  const record = { flow: "light", note: "fixture", symptoms: {} };
  try {
    await journal.updateProfile("device", 0, (settings) => {
      settings.cycleDays = { "20500": record };
      settings.cycleLocalOnly = true;
      settings.cycleSupport = "local fixture";
    });
    for (const destination of ["cloud", "cycle", "device"] as const) {
      const file = await exportProfile(
        journal,
        "device",
        password,
        destination,
      );
      const image = await restoreFile(file, password, archive);
      const owner = await importProfile(archive, journal, image.id);
      const { settings } = await journal.profile(owner);
      if (destination === "cloud") {
        expect(settings.cycleDays).toBeUndefined();
        expect(settings.cycleSupport).toBeUndefined();
      } else expect(settings.cycleDays).toEqual({ "20500": record });
    }
  } finally {
    journal.close();
    archive.close();
  }
});
