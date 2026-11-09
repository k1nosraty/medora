import { DurableObject } from "cloudflare:workers";
import { nextCareReminder, validSchedule } from "./medication-schedule.mjs";
import { smallJson, validSubscription } from "./validation.mjs";
import { sendPush } from "./push.mjs";

const deviceId = /^[a-f0-9]{32}$/;
const encoder = new TextEncoder();
const sendWindow = 5 * 60_000;
const kinds = { dose: "دارو", water: "آب", appointment: "قرار" };
const reply = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

async function subscriptionId(endpoint) {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(endpoint));
  return Array.from(new Uint8Array(hash, 0, 16), byte => byte.toString(16).padStart(2, "0")).join("");
}

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
    if (!/^Bearer [a-f0-9]{36}$/.test(authorization) || !/^[a-f0-9]{36}$/.test(env.PILOT_ACCESS_CODE) ||
        !crypto.subtle.timingSafeEqual(encoder.encode(authorization.slice(7)), encoder.encode(env.PILOT_ACCESS_CODE))) {
      return reply({ error: "bad_code" }, 401);
    }
    const body = await smallJson(request);
    if (typeof body?.id !== "string" || !deviceId.test(body.id)) return reply({ error: "bad_request" }, 400);
    const signature = await deviceSignature(env.REMINDER_SIGNING_KEY, body.id);
    return reply({ token: `${body.id}.${signature}` });
  }

  const testing = url.pathname === "/api/reminders/test" && request.method === "POST";
  if (!testing && (url.pathname !== "/api/reminders" || !["PUT", "GET"].includes(request.method))) return reply({ error: "not_found" }, 404);
  const match = /^Bearer ([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(authorization);
  if (!match || !crypto.subtle.timingSafeEqual(encoder.encode(match[2]), encoder.encode(await deviceSignature(env.REMINDER_SIGNING_KEY, match[1])))) {
    return reply({ error: "unauthorized" }, 401);
  }
  const device = env.REMINDERS.getByName(match[1]);
  if (testing) return reply(await device.test());
  if (request.method === "GET") return reply(await device.status());

  const body = await smallJson(request, 96 * 1024);
  if (!Number.isSafeInteger(body?.revision) || body.revision < 1 || typeof body.enabled !== "boolean") {
    return reply({ error: "bad_request" }, 400);
  }
  let plan = null;
  if (body.enabled) {
    const schedule = validSchedule(body);
    const subscription = validSubscription(body.subscription);
    if (!schedule || !subscription || await subscriptionId(subscription.endpoint) !== match[1]) {
      return reply({ error: "bad_schedule" }, 400);
    }
    plan = { ...schedule, subscription };
  }
  return reply(await device.replace(body.revision, plan));
}

function publicState(state) {
  return {
    revision: state?.revision ?? 0, enabled: Boolean(state?.plan), next: state?.next?.at ?? null,
    nextKinds: state?.next ? state.next.kinds ?? ["dose"] : [],
    last: state?.last ?? null
  };
}

async function saveState(storage, state, alarm = state.next?.at) {
  await storage.put("state", state);
  if (alarm != null) await storage.setAlarm(alarm);
  else await storage.deleteAlarm();
}

export class MedicationReminders extends DurableObject {
  async status() {
    return publicState(await this.ctx.storage.get("state"));
  }

  async test() {
    const now = Date.now();
    const target = await this.ctx.storage.transaction(async storage => {
      const state = await storage.get("state");
      if (!state?.plan?.subscription) return { status: "inactive" };
      const lastTest = await storage.get("lastTest");
      if (lastTest && now - lastTest < 60_000) return { status: "rate_limit" };
      await storage.put("lastTest", now);
      return { subscription: state.plan.subscription, revision: state.revision };
    });
    if (!target.subscription) return target;
    return sendPush(this.env, target.subscription, {
      title: "آزمایش اعلان مدورا", body: "این پیام از اشتراک اعلان نوبت‌های همین دستگاه فرستاده شد.",
      tag: `test-${now.toString(36)}`, day: new Date(now).toISOString().slice(0, 10)
    }, 120, async () => (await this.ctx.storage.get("state"))?.revision === target.revision);
  }

  async replace(revision, plan) {
    return this.ctx.storage.transaction(async storage => {
      const previous = await storage.get("state");
      if (revision <= (previous?.revision ?? 0)) return publicState(previous);
      const next = plan ? nextCareReminder(plan, Date.now()) : null;
      const state = { revision, plan, next, last: previous?.last?.status === "gone" ? null : previous?.last ?? null, attempts: 0 };
      await saveState(storage, state);
      return publicState(state);
    });
  }

  async alarm() {
    const state = await this.ctx.storage.get("state");
    if (!state?.next || !state.plan) return;
    const now = Date.now();
    const due = state.next.at;
    if (now < due) {
      await this.ctx.storage.setAlarm(due);
      return;
    }
    const dueKinds = (state.next.kinds ?? ["dose"]).filter(kind => kind !== "appointment" || now < state.next.appointmentExpires);
    const tag = `${dueKinds.length === 1 ? dueKinds[0] : "care"}-${due.toString(36)}`;
    const currentIs = current => current?.revision === state.revision && current?.next?.at === due;
    const result = dueKinds.length && now - due < sendWindow ? await sendPush(this.env, state.plan.subscription, {
      title: "یادآوری مدورا",
      body: `یادآوری ${dueKinds.map(kind => kinds[kind]).join(" و ")}. برای دیدن جزئیات مدورا را باز کنید.`,
      kind: dueKinds[0], tag,
      day: new Date(state.next.day * 86_400_000).toISOString().slice(0, 10)
    }, 300, async () => currentIs(await this.ctx.storage.get("state"))) : { status: "expired" };

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
