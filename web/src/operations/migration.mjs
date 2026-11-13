import { encryptBackup, decryptBackup, maxBackupBytes } from "../../public/medication/features/backups/crypto.js";
import { smallJson, validSubscription, validSubscriptionKey } from "../http/validation.mjs";
import { matchesSubscriptionId } from "../../public/medication/features/reminders/subscription-id.js";
import { validSchedule } from "../reminders/medication-schedule.mjs";
import { identify, mediaIdPattern } from "../promotions/media.mjs";
import { validatedPromotion } from "../promotions/routes.mjs";
import { validateCareRecords } from "../sync/routes.mjs";

const magic = new TextEncoder().encode("MEDSRV01");
const encoder = new TextEncoder();
const hex = (value, length) => typeof value === "string" && value.length === length && /^[a-f0-9]+$/.test(value);
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const reply = (data, status = 200) => Response.json(data, { status, headers });
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
    keyFingerprint: await fingerprint(env), pushFingerprint: await digest(
      encoder.encode(JSON.stringify([env.VAPID_PRIVATE_KEY, env.VAPID_SUBJECT]))) };
}

async function digest(bytes) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

function fingerprint(env) {
  return digest(encoder.encode(JSON.stringify([env.EMAIL_AUTH_SECRET, env.VAPID_PUBLIC_KEY ?? "", env.REMINDER_SIGNING_KEY ?? ""])));
}

function assertBackup(valid) {
  if (!valid) throw new Error("invalid_backup");
}

const text = value => typeof value === "string";
const count = value => Number.isSafeInteger(value) && value >= 0;
const unique = values => new Set(values).size === values.length;
const decodeMedia = encoded => Uint8Array.from(atob(encoded), char => char.charCodeAt(0));

async function validate(data, env) {
  assertBackup(data?.version === 1 && [data.accounts, data.reminders, data.media, data.ads?.assets,
    data.ads?.campaigns, data.operations?.counters, data.operations?.audit, data.operations?.tickets].every(Array.isArray));
  if (data.keyFingerprint !== await fingerprint(env) || (data.pushFingerprint !== undefined &&
      data.pushFingerprint !== await digest(encoder.encode(JSON.stringify([env.VAPID_PRIVATE_KEY, env.VAPID_SUBJECT]))))) {
    throw new Error("incompatible_backup");
  }
  for (const { row, care, epoch } of data.accounts) {
    assertBackup(row && /^[a-z0-9_]{3,32}$/.test(row.username) && hex(row.email_id, 64) &&
      hex(row.salt, 32) && hex(row.proof, 64) && text(row.email) && row.email.length <= 254 &&
      (row.created_at === null || count(row.created_at)) && (epoch === "" || hex(epoch, 32)) &&
      count(care?.revision) && (care.revision === 0 ? care.records === null : care.records !== null));
    if (care.records !== null) validateCareRecords(care.records);
  }
  assertBackup(unique(data.accounts.map(({ row }) => row.username)) && unique(data.accounts.map(({ row }) => row.email_id)));
  for (const { id, state } of data.reminders) {
    assertBackup(hex(id, 32) && count(state?.revision) && state.revision > 0);
    const next = state?.next;
    if (state.plan === null) {
      assertBackup(next === null);
      continue;
    }
    const subscription = validSubscription(state.plan?.subscription);
    assertBackup(validSchedule(state.plan) && (next === null || (count(next?.at) && next.at < 8.64e15 &&
      Number.isInteger(next.day) && next.day >= -719162 && next.day <= 2932896 &&
      (next.kinds === undefined || (Array.isArray(next.kinds) && next.kinds.every(kind =>
        ["dose", "water", "appointment", "routine"].includes(kind)))))) && subscription &&
      await validSubscriptionKey(subscription) && await matchesSubscriptionId(id, subscription));
  }
  assertBackup(unique(data.reminders.map(({ id }) => id)));
  const assets = new Map();
  for (const { asset, data: encoded } of data.media) {
    assertBackup(asset && mediaIdPattern.test(asset.id) && !assets.has(asset.id) && count(asset.size) &&
      asset.size <= 8 * 1024 * 1024 && text(asset.name) && count(asset.createdAt) && text(encoded));
    const bytes = decodeMedia(encoded);
    assertBackup(bytes.length === asset.size && identify(bytes) === asset.type);
    assets.set(asset.id, asset);
  }
  assertBackup(data.ads.assets.length === assets.size && unique(data.ads.assets.map(asset => asset.id)) &&
    data.ads.assets.every(asset => assets.get(asset.id)?.size === asset.size && assets.get(asset.id)?.type === asset.type));
  const validCreative = row => validatedPromotion(row) && (!row.mediaId || assets.get(row.mediaId)?.type.startsWith(row.mediaType + "/"));
  assertBackup(data.ads.campaigns.every(row => validCreative(row) && mediaIdPattern.test(row.id) &&
    (!row.stats || (count(row.stats.impression) && count(row.stats.click)))) &&
    unique(data.ads.campaigns.map(row => row.id)) && (!data.ads.preview || validCreative(data.ads.preview)));
  const { config, counters, audit, tickets } = data.operations;
  assertBackup(["promotions", "support"].every(key => count(config?.flags?.[key]) && config.flags[key] <= 100) &&
    (config.notice === null || (typeof config.notice?.enabled === "boolean" && text(config.notice.title) &&
      text(config.notice.message) && [config.notice.start, config.notice.end].every(time => time === null || count(time)))) &&
    counters.every(row => Number.isSafeInteger(row.day) && text(row.metric) && count(row.count)) &&
    audit.every(row => count(row.id) && count(row.at) && text(row.actor) && text(row.action)) &&
    tickets.every(row => mediaIdPattern.test(row.id) && text(row.email) && count(row.at) &&
      text(row.message) && text(row.diagnostics) && text(row.reply) && ["open", "closed"].includes(row.status)));
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

export async function handleMigration(request, env, url) {
  const token = env.MIGRATION_TOKEN;
  const provided = request.headers.get("Authorization")?.slice(7);
  if (!hex(token, 64)) return reply({ error: "not_found" }, 404);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    return reply({ error: "https_required" }, 400);
  }
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
