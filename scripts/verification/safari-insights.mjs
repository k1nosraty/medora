import { spawn } from "node:child_process";
import { createECDH } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { browserServer } from "../../tests/browser/server.mjs";

if (process.platform !== "darwin") {
  console.error("Native Safari verification requires macOS and Safari WebDriver.");
  process.exit(2);
}

async function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function unusedPort() {
  const socket = createServer();
  const port = await listen(socket);
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

async function until(check, description) {
  const deadline = performance.now() + 8_000;
  do {
    if (await check()) return;
    await delay(100);
  } while (performance.now() < deadline);
  throw Error(description);
}

function start(command, args) {
  const child = spawn(command, args, { stdio: "ignore" });
  child.on("error", () => {});
  return child;
}

const publicKey = createECDH("prime256v1").generateKeys().toString("base64url");
const fixture = browserServer((_request, response, url) => {
  if (url.pathname !== "/api/config") return false;
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ publicKey }));
  return true;
});
const fixturePort = await listen(fixture);
const caddyPort = await unusedPort();
const driverPort = await unusedPort();
const origin = `http://127.0.0.1:${caddyPort}`;
const driverOrigin = `http://127.0.0.1:${driverPort}`;
const scratch = await mkdtemp(join(tmpdir(), "medora-safari-"));
const config = join(scratch, "Caddyfile");
await writeFile(config, `{\n  admin off\n  persist_config off\n}\n${origin} {\n  bind 127.0.0.1\n  reverse_proxy 127.0.0.1:${fixturePort}\n}\n`);
const caddy = start("caddy", ["run", "--config", config, "--adapter", "caddyfile"]);
const driver = start("/usr/bin/safaridriver", ["--port", String(driverPort)]);
const timing = {};
const started = performance.now();
let session;
let phase = "fixture startup";

async function command(path, body, method = body ? "POST" : "GET") {
  const response = await fetch(driverOrigin + path, {
    method, signal: AbortSignal.timeout(10_000),
    ...(body && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const { value } = await response.json();
  if (!response.ok) throw Error(value?.message ?? "Safari WebDriver command failed");
  return value;
}

const execute = (script, args = []) => command(`${session}/execute/sync`, { script, args });

async function click(selector) {
  const value = await command(`${session}/element`, { using: "css selector", value: selector });
  const element = value["element-6066-11e4-a52e-4f735466cecf"];
  await command(`${session}/element/${element}/click`, {});
}

async function visible(selector) {
  await until(() => execute("return Boolean(document.querySelector(arguments[0])?.getClientRects().length)", [selector]), selector);
}

async function reports() {
  await visible("#app[data-active-screen=insights]");
  await click('[data-insight="reports"]');
  await visible('[data-report-range="month"]');
}

function mark(name) {
  timing[name] = Math.round(performance.now() - started);
}

try {
  await until(async () => {
    const response = await fetch(origin, { signal: AbortSignal.timeout(1000) }).catch(() => null);
    return response?.ok && await response.text() === "Medora browser tests";
  }, "Local Caddy fixture did not start. Ensure Caddy is available on PATH.");
  await until(() => command("/status").then(() => true, () => false), "Safari WebDriver did not start.");
  phase = "new Safari session";
  const { sessionId, capabilities } = await command("/session", { capabilities: { alwaysMatch: {
    browserName: "safari", pageLoadStrategy: "eager", timeouts: { pageLoad: 8_000, script: 5_000, implicit: 0 },
  } } });
  session = `/session/${sessionId}`;
  phase = "direct Insights navigation";
  await command(`${session}/url`, { url: `${origin}/medication/?view=insights` });
  await visible("#welcome-start");
  await click("#welcome-start");
  await reports();
  mark("onlineReports");
  phase = "service worker activation";
  await until(() => execute("return Boolean(isSecureContext && navigator.serviceWorker.controller?.scriptURL.endsWith('/medication/sw.js'))"), "Medication Service Worker did not take control.");
  mark("workerControlled");
  phase = "offline reload";
  // Keep the origin unchanged while making it unreachable over the network.
  const gatewayStopped = once(caddy, "exit", { signal: AbortSignal.timeout(5_000) });
  caddy.kill();
  await gatewayStopped;
  await command(`${session}/refresh`, {});
  await reports();
  mark("offlineReports");
  phase = "session teardown";
  await command(session, undefined, "DELETE");
  session = undefined;
  console.log(JSON.stringify({ safari: capabilities.browserVersion, worker: "controlled", onlineReports: true, offlineReports: true, timingsMs: timing }));
} catch (error) {
  console.error(JSON.stringify({ phase, timingsMs: timing, error: error.message }));
  process.exitCode = 1;
} finally {
  if (session) await command(session, undefined, "DELETE").catch(() => {});
  driver.kill();
  caddy.kill();
  fixture.close();
  fixture.closeAllConnections();
  await rm(scratch, { recursive: true, force: true });
}
