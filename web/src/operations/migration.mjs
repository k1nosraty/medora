import { encryptBackup, decryptBackup, maxBackupBytes } from "../../public/medication/features/backups/crypto.js";
import { smallJson } from "../http/validation.mjs";
import { assertBackup, decodeMedia, digest, fingerprint, pushFingerprint, validate } from "./backup-validation.mjs";

const magic = new TextEncoder().encode("MEDSRV01");
const encoder = new TextEncoder();
const hex = (value, length) => typeof value === "string" && value.length === length && /^[a-f0-9]+$/.test(value);
export const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
export const reply = (data, status = 200) => Response.json(data, { status, headers });
const bodyLimit = maxBackupBytes + 2 + 384;
const passwordValid = value => typeof value === "string" && value.length >= 24 && value.length <= 128;

async function readArchive(request) {
  if (!request.body || request.headers.get("Content-Type") !== "application/octet-stream" ||
      Number(request.headers.get("Content-Length")) > bodyLimit) return null;
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > bodyLimit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const data = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  return data;
}

async function collect(env, store, credentials, promotion) {
  const accounts = [];
  let cursor = "";
  let estimatedBytes = 0;
  function checkSize(value) {
    estimatedBytes += encoder.encode(JSON.stringify(value)).byteLength;
    if (estimatedBytes > maxBackupBytes - 4096) throw new Error("backup_too_large");
  }
  while (true) {
    const page = await credentials.backupAccounts(cursor);
    if (!page.length) break;
    for (const row of page) {
      const client = env.EMAIL_ACCOUNTS.getByName(row.email_id);
      const item = { row, ...await client.exportCare() };
      checkSize(item);
      accounts.push(item);
    }
    cursor = page.at(-1).username;
  }
  const reminders = [];
  let lastDevice = "";
  while (true) {
    const ids = await store.reminderIds(lastDevice);
    if (!ids.length) break;
    for (const id of ids) {
      const state = await env.REMINDERS.getByName(id).exportReminder();
      if (!state) continue;
      const item = { id, state };
      checkSize(item);
      reminders.push(item);
    }
    lastDevice = ids.at(-1);
  }
  const media = [];
  const ads = await promotion.exportData();
  checkSize(ads);
  for (const asset of ads.assets) {
    if (estimatedBytes + Math.ceil(asset.size * 4 / 3) > maxBackupBytes) throw new Error("backup_too_large");
    const bytes = await promotion.mediaBytes(asset.id, 0, asset.size - 1);
    const chunks = [];
    // Each block is divisible by three so concatenated base64 decodes as one file.
    for (let offset = 0; offset < bytes.length; offset += 3072) {
      chunks.push(btoa(String.fromCharCode(...bytes.subarray(offset, offset + 3072))));
    }
    const item = { asset, data: chunks.join("") };
    checkSize(item);
    media.push(item);
  }
  const operations = await store.exportData();
  checkSize(operations);
  return { version: 1, accounts, reminders, operations, ads, media,
    keyFingerprint: await fingerprint(env), pushFingerprint: await pushFingerprint(env) };
}

async function restore(data, hash, env, store, credentials, promotion, enableReminders) {
  const job = await store.claimRestore(hash, enableReminders);
  if (job.error) throw new Error(job.error);
  if (job.complete) {
    const { complete, ...result } = job;
    return result;
  }
  let result;
  try {
    if (!job.prepared) {
      const [accounts, adsEmpty, opsEmpty] = await Promise.all([
        credentials.backupAccounts(""), promotion.migrationTargetEmpty(), store.migrationTargetEmpty()
      ]);
      if (accounts.length || !adsEmpty || !opsEmpty) throw new Error("target_not_empty");
      await store.prepareRestore(job.id);
    }
    if (!job.done) {
      for (const { row, care, epoch } of data.accounts) {
        if (!await credentials.restoreAccount(row)) throw new Error("account_conflict");
        if (!await env.EMAIL_ACCOUNTS.getByName(row.email_id).restoreCare(care, epoch)) throw new Error("account_conflict");
      }
      for (const { asset, data: encoded } of data.media) await promotion.restoreMedia(asset, decodeMedia(encoded));
      await promotion.restoreCampaigns(data.ads);
      await store.restoreData(data.operations);
    }
    let resumed = 0;
    if (enableReminders) for (const { id, state } of data.reminders) {
      // Index first so an interrupted migration can detect and include the device.
      await store.registerReminder(id);
      const restored = await env.REMINDERS.getByName(id).restoreReminder(state);
      if (!restored) throw new Error("reminder_conflict");
      resumed++;
    }
    result = { accounts: data.accounts.length, media: data.media.length, reminders: resumed };
    return result;
  } finally {
    await store.releaseRestore(job.id, result, enableReminders);
  }
}

