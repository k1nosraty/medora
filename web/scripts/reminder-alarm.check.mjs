import { createRequire } from "node:module";
import { createECDH, createHash, randomBytes } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import assert from "node:assert/strict";
const require = createRequire(process.cwd() + "/package.json");
const { Miniflare, Response, convertV4MiniflareOptions } = require("miniflare");
const { build } = require("esbuild");
const { outputFiles } = await build({ entryPoints: ["src/worker.mjs"], bundle: true, platform: "browser",
  format: "esm", external: ["cloudflare:workers"], write: false });
const server = createECDH("prime256v1");
const client = createECDH("prime256v1");
const code = randomBytes(18).toString("hex");
const publicKey = server.generateKeys().toString("base64url");
const privateKey = Buffer.alloc(32);
server.getPrivateKey().copy(privateKey, 32-server.getPrivateKey().length);
const outbound = [];
const mf = new Miniflare(convertV4MiniflareOptions({
  modules: true, script: outputFiles[0].text, compatibilityDate: "2026-10-29",
  bindings: { PILOT_ACCESS_CODE: code, REMINDER_SIGNING_KEY: randomBytes(32).toString("hex"), VAPID_PUBLIC_KEY: publicKey,
    VAPID_PRIVATE_KEY: privateKey.toString("base64url"), VAPID_SUBJECT: "https://github.com/k1nosraty/medora" },
  durableObjects: { PILOT: { className: "PushPilot", useSQLite: true }, REMINDERS: { className: "MedicationReminders", useSQLite: true } },
  outboundService: async request => {
    outbound.push({ at: Date.now(), url: request.url, auth: request.headers.get("Authorization"),
      encoding: request.headers.get("Content-Encoding"), size: (await request.arrayBuffer()).byteLength });
    return new Response(null, { status: 201 });
  }
}));
try {
  const origin = "https://pilot.test";
  const api = "/api/reminders";
  const http = (path, method, token, body, requestOrigin = origin) => mf.dispatchFetch(origin + path, {
    method, headers: { Origin: requestOrigin, Authorization: "Bearer " + token, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const subscription = { endpoint: "https://web.push.apple.com/dose-test-endpoint",
    keys: { p256dh: client.generateKeys().toString("base64url"), auth: randomBytes(16).toString("base64url") } };
  const id = createHash("sha256").update(subscription.endpoint).digest("hex").slice(0, 32);
  assert.equal((await http(api + "/enroll", "POST", code, { id }, "https://another.test")).status, 401);
  const enrollment = await http(api + "/enroll", "POST", code, { id });
  assert.equal(enrollment.status, 200);
  const { token } = await enrollment.json();
  assert.equal((await http(api, "GET", token.slice(0,-1) + (token.endsWith("0") ? "1" : "0"))).status, 401);
  const due = Math.ceil((Date.now()+7500)/60_000)*60_000;
  const day = Math.floor(due/86_400_000);
  const minute = (due % 86_400_000)/60_000;
  const schedule = (revision, skip = []) => ({
    revision, enabled: true, zone: "UTC", subscription, rules: [{ start: day, end: null, interval: 1, mask: 127, minutes: [minute], skip }]
  });
  const replace = async body => {
    const result = await http(api, "PUT", token, body);
    assert.equal(result.status, 200, await result.clone().text());
    return result.json();
  };
  assert.equal((await replace(schedule(1))).next, due);
  assert.equal((await replace(schedule(2, [[day, minute]]))).next, due+86_400_000);
  assert.equal((await replace(schedule(1))).next, due+86_400_000);
  assert.equal((await replace(schedule(3))).next, due);
  console.log("Scheduling, suppression, older revision rejection and authentication passed.");
  await sleep(due-Date.now()+2000);
  let result;
  for (let i=0; i<12; i++) {
    result = await (await http(api, "GET", token)).json();
    if (result.last?.status === "accepted") break;
    await sleep(500);
  }
  assert.equal(result.last?.status, "accepted", JSON.stringify(result));
  assert.equal(result.next, due+86_400_000);
  assert.equal(outbound.length, 1);
  assert.equal(outbound[0].encoding, "aes128gcm");
  assert.equal(outbound[0].size, 4096);
  assert.ok(outbound[0].at>=due);
  assert.equal((await replace({ revision: 4, enabled: false })).next, null);
  console.log("Real scheduled alarm fired without an open client, encrypted payload accepted, next dose and disabling verified.");
} finally {
  await mf.dispose();
}
