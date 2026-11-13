import { Buffer } from "node:buffer";
import { smallJson } from "../http/validation.mjs";
import { mediaIdPattern } from "../promotions/media.mjs";
import { authorizeMigration, headers, reply } from "./migration.mjs";
import { assertBackup, decodeMedia, fingerprint, pushFingerprint, validateAccounts, validateCampaigns,
  validateFingerprint, validateMedia, validateOperations, validateReminders } from "./backup-validation.mjs";
import { advanceHash, isHash, isIndex, maxPartBytes, openPart, sealPart } from "./backup-parts-format.mjs";

const stages = ["start", "accounts", "reminders", "media", "operations", "end"];
const conflicts = ["archive_conflict", "account_conflict", "reminder_conflict", "restore_data_first",
  "part_out_of_order", "target_not_empty", "restore_in_progress"];
const continuityNames = ["EMAIL_AUTH_SECRET", "VAPID_PRIVATE_KEY", "VAPID_PUBLIC_KEY", "VAPID_SUBJECT", "REMINDER_SIGNING_KEY"];

async function nextRecord(cursor, env, store, credentials, promotion) {
  const stage = cursor?.stage ?? "start";
  const after = cursor?.after ?? "";
  assertBackup(stages.includes(stage) && typeof after === "string" && after.length <= 64);
  if (stage === "start") return { type: "start", consistent: env.MEDORA_MAINTENANCE === "true" && env.MEDORA_PAUSE_PUSH === "true",
    keys: { keyFingerprint: await fingerprint(env),
    pushFingerprint: await pushFingerprint(env) }, next: { stage: "accounts" } };
  if (stage === "accounts") {
    const [row] = await credentials.backupAccounts(after, 1);
    if (row) return { type: "accounts", accounts: [{ row, ...await env.EMAIL_ACCOUNTS.getByName(row.email_id).exportCare() }],
      next: { stage, after: row.username } };
    return nextRecord({ stage: "reminders" }, env, store, credentials, promotion);
  }
  if (stage === "reminders") {
    const ids = await store.reminderIds(after, 20);
    if (ids.length) {
      const reminders = [];
      for (const id of ids) {
        const state = await env.REMINDERS.getByName(id).exportReminder();
        if (state) reminders.push({ id, state });
      }
      return { type: "reminders", reminders, next: { stage, after: ids.at(-1) } };
    }
    return nextRecord({ stage: "media" }, env, store, credentials, promotion);
  }
  if (stage === "media") {
    const library = await promotion.library();
    const previous = after ? library.findIndex(asset => asset.id === after) : -1;
    if (after && previous < 0) throw new Error("source_changed");
    const asset = library[previous + 1];
    if (asset) {
      const bytes = await promotion.mediaBytes(asset.id, 0, asset.size - 1);
      return { type: "media", asset, data: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64"),
        next: { stage, after: asset.id } };
    }
    return { type: "ads", ads: await promotion.exportData(), next: { stage: "operations" } };
  }
  if (stage === "operations") {
    const cursor = after === "" ? 0 : Number(after);
    assertBackup(isIndex(cursor));
    const { operations, complete } = await store.exportOperationPage(cursor);
    return { type: stage, operations, next: complete ? { stage: "end" } : { stage, after: String(cursor + 100) } };
  }
  return { type: "end", next: null };
}

async function validatePart(record, env) {
  assertBackup(record && typeof record.type === "string");
  switch (record.type) {
    case "start": await validateFingerprint(record.keys, env); break;
    case "accounts": validateAccounts(record.accounts); break;
    case "reminders": await validateReminders(record.reminders); break;
    case "media": validateMedia(record.asset, decodeMedia(record.data)); break;
    case "ads": validateCampaigns(record.ads, new Map(record.ads.assets.map(asset => [asset.id, asset]))); break;
    case "operations": validateOperations(record.operations); break;
    case "end": break;
    default: assertBackup(false);
  }
}

async function writePart(record, env, store, credentials, promotion, phase) {
  if (phase === "reminders") {
    if (record.type === "reminders") for (const { id, state } of record.reminders) {
      await store.registerReminder(id);
      if (!await env.REMINDERS.getByName(id).restoreReminder(state)) throw new Error("reminder_conflict");
    }
    return;
  }
  if (record.type === "accounts") for (const { row, care, epoch } of record.accounts) {
    if (!await env.EMAIL_ACCOUNTS.getByName(row.email_id).restoreCare(care, epoch) ||
        !await credentials.restoreAccount(row)) throw new Error("account_conflict");
  }
  if (record.type === "media") await promotion.restoreMedia(record.asset, decodeMedia(record.data));
  if (record.type === "ads") {
    const library = await promotion.library();
    validateCampaigns(record.ads, new Map(library.map(asset => [asset.id, asset])));
    await promotion.restoreCampaigns(record.ads);
  }
  if (record.type === "operations") await store.restoreData(record.operations);
}

