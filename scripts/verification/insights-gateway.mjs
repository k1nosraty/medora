import { webkit } from "@playwright/test";

const origin = new URL(process.argv[2]);
if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1" ||
    origin.href !== origin.origin + "/")
  throw Error("Supply the origin of an isolated loopback Caddy fixture");

const serviceWorkers = process.argv.includes("--block-worker") ? "block" : "allow";
const browser = await webkit.launch({ timeout: 8_000 });
const timing = {};
const responses = [];
const failures = [];
const timeout = 5_000;
let phase = "navigation";
let error;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers });
  const page = await context.newPage();
  const start = performance.now();
  const mark = () => { timing[phase] = Math.round(performance.now() - start); };
  page.on("response", (response) => responses.push({
    path: new URL(response.url()).pathname,
    status: response.status(),
    worker: response.fromServiceWorker(),
  }));
  page.on("requestfailed", (request) => failures.push(new URL(request.url()).pathname));
  const ready = page.locator("#app[data-active-screen=insights]:visible");
  async function showReports() {
    await page.locator('[data-insight="reports"]').click({ timeout });
    await page.locator('[data-report-range="month"]:visible').waitFor({ timeout });
  }

  await page.goto(new URL("/medication/?view=insights", origin).href, { waitUntil: "commit", timeout });
  mark();
  phase = "welcome";
  const welcome = page.locator("#welcome-start:visible");
  await welcome.waitFor({ timeout });
  mark();
  phase = "welcome interaction";
  await welcome.click({ timeout });
  await ready.waitFor({ timeout });
  mark();
  phase = "reports";
  await showReports();
  mark();
  if (serviceWorkers === "allow") {
    phase = "worker activation";
    await page.waitForFunction(() => navigator.serviceWorker.controller?.scriptURL.endsWith("/medication/sw.js"), null, { timeout });
    mark();
    phase = "offline reload";
    await context.setOffline(true);
    await page.reload({ waitUntil: "commit", timeout });
    await ready.waitFor({ timeout });
    await showReports();
    mark();
  }
} catch (problem) {
  error = problem.message.split("\n")[0];
  process.exitCode = 1;
} finally {
  console.log(JSON.stringify({ webkit: browser.version(), serviceWorkers, phase, timing, responses, failures, error }));
  await browser.close();
}
