import { chromium } from "@playwright/test";
import { stat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
const url = new URL(process.argv[2]);
if (!["localhost", "127.0.0.1"].includes(url.hostname))
  throw Error("Loopback preview required");
const browser = await chromium.launch({
  executablePath: process.env.MEDORA_CHROMIUM,
});
const samples = [];
try {
  for (let i = 0; i < 3; i++) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.measurements = { lcp: 0, cls: 0, interaction: 0 };
      for (const type of [
        "largest-contentful-paint",
        "layout-shift",
        "event",
      ]) {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            if (type === "largest-contentful-paint")
              window.measurements.lcp = e.startTime;
            if (type === "layout-shift" && !e.hadRecentInput)
              window.measurements.cls += e.value;
            if (type === "event" && e.interactionId)
              window.measurements.interaction = Math.max(
                window.measurements.interaction,
                e.duration,
              );
          }
        }).observe({
          type,
          buffered: true,
          ...(type === "event" && { durationThreshold: 16 }),
        });
      }
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 160,
      downloadThroughput: 200000,
      uploadThroughput: 75000,
    });
    await page.goto(url.href, { waitUntil: "commit" });
    await page.getByRole("heading", { name: "امروز", exact: true }).waitFor();
    const usable = await page.evaluate(() => performance.now());
    await page.waitForLoadState("networkidle");
    const first = await page.evaluate(() => ({
      ttfb: performance.getEntriesByType("navigation")[0].responseStart,
      ...window.measurements,
    }));
    const start = await page.evaluate(() => performance.now());
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "آب", exact: true })
      .click();
    await page.getByRole("button", { name: "ثبت آب", exact: true }).waitFor();
    const route = await page.evaluate(() => performance.now());
    await page.getByRole("button", { name: "ثبت آب", exact: true }).click();
    await page.getByRole("listitem").waitFor();
    await page.waitForTimeout(200);
    const observedInteraction = await page.evaluate(
      () => window.measurements.interaction,
    );
    await page.evaluate(async () => {
      const open = indexedDB.open("medora-journal-v2");
      const db = await new Promise((resolve, reject) => {
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      const tx = db.transaction("water", "readwrite"),
        table = tx.objectStore("water"),
        now = new Date();
      const day =
        Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000;
      for (let i = 0; i < 12000; i++) {
        const fixtureDay = i < 2000 ? day : day - 1 - (i % 90);
        table.put({
          owner: "device",
          id: "fixture-" + i,
          revision: 1,
          day: fixtureDay,
          body: { amount: 1, day: fixtureDay, time: "12:00" },
        });
      }
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    });
    await page.reload({ waitUntil: "commit" });
    await page.getByRole("listitem").nth(39).waitFor();
    await page.getByRole("button", { name: "بعدی", exact: true }).waitFor();
    const largeList = await page.evaluate(() => performance.now());
    await page.getByRole("button", { name: "بعدی", exact: true }).click();
    if ((await page.getByRole("listitem").count()) !== 40)
      throw Error("Paging failed");
    samples.push({
      ...first,
      largeList,
      interaction: observedInteraction,
      usable,
      route: route - start,
    });
    await context.close();
  }
  const assets = "apps/web/dist/assets";
  const js = (await readdir(assets)).find((n) => /^index-.*\.js$/.test(n));
  const contents = await readFile(join(assets, js));
  console.log(
    JSON.stringify({
      samples,
      initialJsBytes: (await stat(join(assets, js))).size,
      initialJsGzipBytes: gzipSync(contents).byteLength,
    }),
  );
} finally {
  await browser.close();
}