async function readPart(request) {
  const length = Number(request.headers.get("Content-Length"));
  assertBackup(request.body && isIndex(length) && length >= 60 && length <= maxPartBytes + 32 &&
    request.headers.get("Content-Type") === "application/octet-stream");
  const bytes = new Uint8Array(await request.arrayBuffer());
  assertBackup(bytes.length === length);
  const key = Buffer.from(bytes.buffer, bytes.byteOffset, 32).toString("hex");
  bytes.fill(0, 0, 32);
  return { key, part: bytes.subarray(32) };
}

export async function handleBackupParts(request, env, url) {
  const denied = authorizeMigration(request, env, url);
  if (denied) return denied;
  const store = env.OPERATIONS.getByName("operations");
  const credentials = env.CREDENTIALS.getByName("medora-credentials-v1");
  const promotion = env.PROMOTIONS.getByName("home");
  try {
    if (url.pathname.endsWith("/keys")) {
      const expires = Number(env.MIGRATION_TOKEN_EXPIRES_AT);
      if (env.MEDORA_EXPORT_CONTINUITY !== "true" || !isIndex(expires) ||
          expires <= Date.now() || expires - Date.now() > 15 * 60_000) return reply({ error: "key_export_disabled" }, 403);
      const { id, key } = await smallJson(request, 1024) ?? {};
      assertBackup(mediaIdPattern.test(id) && isHash(key) &&
        continuityNames.every(name => typeof env[name] === "string" && env[name].length > 0));
      const continuity = Object.fromEntries(continuityNames.map(name => [name, env[name]]));
      return new Response(await sealPart({ type: "keys", continuity }, key, id, 0), {
        headers: { ...headers, "Content-Type": "application/octet-stream" }
      });
    }
    if (url.pathname.endsWith("/backup")) {
      const { id, index, cursor, key } = await smallJson(request, 1024) ?? {};
      assertBackup(mediaIdPattern.test(id) && isIndex(index) && isHash(key) && ((index === 0) === !cursor));
      const record = await nextRecord(cursor, env, store, credentials, promotion);
      try { await validatePart(record, env); }
      catch (error) {
        if (error.message === "invalid_backup") return reply({ error: "invalid_source_" + record.type }, 409);
        throw error;
      }
      const bytes = await sealPart(record, key, id, index);
      return new Response(bytes, { headers: { ...headers, "Content-Type": "application/octet-stream" } });
    }

    const phase = request.headers.get("X-Medora-Phase");
    const verifying = url.pathname.endsWith("/verify");
    if (!verifying && (env.MEDORA_MAINTENANCE !== "true" || env.MEDORA_PAUSE_PUSH !== "true")) {
      return reply({ error: "maintenance_required" }, 409);
    }
    const id = request.headers.get("X-Medora-Archive");
    const index = Number(request.headers.get("X-Medora-Index") ?? NaN);
    const total = Number(request.headers.get("X-Medora-Total") ?? NaN);
    const hash = request.headers.get("X-Medora-Digest");
    assertBackup(mediaIdPattern.test(id) && isHash(hash) && isIndex(index) &&
      isIndex(total) && index < total && total >= 4 && ["data", "reminders"].includes(phase));
    const { key, part } = await readPart(request);
    let record;
    try { record = await openPart(part, key, id, index); }
    catch { return reply({ error: "invalid_part" }, 400); }
    assertBackup((record.type === "start") === (index === 0) && (record.type === "end") === (index === total - 1));
    await validatePart(record, env);
    if (verifying) return reply({ verified: true });

    const job = await store.partRestore(hash, total, phase, index);
    if (job.error) throw new Error(job.error);
    if (job.next !== undefined) return reply({ next: job.next });
    let chain;
    try {
      const updatedChain = await advanceHash(job.chain, part);
      assertBackup(index !== total - 1 || updatedChain === hash);
      if (!job.prepared) {
        const [accounts, adsEmpty, opsEmpty] = await Promise.all([
          credentials.backupAccounts("", 1), promotion.migrationTargetEmpty(), store.migrationTargetEmpty()
        ]);
        if (accounts.length || !adsEmpty || !opsEmpty) throw new Error("target_not_empty");
        await store.prepareRestore(job.id);
      }
      await writePart(record, env, store, credentials, promotion, phase);
      chain = updatedChain;
    } finally {
      await store.finishPart(job.id, phase, index, chain);
    }
    return reply({ next: index + 1 });
  } catch (error) {
    if (conflicts.includes(error.message)) return reply({ error: error.message }, 409);
    if (["invalid_backup", "incompatible_backup", "part_too_large", "source_changed"].includes(error.message)) {
      return reply({ error: error.message }, error.message === "part_too_large" ? 413 : 400);
    }
    return reply({ error: "migration_failed" }, 500);
  }
}
