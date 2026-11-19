import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "./runner.mjs";
import { browserServer } from "./server.mjs";

test("the product installs an updated worker and keeps IndexedDB through offline reload", async ({
  page,
  context,
}) => {
  test.skip(!process.env.MEDORA_PUBLIC_DIR, "Runs against the rebuilt product");
  const original = await readFile(
    join(process.env.MEDORA_PUBLIC_DIR, "medication/sw.js"),
    "utf8",
  );
  const updated = original.replace(
    /(const (?:cacheName|artworkCache) = \w+ \+ "[^"]+)";/g,
    '$1-upgrade-fixture";',
  );
  expect(updated).not.toBe(original);
  let release = original;
  const fixture = browserServer((request, response, url) => {
    if (url.pathname !== "/medication/sw.js") return false;
    response.writeHead(200, {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store",
    });
    response.end(release);
    return true;
  });
  fixture.listen(0, "127.0.0.1");
  await once(fixture, "listening");
  const origin = "http://127.0.0.1:" + fixture.address().port;
  const claimed = () =>
    page.evaluate(() => Boolean(navigator.serviceWorker.controller));
  try {
    await page.goto(origin + "/medication/");
    await page.locator("#welcome-start").click();
    await expect(page.locator("#app")).toBeVisible();
    await expect.poll(claimed).toBe(true);
    await context.setOffline(true);
    await page.locator("#today-water-quick").click();
    await expect(page.locator("#today-water-feedback")).toBeVisible();
    await page.reload();
    const total = page.locator("#today-water-total");
    await expect(total).not.toBeEmpty();
    const before = await total.textContent();
    const storedWater = () =>
      page.evaluate(
        () =>
          new Promise((resolve, reject) => {
            const open = indexedDB.open("medora-medication-prototype");
            open.onerror = () => reject(open.error);
            open.onupgradeneeded = () => open.transaction.abort();
            open.onsuccess = () => {
              const db = open.result;
              const rows = db.transaction("days").objectStore("days").getAll();
              rows.onerror = () => {
                db.close();
                reject(rows.error);
              };
              rows.onsuccess = () => {
                db.close();
                resolve(rows.result.flatMap((bucket) => bucket.water));
              };
            };
          }),
      );
    const records = await storedWater();
    expect(records).toHaveLength(1);
    release = updated;
    await context.setOffline(false);
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      await registration.update();
    });
    await expect(page.locator("#update-app")).toHaveAttribute(
      "data-update-ready",
      "",
    );
    expect(
      await page.evaluate(async () =>
        (await caches.keys()).some(
          (name) =>
            name.startsWith("medora-medication-shell-") &&
            name.endsWith("-upgrade-fixture"),
        ),
      ),
    ).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(total).toHaveText(before);
    expect(await storedWater()).toEqual(records);
    await expect.poll(claimed).toBe(true);
  } finally {
    await context.setOffline(false);
    await page.goto("about:blank");
    const closed = once(fixture, "close");
    fixture.close();
    fixture.closeAllConnections();
    await closed;
  }
});
