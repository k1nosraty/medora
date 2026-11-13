import { handleMigration } from "./operations/migration.mjs";
import { handleCareSync } from "./sync/routes.mjs";
import { DurableObject } from "cloudflare:workers";
import { vapidHeaders } from "@block65/webcrypto-web-push";
import { pilotConfig, smallJson, validSubscription } from "./http/validation.mjs";
import { handleMedicationReminders } from "./reminders/medication-reminders.mjs";
import { sendPush } from "./reminders/push.mjs";
import { handleAdminAccounts, handleEmailAuth } from "./accounts/email-auth.mjs";
import { handleOperations } from "./operations/routes.mjs";
import { handlePromotions } from "./promotions/routes.mjs";

export { MedicationReminders } from "./reminders/medication-reminders.mjs";
export { EmailAccount } from "./accounts/email-auth.mjs";
export { Credentials } from "./accounts/credentials.mjs";
export { Operations } from "./operations/routes.mjs";
export { Promotions } from "./promotions/routes.mjs";

const hour = 3_600_000;
const expiry = 180_000;
const encoder = new TextEncoder();

function reply(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (["/api/migration/backup", "/api/migration/verify", "/api/migration/restore"].includes(url.pathname)) return handleMigration(request, env, url);
    if (env.MEDORA_MAINTENANCE === "true") {
      return Response.json({ error: "maintenance" }, { status: 503, headers: {
        "Cache-Control": "no-store", "Retry-After": "60"
      } });
    }
    if (url.pathname.startsWith("/api/auth/")) return handleEmailAuth(request, env, url, ctx);
    if (url.pathname === "/api/account/care") return handleCareSync(request, env, url);
    if (url.pathname === "/api/admin/accounts") return handleAdminAccounts(request, env, url, ctx);
    if (["/api/promotion", "/api/admin/promotion"].some(path => url.pathname === path || url.pathname.startsWith(path + "/"))) {
      return handlePromotions(request, env, ctx, url);
    }

    if (url.pathname === "/api/support" || ["/api/operations", "/api/operations/activity"].includes(url.pathname) ||
        ["/api/admin/operations", "/api/admin/operations/access", "/api/admin/operations/export", "/api/admin/operations/tickets"].includes(url.pathname)) {
      return handleOperations(request, env, url, ctx);
    }

    const vapid = pilotConfig(env);
    if (!vapid) return reply({ error: "unconfigured" }, 503);
    if (url.pathname === "/api/config" && request.method === "GET") {
      return reply({ publicKey: vapid.publicKey });
    }
    if (["/api/reminders", "/api/reminders/enroll", "/api/reminders/test"].includes(url.pathname)) {
      return handleMedicationReminders(request, env, url);
    }

    if (request.method !== "POST" || !["/api/test", "/api/status"].includes(url.pathname)) {
      return reply({ error: "not_found" }, 404);
    }

    const authorization = request.headers.get("Authorization") ?? "";
    if (request.headers.get("Origin") !== url.origin || !/^Bearer [a-f0-9]{36}$/.test(authorization) || !/^[a-f0-9]{36}$/.test(env.PILOT_ACCESS_CODE) ||
        !crypto.subtle.timingSafeEqual(encoder.encode(authorization.slice(7)), encoder.encode(env.PILOT_ACCESS_CODE))) {
      return reply({ error: "unauthorized" }, 401);
    }

    const body = await smallJson(request);
    const pilot = env.PILOT.getByName("medora-push-pilot");
    if (url.pathname === "/api/status") {
      if (typeof body?.id !== "string" || !/^[a-f0-9-]{36}$/.test(body.id)) return reply({ error: "bad_request" }, 400);
      const result = await pilot.status(body.id);
      return result ? reply(result) : reply({ error: "not_found" }, 404);
    }

    const subscription = validSubscription(body?.subscription);
    if (!subscription || ![0, 60].includes(body?.delaySeconds)) return reply({ error: "bad_subscription" }, 400);
    const result = await pilot.start(subscription, body.delaySeconds);
    return result.error ? reply(result, result.error === "rate_limit" ? 429 : 409) : reply(result, 202);
  }
};

export class PushPilot extends DurableObject {
  async start(subscription, delaySeconds) {
    const now = Date.now();
    const storage = this.ctx.storage;
    const state = await storage.get("pilot") ?? { recent: [] };
    if (state.pending && now < state.pending.dueAt + expiry) return { error: "pending" };

    const recent = state.recent.filter(result => result.createdAt >= now - hour);
    if (recent.length >= 12) return { error: "rate_limit" };

    const scheduled = { id: crypto.randomUUID(), status: "scheduled", createdAt: now, dueAt: now + delaySeconds * 1000 };
    // Storage writes issued together commit atomically, including the alarm.
    await Promise.all([
      storage.put("pilot", { recent: [...recent, scheduled], pending: { ...scheduled, subscription } }),
      storage.setAlarm(scheduled.dueAt)
    ]);
    return scheduled;
  }

  async status(id) {
    const state = await this.ctx.storage.get("pilot");
    const result = state?.recent.find(entry => entry.id === id);
    if (!result || result.createdAt < Date.now() - hour) return null;
    if (result.status === "scheduled" && Date.now() >= result.dueAt + expiry) return { ...result, status: "expired" };
    return result;
  }

  async alarm() {
    const storage = this.ctx.storage;
    const state = await storage.get("pilot");
    const job = state?.pending;
    if (!job) return;

    const now = Date.now();
    if (this.env.MEDORA_PAUSE_PUSH === "true") {
      if (now < job.dueAt + expiry) await storage.setAlarm(Math.max(job.dueAt, now + 60_000));
      return;
    }
    if (now < job.dueAt) {
      await storage.setAlarm(job.dueAt);
      return;
    }

    let outcome = { status: "expired" };
    if (now < job.dueAt + expiry) {
      outcome = await sendPush(this.env, job.subscription, {
        title: "آزمایش اعلان مدورا", body: "اعلان آزمایشی به این دستگاه رسید.", tag: job.id.replaceAll("-", "")
      }, 120);
    }

    // A late alarm must not remove a newer test.
    const current = await storage.get("pilot");
    if (current?.pending?.id !== job.id) return;
    await storage.put("pilot", {
      recent: current.recent.map(result => result.id === job.id ? { ...result, ...outcome, finishedAt: Date.now() } : result)
    });
  }

  async authorization(origin) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const vapid = pilotConfig(this.env);
      if (!vapid) throw new Error("Missing VAPID configuration");
      const key = `vapid:${origin}`;
      const cached = await this.ctx.storage.get(key);
      const now = Date.now();
      if (cached?.publicKey === vapid.publicKey && cached.subject === vapid.subject && now < cached.until) {
        return cached.authorization;
      }
      const { headers } = await vapidHeaders({ endpoint: origin }, vapid);
      await this.ctx.storage.put(key, { ...vapidIdentity(vapid), authorization: headers.authorization, until: now + 6 * hour });
      return headers.authorization;
    });
  }
}

function vapidIdentity(vapid) {
  return { publicKey: vapid.publicKey, subject: vapid.subject };
}
