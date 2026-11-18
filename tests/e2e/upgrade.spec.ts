import { test, expect } from "@playwright/test";
for (const version of [1, 2, 3])
  test(
    "historical device v" +
      version +
      " can be copied and edited without changing the original",
    async ({ page }) => {
      await page.goto("/");
      await page.evaluate(async (version) => {
        const request = indexedDB.open("medora-medication-prototype", version);
        request.onupgradeneeded = () => {
          const care = request.result.createObjectStore("care");
          const day =
            Date.UTC(
              new Date().getFullYear(),
              new Date().getMonth(),
              new Date().getDate(),
            ) / 86400000;
          const water = [
            {
              id: "legacy-water",
              day,
              time: "07:15",
              amount: 321,
              extension: "fixture",
            },
          ];
          const settings = {
            medicines: {},
            custom: { enabled: true },
            syncPending: "private fixture",
          };
          if (version === 1)
            care.put({ ...settings, doses: {}, water }, "state");
          else {
            care.put({ settings, revision: 12, extra: 7 }, "state");
            const days = request.result.createObjectStore("days", {
              keyPath: "day",
            });
            days.put({
              day,
              water,
              doses: {},
              routines: {},
              futureField: "preserved",
            });
          }
          request.result
            .createObjectStore("file")
            .put("opaque extension", "encrypted");
        };
        await new Promise<void>((resolve, reject) => {
          request.onsuccess = () => {
            request.result.close();
            resolve();
          };
          request.onerror = () => reject(request.error);
        });
      }, version);
      await page.getByRole("button", { name: "English" }).click();
      await page
        .getByRole("navigation")
        .getByRole("link", { name: "Device data" })
        .click();
      await page
        .getByRole("button", { name: "Verify and copy earlier app data" })
        .click();
      await page.getByRole("button", { name: /Open restored journal/ }).click();
      await expect(page.getByRole("listitem")).toContainText("321");
      await page.getByRole("button", { name: "Edit 07:15" }).click();
      await page.getByLabel("Water (mL)").fill("350");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByRole("listitem")).toContainText("350");
      const original = await page.evaluate(async () => {
        const r = indexedDB.open("medora-medication-prototype");
        const db = await new Promise<IDBDatabase>((ok, fail) => {
          r.onsuccess = () => ok(r.result);
          r.onerror = () => fail(r.error);
        });
        try {
          const v = db.version;
          const tx = db.transaction(v === 1 ? "care" : "days", "readonly");
          const req = tx.objectStore(v === 1 ? "care" : "days").getAll();
          await new Promise<void>((ok, fail) => {
            tx.oncomplete = () => ok();
            tx.onabort = () => fail(tx.error);
          });
          return {
            version: v,
            amount: req.result[0].water[0].amount,
            extension: req.result[0].water[0].extension,
          };
        } finally {
          db.close();
        }
      });
      expect(original).toEqual({ version, amount: 321, extension: "fixture" });
    },
  );
