import { createRequire } from "node:module";
import { createECDH, createHash, createHmac, randomBytes } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import assert from "node:assert/strict";
const require = createRequire(process.cwd() + "/package.json");
const { Miniflare, Response, convertV4MiniflareOptions } = require("miniflare");
const { build } = require("esbuild");
const { outputFiles } = await build({ entryPoints: ["src/worker.mjs"], bundle: true, platform: "browser",
  format: "esm", external: ["cloudflare:workers", "node:crypto"], write: false });
const server = createECDH("prime256v1");
const client = createECDH("prime256v1");
const signingKey = randomBytes(32).toString("hex");
const publicKey = server.generateKeys().toString("base64url");
const privateKey = Buffer.alloc(32);
server.getPrivateKey().copy(privateKey, 32-server.getPrivateKey().length);
const outbound = [];
const mf = new Miniflare(convertV4MiniflareOptions({
  modules: true, script: outputFiles[0].text, compatibilityDate: "2026-10-29",
  compatibilityFlags: ["nodejs_compat"],
  bindings: { REMINDER_SIGNING_KEY: signingKey, VAPID_PUBLIC_KEY: publicKey,
    VAPID_PRIVATE_KEY: privateKey.toString("base64url"), VAPID_SUBJECT: "https://github.com/k1nosraty/medora" },
  ratelimits: {
    PUSH_ENROLL_LIMIT: { namespace_id: "750501", simple: { limit: 4, period: 60 } },
    PUSH_DEVICE_LIMIT: { namespace_id: "750502", simple: { limit: 60, period: 60 } }
  },
  durableObjects: { PILOT: { className: "PushPilot", useSQLite: true }, REMINDERS: { className: "MedicationReminders", useSQLite: true } },
  outboundService: async request => {
    outbound.push({ at: Date.now(), url: request.url, auth: request.headers.get("Authorization"),
      encoding: request.headers.get("Content-Encoding"), topic: request.headers.get("Topic"), size: (await request.arrayBuffer()).byteLength });
    return new Response(null, { status: 201 });
  }
}));
try {
  const origin = "https://pilot.test";
  const api = "/api/reminders";
  const http = (path, method, token, body, requestOrigin = origin) => mf.dispatchFetch(origin + path, {
    method, headers: { Origin: requestOrigin, "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const subscription = { endpoint: "https://web.push.apple.com/dose-test-endpoint",
    keys: { p256dh: client.generateKeys().toString("base64url"), auth: randomBytes(16).toString("base64url") } };
  const id = createHash("sha256").update(subscription.endpoint).digest("hex").slice(0, 32);
  const oldToken = `${id}.${createHmac("sha256", signingKey).update(`medora-install-v1:${id}`).digest("hex")}`;
  const enroll = (data, origin) => http(api + "/enroll", "POST", null, data, origin);
  assert.equal((await enroll({ subscription }, "https://another.test")).status, 401);
  assert.equal((await enroll({ id })).status, 400);
  const invalidKey = Buffer.alloc(65);
  invalidKey[0] = 4;
  assert.equal((await enroll({ subscription: { ...subscription, keys: { ...subscription.keys, p256dh: invalidKey.toString("base64url") } } })).status, 400);
  const enrollment = await enroll({ subscription });
  assert.equal(enrollment.status, 200);
  const { token } = await enrollment.json();
  assert.notEqual(token, oldToken);
  const otherSubscription = { ...subscription, keys: { ...subscription.keys, auth: randomBytes(16).toString("base64url") } };
  const { token: otherToken } = await (await enroll({ subscription: otherSubscription })).json();
  assert.match(otherToken, /^[a-f0-9]{32}\.[a-f0-9]{64}$/);
  assert.notEqual(otherToken, token);
  assert.equal((await enroll({ subscription })).status, 429);
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
  assert.equal((await http(api, "PUT", otherToken, schedule(1))).status, 400);
  const legacy = await http(api, "PUT", oldToken, { ...schedule(1), rules: [] });
  assert.equal(legacy.status, 200);
  assert.equal((await legacy.json()).enabled, true);
  assert.equal((await http(api, "GET", oldToken)).status, 200);
  assert.equal((await replace(schedule(1))).next, due);
  assert.equal((await replace(schedule(2, [[day, minute]]))).next, due+86_400_000);
  assert.equal((await replace(schedule(1))).next, due+86_400_000);
  const waterStart = Math.min(minute, 1438);
  const waterPlan = minute === 1439 ? { start: waterStart - 59, end: 1439, interval: 60, repeat: 0,
    pauseUntil: 0, goalDay: day } : { start: waterStart, end: waterStart + 1, interval: 60, repeat: 0,
    pauseUntil: 0, goalDay: null };
  assert.equal((await replace({ ...schedule(3), water: waterPlan })).next, due);
  console.log("Scheduling, suppression, older revision rejection and authentication passed.");
  await sleep(due-Date.now()+2000);
  let result;
  for (let i=0; i<12; i++) {
    result = await (await http(api, "GET", token)).json();
    if (result.last?.status === "accepted") break;
    await sleep(500);
  }
  assert.equal(result.last?.status, "accepted", JSON.stringify(result));
  assert.deepEqual(result.last.kinds, minute === 1439 ? ["dose"] : ["dose", "water"]);
  assert.ok(result.next > due);
  assert.equal(outbound.length, 1);
  assert.equal(outbound[0].encoding, "aes128gcm");
  assert.match(outbound[0].topic, /^[a-f0-9]{32}$/);
  assert.equal(outbound[0].size, 4096);
  assert.ok(outbound[0].at>=due);
  const later = Date.now() + 2_000;
  const visitNotice = later + 2_000;
  const snoozed = { ...schedule(4, [[day, minute]]), appointments: [[visitNotice, day, visitNotice + 60_000]] };
  snoozed.rules[0].snoozes = [[day, minute, later]];
  assert.equal((await replace(snoozed)).next, later);
  await sleep(visitNotice - Date.now() + 1_000);
  for (let i = 0; i < 12 && outbound.length < 3; i++) await sleep(500);
  result = await (await http(api, "GET", token)).json();
  assert.equal(outbound.length, 3);
  assert.deepEqual(result.last.kinds, ["appointment"]);
  assert.equal(result.next, due + 86_400_000);
  assert.equal((await replace({ revision: 5, enabled: false })).next, null);
  console.log("Closed-client alarms for medication, water, snooze and appointments sent through encrypted Web Push.");
} finally {
  await mf.dispose();
}
