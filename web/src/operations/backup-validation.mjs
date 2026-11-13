import { Buffer } from "node:buffer";
import { validSubscription, validSubscriptionKey } from "../http/validation.mjs";
import { matchesSubscriptionId } from "../../public/medication/features/reminders/subscription-id.js";
import { validSchedule } from "../reminders/medication-schedule.mjs";
import { identify, mediaIdPattern } from "../promotions/media.mjs";
import { validatedPromotion } from "../promotions/routes.mjs";
import { validateCareRecords } from "../sync/routes.mjs";

export async function digest(bytes) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function fingerprint(env) {
  return digest(encoder.encode(JSON.stringify([env.EMAIL_AUTH_SECRET, env.VAPID_PUBLIC_KEY ?? "", env.REMINDER_SIGNING_KEY ?? ""])));
}

export function assertBackup(valid) {
  if (!valid) throw new Error("invalid_backup");
}

const encoder = new TextEncoder();
const hex = (value, length) => typeof value === "string" && value.length === length && /^[a-f0-9]+$/.test(value);
const text = value => typeof value === "string";
const count = value => Number.isSafeInteger(value) && value >= 0;
const unique = values => new Set(values).size === values.length;
export const decodeMedia = encoded => Buffer.from(encoded, "base64");

export async function validate(data, env) {
  assertBackup(data?.version === 1 && [data.accounts, data.reminders, data.media, data.ads?.assets,
    data.ads?.campaigns, data.operations?.counters, data.operations?.audit, data.operations?.tickets].every(Array.isArray));
  await validateFingerprint(data, env);
  validateAccounts(data.accounts);
  await validateReminders(data.reminders);
  const assets = new Map();
  for (const { asset, data: encoded } of data.media) {
    assertBackup(text(encoded));
    validateMedia(asset, decodeMedia(encoded));
    assertBackup(!assets.has(asset.id));
    assets.set(asset.id, asset);
  }
  validateCampaigns(data.ads, assets);
  validateOperations(data.operations);
}

export function pushFingerprint(env) {
  return digest(encoder.encode(JSON.stringify([env.VAPID_PRIVATE_KEY, env.VAPID_SUBJECT])));
}

export async function validateFingerprint(keys, env) {
  if (keys.keyFingerprint !== await fingerprint(env) || (keys.pushFingerprint !== undefined &&
      keys.pushFingerprint !== await pushFingerprint(env))) {
    throw new Error("incompatible_backup");
  }
}

export function validateAccounts(accounts) {
  for (const { row, care, epoch } of accounts) {
    assertBackup(row && /^[a-z0-9_]{3,32}$/.test(row.username) && hex(row.email_id, 64) &&
      hex(row.salt, 32) && hex(row.proof, 64) && text(row.email) && row.email.length <= 254 &&
      (row.created_at === null || count(row.created_at)) && (epoch === "" || hex(epoch, 32)) &&
      count(care?.revision) && (care.revision === 0 ? care.records === null : care.records !== null));
    if (care.records !== null) validateCareRecords(care.records);
  }
  assertBackup(unique(accounts.map(({ row }) => row.username)) && unique(accounts.map(({ row }) => row.email_id)));
}

export async function validateReminders(reminders) {
  for (const { id, state } of reminders) {
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
  assertBackup(unique(reminders.map(({ id }) => id)));
}

export function validateMedia(asset, bytes) {
  assertBackup(asset && mediaIdPattern.test(asset.id) && count(asset.size) &&
    asset.size <= 8 * 1024 * 1024 && text(asset.name) && count(asset.createdAt) && bytes.length === asset.size);
  const actualType = identify(bytes);
  assertBackup(actualType && actualType === asset.type);
}

export function validateCampaigns(ads, assets) {
  assertBackup(ads.assets.length === assets.size && unique(ads.assets.map(asset => asset.id)) &&
    ads.assets.every(asset => assets.get(asset.id)?.size === asset.size && assets.get(asset.id)?.type === asset.type));
  const validCreative = row => validatedPromotion(row) && (!row.mediaId || assets.get(row.mediaId)?.type.startsWith(row.mediaType + "/"));
  assertBackup(ads.campaigns.every(row => validCreative(row) && mediaIdPattern.test(row.id) &&
    (!row.stats || (count(row.stats.impression) && count(row.stats.click)))) &&
    unique(ads.campaigns.map(row => row.id)) && (!ads.preview || validCreative(ads.preview)));
}

export function validateOperations({ config, counters, audit, tickets }) {
  assertBackup(["promotions", "support"].every(key => count(config?.flags?.[key]) && config.flags[key] <= 100) &&
    (config.notice === null || (typeof config.notice?.enabled === "boolean" && text(config.notice.title) &&
      text(config.notice.message) && [config.notice.start, config.notice.end].every(time => time === null || count(time)))) &&
    counters.every(row => Number.isSafeInteger(row.day) && text(row.metric) && count(row.count)) &&
    audit.every(row => count(row.id) && count(row.at) && text(row.actor) && text(row.action)) &&
    tickets.every(row => mediaIdPattern.test(row.id) && text(row.email) && count(row.at) &&
      text(row.message) && text(row.diagnostics) && text(row.reply) && ["open", "closed"].includes(row.status)));
}

