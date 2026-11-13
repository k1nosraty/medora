import { encryptBackup, decryptBackup, maxBackupBytes } from "../../public/medication/features/backups/crypto.js";
import { smallJson } from "../http/validation.mjs";

const magic = new TextEncoder().encode("MEDSRV01");
const encoder = new TextEncoder();
const hex = (value, length) => typeof value === "string" && value.length === length && /^[a-f0-9]+$/.test(value);
const reply = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const passwordValid = value => typeof value === "string" && value.length >= 24 && value.length <= 128;

async function readArchive(request) {
  if (!request.body || Number(request.headers.get("Content-Length")) > maxBackupBytes) return null;
  const reader = request.body.getReader();
  const data = new Uint8Array(maxBackupBytes);
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return data.subarray(0, length);
      if (length + value.length > data.length) {
        await reader.cancel();
        return null;
      }
      data.set(value, length);
      length += value.length;
    }
  } finally { reader.releaseLock(); }
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
      const item = { row, care: await client.careSnapshot(), epoch: await client.epoch() };
      checkSize(item);
      accounts.push(item);
    }
    cursor = page.at(-1).username;
  }
  const reminders = [];
  for (const id of await store.reminderIds()) {
    const state = await env.REMINDERS.getByName(id).exportReminder();
    if (!state?.plan) continue;
    const item = { id, state };
    checkSize(item);
    reminders.push(item);
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
  return { version: 1, accounts, reminders, operations: await store.exportData(), ads, media,
    keyFingerprint: await fingerprint(env) };
}

async function fingerprint(env) {
  const keys = [env.EMAIL_AUTH_SECRET, env.VAPID_PUBLIC_KEY ?? "", env.REMINDER_SIGNING_KEY ?? ""];
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(JSON.stringify(keys)));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function restore(data, env, store, credentials, promotion, enableReminders) {
  if (data?.version !== 1 || !Array.isArray(data.accounts) || !Array.isArray(data.reminders) ||
      !Array.isArray(data.media) || !Array.isArray(data.ads?.campaigns) || !data.operations ||
      data.keyFingerprint !== await fingerprint(env)) throw new Error("incompatible_backup");
  for (const { row, care, epoch } of data.accounts) {
    if (!row || !/^[a-z0-9_]{3,32}$/.test(row.username) || !hex(row.email_id, 64) ||
        !hex(row.salt, 32) || !hex(row.proof, 64) || typeof row.email !== "string" ||
        !Number.isSafeInteger(care?.revision) || (epoch && !hex(epoch, 32))) throw new Error("invalid_backup");
    const current = await credentials.find(row.username);
    if (current && (current.email_id !== row.email_id || current.email !== row.email ||
        current.salt !== row.salt || current.proof !== row.proof)) throw new Error("account_conflict");
    const username = await credentials.usernameFor(row.email_id);
    if (username && username !== row.username) throw new Error("account_conflict");
  }
  for (const { id, state } of data.reminders) {
    if (!hex(id, 32) || !state?.plan || !Number.isSafeInteger(state.revision)) throw new Error("invalid_backup");
  }
  for (const { asset, data: encoded } of data.media) {
    if (!asset || !/^[a-f0-9-]{36}$/.test(asset.id) || !Number.isSafeInteger(asset.size) || asset.size < 1 ||
        asset.size > 8 * 1024 * 1024 || !/^image\/(gif|jpeg|png|webp)$|^video\/mp4$/.test(asset.type) ||
        typeof encoded !== "string" || atob(encoded).length !== asset.size) throw new Error("invalid_backup");
  }
  for (const { row, care, epoch } of data.accounts) {
    if (!await credentials.restoreAccount(row)) throw new Error("account_conflict");
    await env.EMAIL_ACCOUNTS.getByName(row.email_id).restoreCare(care, epoch);
  }
  for (const { asset, data: encoded } of data.media) await promotion.restoreMedia(asset, Uint8Array.from(atob(encoded), char => char.charCodeAt(0)));
  await promotion.restoreCampaigns(data.ads);
  await store.restoreData(data.operations);
  let resumed = 0;
  if (enableReminders) for (const { id, state } of data.reminders) {
    const restored = await env.REMINDERS.getByName(id).restoreReminder(state);
    if (restored) {
      await store.registerReminder(id);
      resumed++;
    }
  }
  return { accounts: data.accounts.length, media: data.media.length, reminders: resumed };
}

export async function handleMigration(request, env, url) {
  const token = env.MIGRATION_TOKEN;
  const provided = request.headers.get("Authorization")?.slice(7);
  if (!hex(token, 64)) return reply({ error: "not_found" }, 404);
  if (!request.headers.get("Authorization")?.startsWith("Bearer ") || !hex(provided, 64) ||
      !crypto.subtle.timingSafeEqual(encoder.encode(token), encoder.encode(provided))) return reply({ error: "unauthorized" }, 401);
  if (request.method !== "POST") return reply({ error: "method" }, 405);
  const store = env.OPERATIONS.getByName("operations");
  const credentials = env.CREDENTIALS.getByName("medora-credentials-v1");
  const promotion = env.PROMOTIONS.getByName("home");
  try {
    if (url.pathname.endsWith("/backup")) {
      const { password } = await smallJson(request, 1024) ?? {};
      if (!passwordValid(password)) return reply({ error: "invalid_password" }, 400);
      const archive = await encryptBackup(await collect(env, store, credentials, promotion), password, magic);
      return new Response(archive, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store",
        "Content-Disposition": 'attachment; filename="medora-server.medbackup"' } });
    }
    const encodedPassword = request.headers.get("X-Medora-Backup-Password");
    const password = encodedPassword && decodeURIComponent(encodedPassword);
    if (!passwordValid(password)) return reply({ error: "invalid_password" }, 400);
    const archive = await readArchive(request);
    if (!archive) return reply({ error: "invalid_backup" }, 400);
    const data = await decryptBackup(archive, password, magic);
    return reply(await restore(data, env, store, credentials, promotion, request.headers.get("X-Medora-Restore-Reminders") === "yes"));
  } catch (error) {
    const code = ["backup_too_large", "incompatible_backup", "account_conflict"].includes(error.message) ? error.message : "invalid_backup";
    return reply({ error: code }, code === "backup_too_large" ? 413 : code === "account_conflict" ? 409 : 400);
  }
}
