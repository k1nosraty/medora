import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createECDH, createHmac, createHash, scryptSync } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";
import { subscriptionId } from "../public/medication/features/reminders/subscription-id.js";
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

test("encrypted migration restores existing login, account history and a pending push", { timeout: 150_000 }, async () => {
  const { outputFiles } = await build({
    absWorkingDir: fileURLToPath(new URL("..", import.meta.url)),
    entryPoints: ["src/worker.mjs"], bundle: true, platform: "browser", format: "esm",
    external: ["cloudflare:workers", "node:crypto", "node:buffer"], write: false
  });
  const vapid = createECDH("prime256v1");
  const publicKey = vapid.generateKeys().toString("base64url");
  const privateKey = Buffer.alloc(32);
  vapid.getPrivateKey().copy(privateKey, 32 - vapid.getPrivateKey().length);
  const outbound = [];
  const make = (extra = {}) => ({
    modules: true, script: outputFiles[0].text, compatibilityDate: "2026-10-29",
    compatibilityFlags: ["nodejs_compat"],
    durableObjects: Object.fromEntries(Object.entries({ EMAIL_ACCOUNTS: "EmailAccount", CREDENTIALS: "Credentials",
      PROMOTIONS: "Promotions", OPERATIONS: "Operations", REMINDERS: "MedicationReminders", PILOT: "PushPilot" })
      .map(([key, className]) => [key, { className, useSQLite: true }])),
    ratelimits: { EMAIL_AUTH_LIMIT: { namespace_id: "750503", simple: { limit: 8, period: 60 } } },
    bindings: { EMAIL_AUTH_SECRET: secret, MIGRATION_TOKEN: migrationToken, VAPID_PUBLIC_KEY: publicKey,
      VAPID_PRIVATE_KEY: privateKey.toString("base64url"), VAPID_SUBJECT: "mailto:push@medora.test",
      REMINDER_SIGNING_KEY: "c".repeat(64), ...extra },
    outboundService: async request => {
      outbound.push({ url: request.url, encoding: request.headers.get("Content-Encoding") });
      return new Response(null, { status: 201 });
    }
  });
  const maintenance = { MEDORA_MAINTENANCE: "true", MEDORA_PAUSE_PUSH: "true" };
  const options = extra => convertV4MiniflareOptions(make(extra));
  const source = new Miniflare(options());
  const target = new Miniflare(options(maintenance));
  const occupied = new Miniflare(options(maintenance));
  const incompatible = new Miniflare(options({ ...maintenance, EMAIL_AUTH_SECRET: "f".repeat(64) }));
  const backupDir = await mkdtemp(join(tmpdir(), "medora-migration-"));
  let sourceStopped = false;
  const stub = async (worker, name, id) => {
    const namespace = await worker.getDurableObjectNamespace(name);
    return namespace.get(namespace.idFromName(id));
  };
  const api = (worker, path, method = "GET", headers = {}, body) => worker.dispatchFetch(origin + path, {
    method, headers: { Origin: origin,
      "Content-Type": body instanceof Uint8Array ? "application/octet-stream" : "application/json", ...headers },
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
    const formerSession = await login(source);
    assert.equal((await api(source, "/api/auth/logout", "POST", formerSession)).status, 200);
    assert.equal((await api(source, carePath, "GET", formerSession)).status, 401);
    assert.equal((await api(source, carePath, "PUT", formerSession, { ...update, revision: 1 })).status, 401);
    const sourcePromotions = await stub(source, "PROMOTIONS", "home");
    const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
    const { id: assetId } = await sourcePromotions.storeMedia(gif, "image/gif", "test.gif");
    await sourcePromotions.save({ title: "Ad", description: "", url: "https://example.test/",
      enabled: true, mediaType: "image", mediaId: assetId }, null, false, true);
    const endpoint = "https://fcm.googleapis.com/fcm/send/test-test-test-12345";
    const client = createECDH("prime256v1");
    const subscription = { endpoint, keys: { p256dh: client.generateKeys().toString("base64url"), auth: Buffer.alloc(16).toString("base64url") } };
    const id = await subscriptionId(subscription);
    const now = Date.now();
    const due = now + 1500;
    const device = await stub(source, "REMINDERS", id);
    await device.restoreReminder({ revision: 5, plan: { subscription, language: "en", zone: "UTC", rules: [] },
      next: { at: due, day: Math.floor(now / 86_400_000), kinds: ["dose"] }, last: null });
    const disabledId = "f".repeat(32);
    await (await stub(source, "REMINDERS", disabledId)).replace(2, null);
    const operations = await stub(source, "OPERATIONS", "operations");
    await operations.registerReminder(id);
    await operations.registerReminder(disabledId);
    await operations.addTicket(email, "A support message", null);
    const auth = { Authorization: "Bearer " + migrationToken };
    assert.equal((await api(source, "/api/migration/backup", "POST", session, { password: backupPassword })).status, 401);
    assert.equal((await api(source, "/api/migration/restore", "POST", auth)).status, 409);
    await source.setOptions(options(maintenance));
    assert.equal((await api(source, carePath, "GET", session)).status, 503);
    const path = join(backupDir, "staged.medbackup");
    const shellOptions = { env: { ...process.env, MEDORA_MIGRATION_TOKEN: migrationToken,
      MEDORA_BACKUP_PASSWORD: backupPassword } };
    const cli = promisify(execFile);
    const cliArgs = [fileURLToPath(new URL("../scripts/migrate-care-v1.mjs", import.meta.url)), "backup", (await source.ready).href, path];
    const downloaded = await cli(process.execPath, cliArgs, shellOptions);
    const bytes = await readFile(path);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    const hash = createHash("sha256").update(bytes).digest("hex");
    assert.ok(downloaded.stdout.includes(hash));
    await assert.rejects(cli(process.execPath, cliArgs, shellOptions), /EEXIST/);
    assert.deepEqual(await readFile(path), bytes);

    assert.equal(new TextDecoder().decode(bytes.subarray(0, 8)), "MEDSRV01");
    const requestBody = (archive, passphrase = backupPassword) => {
      const secretBytes = Buffer.from(passphrase);
      const length = Buffer.alloc(2);
      length.writeUInt16BE(secretBytes.length);
      return Buffer.concat([length, secretBytes, archive]);
    };
    const verify = (archive, passphrase) => api(target, "/api/migration/verify", "POST", auth, requestBody(archive, passphrase));
    const restore = (archive, resume = false) => api(target, "/api/migration/restore", "POST",
      resume ? { ...auth, "X-Medora-Restore-Reminders": "yes" } : auth, requestBody(archive));
    assert.equal((await verify(bytes, "incorrect backup password here")).status, 400);
    assert.equal((await verify(bytes.subarray(0, -1))).status, 400);
    const verifyResponse = await verify(bytes);
    assert.equal(verifyResponse.status, 200);
    const report = await verifyResponse.json();
    assert.match(report.sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual({ ...report, sha256: null }, { sha256: null, accounts: 1, media: 1, reminders: 2 });
    assert.deepEqual(await (await stub(target, "CREDENTIALS", "medora-credentials-v1")).backupAccounts(""), []);
    const keyMismatch = await api(incompatible, "/api/migration/verify", "POST", auth, requestBody(bytes));
    assert.equal(keyMismatch.status, 400);
    assert.equal((await keyMismatch.json()).error, "incompatible_backup");
    const occupiedIndex = await stub(occupied, "CREDENTIALS", "medora-credentials-v1");
    await occupiedIndex.register("existing", owner, email, salt, proof);
    const refused = await api(occupied, "/api/migration/restore", "POST", auth, requestBody(bytes));
    assert.equal(refused.status, 409);
    assert.equal((await refused.json()).error, "target_not_empty");
    assert.equal((await occupiedIndex.find(username)), null);
    // Simulate a stopped restore after the first credential write.
    const targetOperations = await stub(target, "OPERATIONS", "operations");
    const job = await targetOperations.claimRestore(hash, false);
    await targetOperations.prepareRestore(job.id);
    const restoringIndex = await stub(target, "CREDENTIALS", "medora-credentials-v1");
    await restoringIndex.restoreAccount({ username, email_id: owner, email, salt, proof, created_at: now });
    assert.equal((await restore(bytes)).status, 409);
    await targetOperations.releaseRestore(job.id, null, false);
    const restored = await restore(bytes);
    assert.equal(restored.status, 200, await restored.clone().text());
    assert.deepEqual(await restored.json(), { accounts: 1, media: 1, reminders: 0 });
    const secondArchive = await api(source, "/api/migration/backup", "POST", auth, { password: backupPassword });
    assert.equal(secondArchive.status, 200);
    assert.equal((await restore(new Uint8Array(await secondArchive.arrayBuffer()))).status, 409);
    const targetPromotions = await stub(target, "PROMOTIONS", "home");
    assert.deepEqual(Buffer.from(await targetPromotions.mediaBytes(assetId, 0, gif.length - 1)), gif);
    assert.equal((await targetPromotions.current()).current.url, "https://example.test/");
    await sleep(Math.max(0, due - Date.now()) + 300);
    assert.equal(outbound.length, 0, "a due reminder on the paused source cannot send");
    await source.dispose();
    sourceStopped = true;
    const resumed = await restore(bytes, true);
    assert.equal(resumed.status, 200, await resumed.clone().text());
    assert.deepEqual(await resumed.json(), { accounts: 1, media: 1, reminders: 2 });
    assert.deepEqual(await (await restore(bytes, true)).json(), { accounts: 1, media: 1, reminders: 2 });
    assert.equal((await (await stub(target, "REMINDERS", disabledId)).status()).enabled, false);
    assert.equal((await (await stub(target, "OPERATIONS", "operations")).tickets(email))[0].message, "A support message");
    assert.equal(outbound.length, 0, "restore must leave the target paused");
    await target.setOptions(options());
    assert.equal((await api(target, carePath, "GET", session)).status, 401);
    const newSession = await login(target);
    assert.deepEqual(await (await api(target, carePath, "GET", newSession)).json(), { owner, revision: 1, records });
    const largeSource = new Miniflare(options({ MEDORA_EXPORT_CONTINUITY: "true", MIGRATION_TOKEN_EXPIRES_AT: String(Date.now() + 600_000) }));
    const largeTarget = new Miniflare(options(maintenance));
    try {
      const sourceAds = await stub(largeSource, "PROMOTIONS", "home");
      const payload = Buffer.alloc(5 * 1024 * 1024, 7);
      gif.copy(payload);
      const assetIds = [];
      for (let index = 0; index < 3; index++) {
        const { id: largeId } = await sourceAds.storeMedia(payload, "image/gif", String(index));
        assetIds.push(largeId);
      }
      const sourceAddress = (await largeSource.ready).href;
      const targetAddress = (await largeTarget.ready).href;
      const script = fileURLToPath(new URL("../scripts/migrate-care.mjs", import.meta.url));
      const archivePath = join(backupDir, "large.medbackup");
      const command = (mode, origin, path, ...args) =>
        cli(process.execPath, [script, mode, origin, path, ...args], shellOptions);
      await command("backup-keys", sourceAddress, join(backupDir, "keys.medbackup"));
      await command("backup", sourceAddress, archivePath);
      assert.ok((await stat(archivePath)).size > 16 * 1024 * 1024);
      await command("verify", targetAddress, archivePath);
      await command("restore", targetAddress, archivePath);
      await command("restore", targetAddress, archivePath);
      const targetAds = await stub(largeTarget, "PROMOTIONS", "home");
      assert.deepEqual((await targetAds.library()).map(({ id }) => id), assetIds);
      for (const id of assetIds) {
        const restoredBytes = await targetAds.mediaBytes(id, 0, payload.length - 1);
        assert.equal(createHash("sha256").update(restoredBytes).digest("hex"), createHash("sha256").update(payload).digest("hex"));
      }
    } finally {
      await Promise.all([largeSource.dispose(), largeTarget.dispose()]);
    }
    const restoredDevice = await stub(target, "REMINDERS", id);
    for (let attempt = 0; attempt < 130 && !outbound.length; attempt++) await sleep(500);
    assert.deepEqual(outbound, [{ url: endpoint, encoding: "aes128gcm" }]);
    assert.equal((await restoredDevice.status()).last?.status, "accepted");


  } finally {
    await Promise.all([sourceStopped ? null : source.dispose(), target.dispose(), occupied.dispose(), incompatible.dispose(),
      rm(backupDir, { recursive: true, force: true })]);
  }
});
