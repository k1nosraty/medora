import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createECDH, createHmac, createHash, randomUUID, scryptSync } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";
import { subscriptionId } from "../public/medication/domain/subscription-id.js";
import { careSyncLimit } from "../public/medication/domain/care-records.js";
import { advanceHash, emptyHash, openPart } from "../src/operations/backup-parts-format.mjs";
import { dayMs, localWall, timezone } from "../public/medication/domain/wall-clock.js";
import { decryptBackup, encryptBackup } from "../public/medication/shared/crypto/backup.js";
import { importRecoveryKey, sealPrivateCare } from "../public/medication/features/sync/private-care.js";
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

test("merges stock movements and dose records as one change", () => {
  const medicine = { id: "m", name: "Sample", unit: "tablet", stock: 10, threshold: 1 };
  const base = { medicines: { m: medicine }, doses: {} };
  const dose = (id, debit = 1) => ({ medicineId: "m", id, debit, unit: "tablet" });
  const morning = { medicines: { m: { ...medicine, stock: 9, name: "New name" } }, doses: { morning: dose("morning") } };
  const evening = { medicines: { m: { ...medicine, stock: 9, threshold: 2 } }, doses: { evening: dose("evening") } };
  for (const [local, remote] of [[morning, evening], [evening, morning]]) {
    const merged = mergeCare(base, local, remote);
    assert.deepEqual(merged.medicines.m, { ...medicine, name: "New name", threshold: 2, stock: 8 });
    assert.equal(Object.keys(merged.doses).length, 2);
    assert.deepEqual(mergeCare(merged, merged, merged), merged);
  }
  assert.equal(mergeCare(base, morning, morning).medicines.m.stock, 9);
  const restock = { ...base, medicines: { m: { ...medicine, stock: 15 } } };
  assert.equal(mergeCare(base, morning, restock).medicines.m.stock, 14);
  const correction = { ...morning, medicines: { m: { ...medicine, stock: 8 } }, doses: { morning: dose("morning", 2) } };
  const secondDose = { ...morning, medicines: { m: { ...medicine, stock: 8 } },
    doses: { ...morning.doses, evening: dose("evening") } };
  assert.equal(mergeCare(morning, correction, secondDose).medicines.m.stock, 7);
  assert.equal(mergeCare(base, morning, { ...base, medicines: {} }).medicines.m, undefined);
  const newUnit = { ...base, medicines: { m: { ...medicine, unit: "mL", stock: 20, stockTrackedFrom: 100 } } };
  assert.equal(mergeCare(base, morning, newUnit).medicines.m.stock, 20);
  assert.equal(mergeCare(base, morning, newUnit).doses.morning.unit, "tablet");
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
    modules: true, script: outputFiles[0].text, compatibilityDate: "2026-10-29", unsafeTriggerHandlers: true,
    compatibilityFlags: ["nodejs_compat"],
    durableObjects: Object.fromEntries(Object.entries({ EMAIL_ACCOUNTS: "EmailAccount", CREDENTIALS: "Credentials",
      PROMOTIONS: "Promotions", OPERATIONS: "Operations", REMINDERS: "MedicationReminders", PILOT: "PushPilot", FAMILIES: "Families" })
      .map(([key, className]) => [key, { className, useSQLite: true }])),
    ratelimits: { EMAIL_AUTH_LIMIT: { namespace_id: "750503", simple: { limit: 8, period: 60 } } },
    bindings: { EMAIL_AUTH_SECRET: secret, MIGRATION_TOKEN: migrationToken, MIGRATION_TOKEN_EXPIRES_AT: String(Date.now() + 3_600_000), VAPID_PUBLIC_KEY: publicKey,
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
    const login = async (worker, name = username) => {
      const response = await api(worker, "/api/auth/login", "POST", {}, { username: name, password });
      assert.equal(response.status, 200, await response.clone().text());
      return { Cookie: response.headers.get("Set-Cookie").split(";")[0] };
    };
    const session = await login(source);
    const carePath = "/api/account/care";
    assert.equal((await api(source, carePath)).status, 401);
    assert.deepEqual(await (await api(source, carePath, "GET", session)).json(), { owner, revision: 0, records: null });
    const start = 20770;
    const legacyCare = { settings: { waterGoal: 2000, cycleEnabled: true },
      medicines: { m: { id: "m", name: "Sample", unit: "tablet", stock: null,
        phases: [{ start, end: null, interval: 1, mask: 127, slots: [{ minute: 480, amount: 1000 }] }] } },
      doses: {}, visits: { v: { id: "v", name: "Visit", day: start, time: "10:00", note: "Synthetic private note" } },
      routines: { r: { id: "r", name: "Walk", category: "walking", mode: "done",
        start, interval: 1, mask: 127, minute: 540 } }, routineLogs: {},
      cycleRecords: { [start]: { end: null, flow: "", note: "" } },
      water: [{ id: "water-1", day: start, time: "12:00", amount: 250 }] };
    const records = await sealPrivateCare(legacyCare, await importRecoveryKey("7".repeat(64)));
    const update = { owner, revision: 0, records, zone: "America/Toronto" };
    assert.equal((await api(source, carePath, "PUT", session, update)).status, 200);
    assert.equal((await api(source, carePath, "PUT", session, update)).status, 409);
    assert.equal((await api(source, carePath, "PUT", session, { ...update, revision: 1, records: legacyCare })).status, 422);
    assert.equal((await api(source, carePath, "GET", { ...session, "If-None-Match": `"${owner}:1"` })).status, 304);
    assert.equal((await api(source, carePath, "GET", { "If-None-Match": `"${owner}:1"` })).status, 401);
    // Use a chunked upload so the server detects the limit at the end of the body.
    // Rejecting a known length up front can close the socket while Miniflare is still uploading.
    const oversized = await source.dispatchFetch(origin + carePath, {
      method: "PUT",
      headers: { Origin: origin, "Content-Type": "application/json", ...session },
      body: new Blob([JSON.stringify({ padding: "x".repeat(careSyncLimit) })]).stream(),
      duplex: "half"
    });
    assert.equal(oversized.status, 413);
    assert.deepEqual(await oversized.json(), { error: "care_too_large" });
    const caregiverEmail = "caregiver@example.test";
    const caregiver = hmac("account-v1", caregiverEmail);
    await (await stub(source, "CREDENTIALS", "medora-credentials-v1")).register("caregiver", caregiver, caregiverEmail, salt, proof);
    const group = randomUUID(), ownerMember = randomUUID(), caregiverMember = randomUUID();
    const nowFamily = Date.now();
    const permission = JSON.stringify({ sections: ["water"], record: true, add: false });
    const familyRows = {
      groups: [{ id: group, name: "Care circle", owner, icon: "group" }],
      members: [{ id: ownerMember, group_id: group, person: owner, label: username },
        { id: caregiverMember, group_id: group, person: caregiver, label: "caregiver" }],
      invites: [{ id: randomUUID(), group_id: group, email: "pending@example.test", created: nowFamily,
        expires: nowFamily + 86_400_000, status: "pending", recipient_label: null }],
      grants: [{ group_id: group, owner, recipient: caregiver, policy: permission, expires: null },
        { group_id: group, owner: caregiver, recipient: owner, policy: permission, expires: nowFamily - 1000 }],
      audit: [{ id: 1, group_id: group, actor: owner, subject: caregiver, action: "share", time: nowFamily }]
    };
    const familyCounts = Object.fromEntries(Object.entries(familyRows).map(([table, rows]) => [table, rows.length]));
    const seedFamily = async worker => {
      const hub = await stub(worker, "FAMILIES", "care-groups");
      for (const [table, rows] of Object.entries(familyRows)) await hub.restoreFamilyPage(table, rows);
    };
    await seedFamily(source);
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
    assert.deepEqual({ ...report, sha256: null }, { sha256: null, accounts: 2, media: 1, reminders: 2, family: familyCounts, accountTimezones: 1, accountsWithTimezoneField: 2 });
    const legacyMagic = new TextEncoder().encode("MEDSRV01");
    const legacy = await decryptBackup(bytes, backupPassword, legacyMagic);
    legacy.version = 1;
    delete legacy.family;
    for (const account of legacy.accounts) {
      delete account.zone;
      delete account.devices;
      delete account.row.password_key;
    }
    const oldArchive = await encryptBackup(legacy, backupPassword, legacyMagic);
    const oldVerify = await verify(oldArchive);
    assert.equal(oldVerify.status, 200);
    const oldReport = await oldVerify.json();
    assert.equal(oldReport.family, null);
    assert.equal(oldReport.accountsWithTimezoneField, 0);
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
    assert.deepEqual(await restored.json(), { accounts: 2, media: 1, reminders: 0, family: familyCounts, accountTimezones: 1, accountsWithTimezoneField: 2 });
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
    assert.deepEqual(await resumed.json(), { accounts: 2, media: 1, reminders: 2, family: familyCounts, accountTimezones: 1, accountsWithTimezoneField: 2 });
    assert.deepEqual(await (await restore(bytes, true)).json(), { accounts: 2, media: 1, reminders: 2, family: familyCounts, accountTimezones: 1, accountsWithTimezoneField: 2 });
    assert.equal((await (await stub(target, "REMINDERS", disabledId)).status()).enabled, false);
    assert.equal((await (await stub(target, "OPERATIONS", "operations")).tickets(email))[0].message, "A support message");
    assert.equal(outbound.length, 0, "restore must leave the target paused");
    await target.setOptions(options());
    assert.equal((await api(target, carePath, "GET", session)).status, 401);
    const newSession = await login(target);
    assert.deepEqual(await (await api(target, carePath, "GET", newSession)).json(), { owner, revision: 1, records });
    const caregiverSession = await login(target, "caregiver");
    const view = (session, targetId) => api(target, "/api/family", "POST", session, { action: "view", group, target: targetId });
    const { zone } = await (await view(caregiverSession, ownerMember)).json();
    assert.equal(zone, "America/Toronto");
    assert.equal((await view(newSession, caregiverMember)).status, 403);
    const { groups } = await (await api(target, "/api/family", "GET", newSession)).json();
    assert.equal(groups[0].pending[0].id, familyRows.invites[0].id);
    const torontoDay = Math.floor(localWall(Date.now(), timezone("America/Toronto")) / dayMs);
    assert.equal((await api(target, "/api/family", "POST", caregiverSession, {
      action: "record", group, target: ownerMember, operation: randomUUID(), kind: "water", day: torontoDay, time: "23:58", amount: 100
    })).status, 200);
    const largeSource = new Miniflare(options({ MEDORA_EXPORT_CONTINUITY: "true", MIGRATION_TOKEN_EXPIRES_AT: String(Date.now() + 600_000) }));
    const largeTarget = new Miniflare(options(maintenance));
    try {
      const largeCredentials = await stub(largeSource, "CREDENTIALS", "medora-credentials-v1");
      await largeCredentials.register(username, owner, email, salt, proof);
      await largeCredentials.register("caregiver", caregiver, caregiverEmail, salt, proof);
      await (await stub(largeSource, "EMAIL_ACCOUNTS", owner)).restoreCare({ revision: 1, records }, "", update.zone);
      await seedFamily(largeSource);
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
      // Simulate a stopped client after the first family table, then resume with the CLI.
      const archive = await readFile(archivePath);
      const archiveId = archive.toString("ascii", 8, 44);
      const key = scryptSync(backupPassword, archive.subarray(44, 60), 32, { N: 65536, r: 8, p: 1, maxmem: 96 * 1024 * 1024 });
      const frames = [];
      let chain = emptyHash;
      for (let offset = 60; offset < archive.length;) {
        const length = archive.readUInt32BE(offset);
        offset += 4;
        const frame = archive.subarray(offset, offset + length);
        frames.push(frame);
        offset += length;
        chain = await advanceHash(chain, frame);
      }
      for (const [index, frame] of frames.entries()) {
        const before = await openPart(frame, key.toString("hex"), archiveId, index);
        const result = await api(largeTarget, "/api/migration/parts/restore", "POST", {
          ...auth, "X-Medora-Archive": archiveId, "X-Medora-Index": String(index), "X-Medora-Total": String(frames.length),
          "X-Medora-Digest": chain, "X-Medora-Phase": "data"
        }, Buffer.concat([key, frame]));
        assert.equal(result.status, 200);
        if (before.type === "family" && before.table === "groups") break;
      }
      const partialHub = await stub(largeTarget, "FAMILIES", "care-groups");
      assert.equal((await partialHub.exportFamilyPage("groups", 0)).length, 1);
      assert.equal((await partialHub.exportFamilyPage("members", 0)).length, 0);
      await command("restore", targetAddress, archivePath);
      await command("restore", targetAddress, archivePath);
      const restoredFamily = await stub(largeTarget, "FAMILIES", "care-groups");
      for (const [table, rows] of Object.entries(familyRows)) {
        assert.deepEqual((await restoredFamily.exportFamilyPage(table, 0)).length, rows.length);
      }
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
    const release = "f".repeat(40);
    await target.setOptions(options({ MEDORA_RELEASE: release }));
    assert.equal((await api(target, "/api/operations/release?version=" + "e".repeat(40))).status, 404);
    const queue = () => api(target, "/api/operations/release?version=" + release);
    assert.deepEqual(await (await queue()).json(), { version: release, status: "queued" });
    for (let attempt = 0; attempt < 25 && outbound.length < 2; attempt++) await sleep(200);
    assert.equal(outbound.length, 2, "only the enabled device receives the release notification");
    assert.equal((await target.dispatchFetch(origin + "/cdn-cgi/local/scheduled")).status, 200);
    await sleep(1300);
    assert.deepEqual(await (await queue()).json(), { version: release, status: "complete" });
    assert.equal(outbound.length, 2, "the same deployed revision is only announced once");
    const largeRecords = structuredClone(legacyCare);
    const nearLimit = { owner: caregiver, revision: 0, zone: "UTC", records: largeRecords };
    largeRecords.medicines.m.instructions = "";
    const overhead = Buffer.byteLength(JSON.stringify(nearLimit));
    largeRecords.medicines.m.instructions = "x".repeat(4 * 1024 * 1024 - overhead - 100);
    assert.equal((await api(target, carePath, "PUT", caregiverSession, nearLimit)).status, 200);
    const compact = await api(target, carePath, "GET", { ...caregiverSession, "If-None-Match": `"${caregiver}:1"` });
    assert.equal(compact.status, 304);
    assert.equal(await compact.text(), "");
    const directAccess = (await (await api(target, carePath, "GET", caregiverSession)).json()).records;
    assert.equal(directAccess.medicines.m.instructions.length, largeRecords.medicines.m.instructions.length);
    assert.equal((await api(target, "/api/family", "POST", caregiverSession, {
      action: "share", group, target: ownerMember, sections: ["water"], record: true, add: false, days: null
    })).status, 200);
    const excess = await api(target, "/api/family", "POST", newSession, {
      action: "record", group, target: caregiverMember, operation: randomUUID(), kind: "water",
      day: Math.floor(Date.now() / dayMs), time: "12:00", amount: 100
    });
    assert.equal(excess.status, 413);
    assert.deepEqual(await excess.json(), { error: "care_too_large" });
    assert.equal((await api(target, carePath, "GET", { ...caregiverSession, "If-None-Match": `"${caregiver}:1"` })).status, 304);

  } finally {
    await Promise.all([sourceStopped ? null : source.dispose(), target.dispose(), occupied.dispose(), incompatible.dispose(),
      rm(backupDir, { recursive: true, force: true })]);
  }
});
