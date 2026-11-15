import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = resolve(process.argv[2] ?? fileURLToPath(new URL("../public/", import.meta.url)));
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
  for (let trial = 0; trial < 3; trial++) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false, latency: 160, downloadThroughput: 200_000, uploadThroughput: 75_000
    });
    let bytes = 0;
    let requests = 0;
    cdp.on("Network.loadingFinished", event => { requests++; bytes += event.encodedDataLength; });
    await page.goto(origin + "/medication/", { waitUntil: "commit" });
    await page.locator("#welcome-start").waitFor({ state: "visible" });
    const ready = await page.evaluate(() => Math.round(performance.now()));
    measurements.push({ usableMs: ready, requests, transferBytes: bytes });
    await context.close();
  }
  const worker = await readFile(join(root, "medication/sw.js"), "utf8");
  const shell = JSON.parse(/const shell = (\[[\s\S]*?\]);/.exec(worker)[1]);
  const paths = await Promise.all(shell.map(url => stat(join(root, url, url.endsWith("/") ? "index.html" : ""))));
  const median = field => measurements.map(trial => trial[field]).sort((a, b) => a - b)[1];
  console.log(JSON.stringify({ root, network: "160 ms, 200 kB/s down, 75 kB/s up", trials: measurements,
    median: { usableMs: median("usableMs"), requests: median("requests"), transferBytes: median("transferBytes") },
    shell: { requests: shell.length, bytes: paths.reduce((sum, file) => sum + file.size, 0) } }, null, 2));
} finally {
  await browser?.close();
  const stopped = once(server, "exit");
  server.kill();
  await stopped;
}
