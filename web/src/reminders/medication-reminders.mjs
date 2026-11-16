import { operations } from "../operations/audit.mjs";
import { careSession } from "../accounts/email-auth.mjs";
import { DurableObject } from "cloudflare:workers";
import { nextCareReminder, validSchedule, reminderRequestLimit } from "./medication-schedule.mjs";
import { scheduleForPush } from "../../public/medication/domain/care-plan.js";
import { dayMs, localWall, timezone } from "../../public/medication/domain/wall-clock.js";
import { smallJson, validSubscription, validSubscriptionKey } from "../http/validation.mjs";
import { reminderCopy } from "./copy.mjs";
import { sendPush } from "./push.mjs";
import { matchesSubscriptionId, subscriptionId } from "../../public/medication/domain/subscription-id.js";

const encoder = new TextEncoder();
const sendWindow = 5 * 60_000;
const reply = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

async function deviceSignature(secret, id) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const hash = await crypto.subtle.sign("HMAC", key, encoder.encode(`medora-install-v1:${id}`));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function handleMedicationReminders(request, env, url) {
  if (!/^[a-f0-9]{64}$/.test(env.REMINDER_SIGNING_KEY)) return reply({ error: "unconfigured" }, 503);
  if (request.method !== "GET" && request.headers.get("Origin") !== url.origin) return reply({ error: "unauthorized" }, 401);
  const authorization = request.headers.get("Authorization") ?? "";

  if (url.pathname === "/api/reminders/enroll" && request.method === "POST") {
    const { success } = await env.PUSH_ENROLL_LIMIT.limit({ key: request.headers.get("CF-Connecting-IP") || "unknown" });
    if (!success) return reply({ error: "rate_limit" }, 429);
    const body = await smallJson(request);
    const subscription = validSubscription(body?.subscription);
    if (!subscription || !await validSubscriptionKey(subscription)) return reply({ error: "bad_subscription" }, 400);
    const id = await subscriptionId(subscription);
    return reply({ token: `${id}.${await deviceSignature(env.REMINDER_SIGNING_KEY, id)}` });
  }

  const testing = url.pathname === "/api/reminders/test" && request.method === "POST";
  if (!testing && (url.pathname !== "/api/reminders" || !["PUT", "GET"].includes(request.method))) return reply({ error: "not_found" }, 404);
  const match = /^Bearer ([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(authorization);
  if (!match || !crypto.subtle.timingSafeEqual(encoder.encode(match[2]), encoder.encode(await deviceSignature(env.REMINDER_SIGNING_KEY, match[1])))) {
    return reply({ error: "unauthorized" }, 401);
  }
  const { success } = await env.PUSH_DEVICE_LIMIT.limit({ key: match[1] });
  if (!success) return reply({ error: "rate_limit" }, 429);
  const device = env.REMINDERS.getByName(match[1]);
  if (testing) return reply(await device.test());
  if (request.method === "GET") return reply(await device.status());

  const body = await smallJson(request, reminderRequestLimit);
  if (!Number.isSafeInteger(body?.revision) || body.revision < 1 || typeof body.enabled !== "boolean") {
    return reply({ error: "bad_request" }, 400);
  }
  let plan = null;
  let link = null;
  let account;
  if (body.enabled) {
    const schedule = validSchedule(body);
    const subscription = validSubscription(body.subscription);
    if (!schedule || !subscription || !await matchesSubscriptionId(match[1], subscription)) {
      return reply({ error: "bad_schedule" }, 400);
    }
    plan = { ...schedule, subscription, language: body.language === "en" ? "en" : "fa" };
    if (body.account != null) {
      const { owner, revision, details } = body.account;
      if (typeof owner !== "string" || !/^[a-f0-9]{64}(?:\.[a-f0-9]{32})?$/.test(owner) ||
          !Number.isSafeInteger(revision) || revision < 0 || typeof details !== "boolean") return reply({ error: "bad_request" }, 400);
      const session = await careSession(request, env);
      if (!session || session.id !== owner.split(".")[0]) return reply({ error: "sign_in" }, 401);
      const client = env.EMAIL_ACCOUNTS.getByName(session.id);
      const care = await client.reminderScope(session.token, session.id);
      if (care?.owner !== owner || revision > care.revision) return reply({ error: "sign_in" }, 401);
      link = { owner, revision, details };
      account = { client, session };
    }
    // A registered device must be discoverable by backup even if this request is interrupted.
    if (operations(env)) await operations(env).registerReminder(match[1]);
  }
  const saved = await device.replace(body.revision, plan, link);
  if (account && saved.revision === body.revision &&
      !await account.client.registerReminderDevice(account.session.token, account.session.id, link.owner, match[1])) {
    await device.detachAccountPlan(link.owner, body.revision);
    return reply({ error: "sign_in" }, 401);
  }
  return reply(saved);
}

function publicState(state) {
  return {
    revision: state?.revision ?? 0, enabled: Boolean(state?.plan), next: state?.next?.at ?? null,
    nextKinds: state?.next ? state.next.kinds ?? ["dose"] : [],
    ...(state?.accountPlanError && { accountPlanError: state.accountPlanError,
      appliedAccountRevision: state.link?.revision, rejectedAccountRevision: state.rejectedAccountRevision,
      suspendedKinds: state.suspendedKinds }),
    last: state?.last ?? null
  };
}

// Compile independent categories from the new records. A rejected category
// must never fall back to instructions from an old plan.
function replacementPlan(raw, subscription, language) {
  const fits = input => encoder.encode(JSON.stringify({ ...input, subscription, language })).length <= reminderRequestLimit;
  const complete = fits(raw) && validSchedule(raw);
  if (complete) return { plan: complete, suspendedKinds: [] };

  let plan = { zone: raw.zone, rules: [] };
  const suspendedKinds = [];
  for (const [kind, field] of [["dose", "rules"], ["appointment", "appointments"], ["routine", "routineRules"], ["water", "water"]]) {
    const candidate = { ...plan, [field]: raw[field] };
    if (fits(candidate) && validSchedule(candidate)) plan = candidate;
    else suspendedKinds.push(kind);
  }
  return { plan: validSchedule(plan), suspendedKinds };
}

async function saveState(storage, state, alarm = state.next?.at) {
  await storage.put("state", state);
  if (alarm != null) await storage.setAlarm(alarm);
  else await storage.deleteAlarm();
}

export class MedicationReminders extends DurableObject {
  async exportReminder() {
    return await this.ctx.storage.get("state") ?? null;
  }

  async sendRelease(version) {
    const { storage } = this.ctx;
    if (this.env.MEDORA_PAUSE_PUSH === "true") return "retry";
    const reservation = await storage.transaction(async txn => {
      const previous = await txn.get("release-send");
      if (previous?.version === version && previous.until > Date.now()) return null;
      if (await txn.get("release-sent") === version) return null;
      const current = await txn.get("state");
      if (!current?.plan?.subscription) return null;
      await txn.put("release-send", { version, until: Date.now() + 20_000 });
      return current;
    });
    if (!reservation) return;
    const english = reservation.plan.language === "en";
    const outcome = await sendPush(this.env, reservation.plan.subscription, {
      title: english ? "Medora has been updated" : "مدورا به‌روز شد",
      body: english ? "Tap to open the latest version." : "برای باز کردن نسخهٔ تازه، روی اعلان بزنید.",
      tag: "medora-release", release: version,
      day: new Date().toISOString().slice(0, 10)
    }, 43_200, async () => (await storage.get("state"))?.revision === reservation.revision);
    const retry = ["failed", "superseded", "paused"].includes(outcome.status) ||
      outcome.providerStatus === 429 || outcome.providerStatus >= 500;
    await storage.transaction(async txn => {
      if ((await txn.get("release-send"))?.version !== version) return;
      if (!retry) await txn.put("release-sent", version);
      await txn.delete("release-send");
    });
    const count = operations(this.env)?.count(["release:" + outcome.status]);
    if (count) this.ctx.waitUntil(count.catch(() => {}));
    return retry ? "retry" : outcome.status;
  }

  async restoreReminder(state) {
    return this.ctx.storage.transaction(async storage => {
      const existing = await storage.get("state");
      if (existing) return existing.revision === state.revision && JSON.stringify(existing.plan) === JSON.stringify(state.plan);
      const now = Date.now();
      const next = !state.plan ? null : state.next && state.next.at > now - sendWindow
        ? state.next : nextCareReminder(state.plan, now);
      await saveState(storage, { ...state, next, attempts: 0 });
      return true;
    });
  }

  async status() {
    const state = await this.ctx.storage.get("state");
    const result = publicState(state);
    if (!state?.link?.owner) return result;
    const applied = state.link.revision;
    const target = await this.accountRevision(state.link) ?? state.rejectedAccountRevision ?? applied;
    const covered = state.rejectedAccountRevision ?? applied;
    const status = target > covered ? "pending" : state.accountPlanError ? "rejected" : "applied";
    return { ...result, accountSchedule: { status, applied, target } };
  }

  accountRevision(link) {
    const id = link.owner.split(".")[0];
    return this.env.EMAIL_ACCOUNTS?.getByName(id).reminderRevision(link.owner, id);
  }

  async test() {
    const now = Date.now();
    const target = await this.ctx.storage.transaction(async storage => {
      const state = await storage.get("state");
      if (!state?.plan?.subscription) return { status: "inactive" };
      const lastTest = await storage.get("lastTest");
      if (lastTest && now - lastTest < 60_000) return { status: "rate_limit" };
      await storage.put("lastTest", now);
      return { subscription: state.plan.subscription, revision: state.revision, language: state.plan.language };
    });
    if (!target.subscription) return target;
    return sendPush(this.env, target.subscription, {
      title: target.language === "en" ? "Medora notification test" : "آزمایش اعلان مدورا",
      body: target.language === "en" ? "Your notifications are working on this device." : "این پیام از اشتراک اعلان نوبت‌های همین دستگاه فرستاده شد.",
      tag: `test-${now.toString(36)}`, day: new Date(now).toISOString().slice(0, 10)
    }, 120, async () => (await this.ctx.storage.get("state"))?.revision === target.revision);
  }

  async replace(revision, plan, link = null) {
    return this.ctx.storage.transaction(async storage => {
      const previous = await storage.get("state");
      if (revision <= (previous?.revision ?? 0)) return publicState(previous);
      if (link && previous?.link?.owner === link.owner && Math.max(previous.link.revision, previous.rejectedAccountRevision ?? 0) > link.revision && previous.plan) {
        const state = { ...previous, revision };
        await saveState(storage, state, await storage.getAlarm());
        return publicState(state);
      }
      const next = plan ? nextCareReminder(plan, Date.now()) : null;
      const state = { revision, plan, next, link, last: previous?.last?.status === "gone" ? null : previous?.last ?? null, attempts: 0 };
      await saveState(storage, state);
      return publicState(state);
    });
  }

  async replaceAccountPlan(owner, revision, records) {
    return this.ctx.storage.transaction(async storage => {
      const state = await storage.get("state");
      if (!state?.plan || state.link?.owner !== owner) return "unlinked";
      if (revision < (state.rejectedAccountRevision ?? 0) ||
          (state.link.revision >= revision && !state.accountPlanError)) return "current";
      if (revision === state.rejectedAccountRevision) return "invalid";
      const now = Date.now();
      const { zone, subscription, language } = state.plan;
      const today = Math.floor(localWall(now, timezone(zone)) / dayMs);
      const raw = scheduleForPush({ ...records.settings, ...records, reminderDetails: state.link.details }, zone, today, now);
      const { plan, suspendedKinds } = replacementPlan(raw, subscription, language);
      const rejected = suspendedKinds.length > 0;
      await saveState(storage, { ...state,
        link: rejected ? state.link : { ...state.link, revision },
        rejectedAccountRevision: rejected ? revision : null,
        accountPlanError: rejected ? "bad_schedule" : null,
        suspendedKinds,
        plan: { ...plan, subscription, language },
        next: nextCareReminder(plan, now), attempts: 0
      });
      return rejected ? "invalid" : "updated";
    });
  }

  async detachAccountPlan(owner, revision) {
    return this.ctx.storage.transaction(async storage => {
      const state = await storage.get("state");
      if (state?.link?.owner !== owner || (revision !== undefined && state.revision !== revision)) return;
      await saveState(storage, { ...state, plan: null, next: null, link: null, accountPlanError: null, rejectedAccountRevision: null, suspendedKinds: [] });
    });
  }

  async alarm() {
    const state = await this.ctx.storage.get("state");
    // Older versions retained a superseded plan without recording which revision failed.
    if (!state?.next || !state.plan || (state.accountPlanError && state.rejectedAccountRevision == null)) return;
    const now = Date.now();
    const due = state.next.at;
    if (this.env.MEDORA_PAUSE_PUSH === "true") {
      await this.ctx.storage.setAlarm(Math.max(due, now + 60_000));
      return;
    }
    if (now < due) {
      await this.ctx.storage.setAlarm(due);
      return;
    }
    const dueKinds = (state.next.kinds ?? ["dose"]).filter(kind => kind !== "appointment" || now < state.next.appointmentExpires);
    const singleRoutine = dueKinds.length === 1 && dueKinds[0] === "routine";
    const tag = `${dueKinds.length === 1 ? dueKinds[0] : "care"}-${due.toString(36)}`;
    const currentIs = current => current?.revision === state.revision && current?.next?.at === due &&
      current.link?.revision === state.link?.revision &&
      current.rejectedAccountRevision === state.rejectedAccountRevision;
    const result = dueKinds.length && now - due < sendWindow ? await sendPush(this.env, state.plan.subscription, {
      ...reminderCopy(state.next, dueKinds, state.plan.language, state.plan.zone, now),
      kind: dueKinds.length === 1 ? dueKinds[0] : undefined, tag,
      ...(singleRoutine && state.next.routineId ? { routineId: state.next.routineId } : {}),
      day: new Date(state.next.day * 86_400_000).toISOString().slice(0, 10)
    }, 300, async () => {
      if (state.link?.owner && this.env.EMAIL_ACCOUNTS) {
        const revision = state.rejectedAccountRevision ?? state.link.revision;
        if (await this.accountRevision(state.link) !== revision) return false;
      }
      return currentIs(await this.ctx.storage.get("state"));
    }) : { status: "expired" };

    if (dueKinds.length && result.status !== "superseded") {
      const metrics = dueKinds.map(kind => `push:${kind}:${result.status}`);
      if (Number.isInteger(result.providerStatus)) metrics.push("push-http:" + result.providerStatus);
      const count = operations(this.env)?.count(metrics).catch(() => {});
      if (count) this.ctx.waitUntil(count);
    }

    await this.ctx.storage.transaction(async storage => {
      const current = await storage.get("state");
      if (!currentIs(current)) return;
      const finished = Date.now();
      const retry = result.status === "failed" || result.providerStatus === 429 || result.providerStatus >= 500;
      if (retry && current.attempts < 2 && finished - due + 30_000 < sendWindow) {
        await saveState(storage, { ...current, attempts: current.attempts + 1 }, finished + 30_000);
        return;
      }
      const plan = result.status === "gone" ? null : current.plan;
      const next = plan ? nextCareReminder(plan, finished) : null;
      const { status, providerStatus, reason } = result;
      await saveState(storage, { ...current, plan, next, attempts: 0, last: { at: due, status, providerStatus, reason, kinds: dueKinds } });
    });
  }
}
