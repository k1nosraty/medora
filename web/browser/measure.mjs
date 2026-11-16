import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = resolve(process.argv[2] ?? fileURLToPath(new URL("../public/", import.meta.url)));
const trials = Number(process.argv[3] ?? 3);
if (!Number.isSafeInteger(trials) || trials < 1) throw new Error("Supply a positive trial count");
const port = 8873;
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [fileURLToPath(new URL("./server.mjs", import.meta.url))], {
  env: { ...process.env, MEDORA_PUBLIC_DIR: root, MEDORA_TEST_PORT: String(port) }, stdio: "inherit"
});
let browser;
try {
  for (let index = 0; index < 30; index++) {
    if (await fetch(origin).then(response => response.ok, () => false)) break;
    await sleep(100);
  }
  browser = await chromium.launch({ executablePath: process.env.MEDORA_CHROMIUM });
  const measurements = [];
  for (let trial = 0; trial < trials; trial++) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false, latency: 160, downloadThroughput: 200_000, uploadThroughput: 75_000
    });
    let bytes = 0;
    let requests = 0;
    const resources = new Map();
    const completed = [];
    cdp.on("Network.requestWillBeSent", event => resources.set(event.requestId, new URL(event.request.url).pathname));
    cdp.on("Network.loadingFinished", event => {
      requests++;
      bytes += event.encodedDataLength;
      completed.push({ path: resources.get(event.requestId), bytes: event.encodedDataLength });
    });
    await page.goto(origin + "/medication/", { waitUntil: "commit" });
    await page.locator("#welcome-start").waitFor({ state: "visible" });
    const ready = await page.evaluate(() => Math.round(performance.now()));
    measurements.push({ usableMs: ready, requests, transferBytes: bytes,
      largest: completed.sort((a, b) => b.bytes - a.bytes).slice(0, 4) });
    await context.close();
  }
  const worker = await readFile(join(root, "medication/sw.js"), "utf8");
  const shell = JSON.parse(/const shell = (\[[\s\S]*?\]);/.exec(worker)[1]);
  const paths = await Promise.all(shell.map(url => stat(join(root, url, url.endsWith("/") ? "index.html" : ""))));
  const percentile = (field, fraction) =>
    measurements.map(trial => trial[field]).sort((a, b) => a - b)[Math.ceil(trials * fraction) - 1];
  console.log(JSON.stringify({ root, network: "160 ms, 200 kB/s down, 75 kB/s up", trials: measurements,
    median: { usableMs: percentile("usableMs", 0.5), requests: percentile("requests", 0.5),
      transferBytes: percentile("transferBytes", 0.5) }, p95: { usableMs: percentile("usableMs", 0.95) },
    shell: { requests: shell.length, bytes: paths.reduce((sum, file) => sum + file.size, 0) } }, null, 2));
} finally {
  await browser?.close();
  const stopped = once(server, "exit");
  server.kill();
  await stopped;
}
