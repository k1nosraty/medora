import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { DeviceArchive } from "../../apps/web/src/storage/archive";
import { restoreFile } from "../../apps/web/src/storage/backup";
it("restores the real Android fixture, retains its encrypted original and reconciles device rows", async () => {
  const bytes = await readFile(
    new URL(
      "../../web/test/fixtures/android-medora-v1.medora",
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