function unpack(body) {
  assertBackup(body?.length >= 2);
  const length = new DataView(body.buffer, body.byteOffset, 2).getUint16(0);
  assertBackup(length >= 24 && length <= 384 && body.length > 2 + length);
  const passphrase = body.subarray(2, 2 + length);
  try {
    const password = new TextDecoder("utf-8", { fatal: true }).decode(passphrase);
    assertBackup(passwordValid(password));
    return { password, archive: body.subarray(2 + length) };
  } finally {
    passphrase.fill(0);
  }
}

export function authorizeMigration(request, env, url) {
  const token = env.MIGRATION_TOKEN;
  const provided = request.headers.get("Authorization")?.slice(7);
  if (!hex(token, 64)) return reply({ error: "not_found" }, 404);
  if (env.MIGRATION_TOKEN_EXPIRES_AT &&
      !(Number(env.MIGRATION_TOKEN_EXPIRES_AT) > Date.now())) return reply({ error: "not_found" }, 404);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    return reply({ error: "https_required" }, 400);
  }
  if (!request.headers.get("Authorization")?.startsWith("Bearer ") || !hex(provided, 64) ||
      !crypto.subtle.timingSafeEqual(encoder.encode(token), encoder.encode(provided))) return reply({ error: "unauthorized" }, 401);
  if (request.method !== "POST") return reply({ error: "method" }, 405);
  return null;
}

export async function handleMigration(request, env, url) {
  const denied = authorizeMigration(request, env, url);
  if (denied) return denied;
  const store = env.OPERATIONS.getByName("operations");
  const credentials = env.CREDENTIALS.getByName("medora-credentials-v1");
  const promotion = env.PROMOTIONS.getByName("home");
  try {
    if (url.pathname.endsWith("/backup")) {
      const { password } = await smallJson(request, 1024) ?? {};
      if (!passwordValid(password)) return reply({ error: "invalid_password" }, 400);
      const data = await collect(env, store, credentials, promotion);
      await validate(data, env);
      const archive = await encryptBackup(data, password, magic);
      return new Response(archive, { headers: { ...headers, "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="medora-server.medbackup"' } });
    }
    const verify = url.pathname.endsWith("/verify");
    if (!verify && (env.MEDORA_MAINTENANCE !== "true" || env.MEDORA_PAUSE_PUSH !== "true")) {
      return reply({ error: "maintenance_required" }, 409);
    }
    let archive, data;
    try {
      const input = unpack(await readArchive(request));
      archive = input.archive;
      data = await decryptBackup(archive, input.password, magic);
      await validate(data, env);
    } catch (error) {
      return reply({ error: error.message === "incompatible_backup" ? error.message : "invalid_backup" }, 400);
    }
    const hash = await digest(archive);
    if (verify) return reply({ sha256: hash, accounts: data.accounts.length, media: data.media.length, reminders: data.reminders.length });
    return reply(await restore(data, hash, env, store, credentials, promotion,
      request.headers.get("X-Medora-Restore-Reminders") === "yes"));
  } catch (error) {
    const conflicts = ["account_conflict", "reminder_conflict", "target_not_empty", "archive_conflict", "restore_in_progress"];
    if (error.message === "backup_too_large") return reply({ error: error.message }, 413);
    if (conflicts.includes(error.message)) return reply({ error: error.message }, 409);
    return reply({ error: url.pathname.endsWith("/backup") ? "backup_failed" : "restore_failed" }, 500);
  }
}
