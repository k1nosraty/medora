import assert from "node:assert/strict";
import { createECDH, createHmac, scryptSync } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { mergeCare } from "../public/medication/features/sync/merge.js";

const require = createRequire(import.meta.url);
const { Miniflare, Response, convertV4MiniflareOptions } = require("miniflare");
const { build } = require("esbuild");
const origin = "https://medora.test";
const password = "previous account password";
const backupPassword = "long local migration passphrase";
const secret = "a".repeat(64);
const migrationToken = "b".repeat(64);

test("account merge preserves independent edits and propagates deletions", () => {
  const a = { id: "a", amount: 200 };
  const b = { id: "b", amount: 300 };
  assert.deepEqual(mergeCare({ water: [a] }, { water: [] }, { water: [a, b] }).water, [b]);
  assert.deepEqual(mergeCare(null, { water: [a] }, { water: [b] }).water, [a, b]);
});

test("encrypted migration restores existing login, account history and a pending push", { timeout: 20_000 }, async () => {
  const { outputFiles } = await build({
    absWorkingDir: fileURLToPath(new URL("..", import.meta.url)),
    entryPoints: ["src/worker.mjs"], bundle: true, platform: "browser", format: "esm",
    external: ["cloudflare:workers", "node:crypto"], write: false
  });
  const vapid = createECDH("prime256v1");
  const publicKey = vapid.generateKeys().toString("base64url");
  const privateKey = Buffer.alloc(32);
  vapid.getPrivateKey().copy(privateKey, 32 - vapid.getPrivateKey().length);
  const outbound = [];
  const make = () => new Miniflare(convertV4MiniflareOptions({
    modules: true, script: outputFiles[0].text, compatibilityDate: "2026-10-29",
    compatibilityFlags: ["nodejs_compat"],
    durableObjects: Object.fromEntries(Object.entries({ EMAIL_ACCOUNTS: "EmailAccount", CREDENTIALS: "Credentials",
      PROMOTIONS: "Promotions", OPERATIONS: "Operations", REMINDERS: "MedicationReminders", PILOT: "PushPilot" })
      .map(([key, className]) => [key, { className, useSQLite: true }])),
    ratelimits: { EMAIL_AUTH_LIMIT: { namespace_id: "750503", simple: { limit: 8, period: 60 } } },
    bindings: { EMAIL_AUTH_SECRET: secret, MIGRATION_TOKEN: migrationToken, VAPID_PUBLIC_KEY: publicKey,
      VAPID_PRIVATE_KEY: privateKey.toString("base64url"), VAPID_SUBJECT: "mailto:push@medora.test",
      REMINDER_SIGNING_KEY: "c".repeat(64) },
    outboundService: async request => {
      outbound.push({ url: request.url, encoding: request.headers.get("Content-Encoding") });
      return new Response(null, { status: 201 });
    }
  }));
  const source = make();
  const target = make();
  let sourceStopped = false;
  const stub = async (worker, name, id) => {
    const namespace = await worker.getDurableObjectNamespace(name);
    return namespace.get(namespace.idFromName(id));
  };
  const api = (worker, path, method = "GET", headers = {}, body) => worker.dispatchFetch(origin + path, {
    method, headers: { Origin: origin, "Content-Type": "application/json", ...headers },
    body: body instanceof Uint8Array ? body : body === undefined ? undefined : JSON.stringify(body)
  });
  try {
    const email = "account@example.test", username = "test_account";
    const hmac = (tag, value) => createHmac("sha256", secret).update(tag + ":" + value).digest("hex");
    const owner = hmac("account-v1", email);
    const salt = "d".repeat(32);
    const proof = scryptSync(hmac("password-v1", password), salt, 32,
      { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 }).toString("hex");
    await (await stub(source, "CREDENTIALS", "medora-credentials-v1")).register(username, owner, email, salt, proof);
    const login = async worker => {
      const response = await api(worker, "/api/auth/login", "POST", {}, { username, password });
      assert.equal(response.status, 200, await response.clone().text());
      return { Cookie: response.headers.get("Set-Cookie").split(";")[0] };
    };
    const session = await login(source);
    const carePath = "/api/account/care";
    assert.equal((await api(source, carePath)).status, 401);
    assert.deepEqual(await (await api(source, carePath, "GET", session)).json(), { owner, revision: 0, records: null });
    const start = 20770;
    const records = { settings: { waterGoal: 2000, cycleEnabled: true },
      medicines: { m: { id: "m", name: "Sample", unit: "tablet", stock: null,
        phases: [{ start, end: null, interval: 1, mask: 127, slots: [{ minute: 480, amount: 1000 }] }] } },
      doses: {}, visits: { v: { id: "v", name: "Visit", day: start, time: "10:00" } },
      routines: { r: { id: "r", name: "Walk", category: "walking", mode: "done",
        start, interval: 1, mask: 127, minute: 540 } }, routineLogs: {},
      cycleRecords: { [start]: { end: null, flow: "", note: "" } },
      water: [{ id: "water-1", day: start, time: "12:00", amount: 250 }] };
    const update = { owner, revision: 0, records };
    assert.equal((await api(source, carePath, "PUT", session, update)).status, 200);
    assert.equal((await api(source, carePath, "PUT", session, update)).status, 409);
    const id = "e".repeat(32);
    const endpoint = "https://fcm.googleapis.com/fcm/send/test-test-test-12345";
    const client = createECDH("prime256v1");
    const subscription = { endpoint, keys: { p256dh: client.generateKeys().toString("base64url"), auth: Buffer.alloc(16).toString("base64url") } };
    const now = Date.now();
    const due = now + 3500;
    const device = await stub(source, "REMINDERS", id);
    await device.restoreReminder({ revision: 5, plan: { subscription, language: "en", zone: "UTC", rules: [] },
      next: { at: due, day: Math.floor(now / 86_400_000), kinds: ["dose"] }, last: null });
    await (await stub(source, "OPERATIONS", "operations")).registerReminder(id);
    const auth = { Authorization: "Bearer " + migrationToken };
    assert.equal((await api(source, "/api/migration/backup", "POST", session, { password: backupPassword })).status, 401);
    const archive = await api(source, "/api/migration/backup", "POST", auth, { password: backupPassword });
    assert.equal(archive.status, 200, await archive.clone().text());
    const bytes = new Uint8Array(await archive.arrayBuffer());
    await source.dispose();
    sourceStopped = true;
    assert.equal(new TextDecoder().decode(bytes.subarray(0, 8)), "MEDSRV01");
    assert.equal((await api(target, "/api/migration/restore", "POST",
      { ...auth, "X-Medora-Backup-Password": "incorrect backup password here" }, bytes)).status, 400);
    const restored = await api(target, "/api/migration/restore", "POST",
      { ...auth, "X-Medora-Backup-Password": encodeURIComponent(backupPassword), "X-Medora-Restore-Reminders": "yes" }, bytes);
    assert.equal(restored.status, 200, await restored.clone().text());
    assert.equal((await api(target, carePath, "GET", session)).status, 401);
    const newSession = await login(target);
    assert.deepEqual(await (await api(target, carePath, "GET", newSession)).json(), { owner, revision: 1, records });
    const restoredDevice = await stub(target, "REMINDERS", id);
    assert.equal((await restoredDevice.status()).next, due);
    for (let attempt = 0; attempt < 20 && !outbound.length; attempt++) await sleep(250);
    assert.deepEqual(outbound, [{ url: endpoint, encoding: "aes128gcm" }]);
    assert.equal((await restoredDevice.status()).last?.status, "accepted");
  } finally {
    await Promise.all([sourceStopped ? null : source.dispose(), target.dispose()]);
  }
});
