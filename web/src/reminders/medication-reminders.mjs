import { sendReleaseNotice } from "./release.mjs";
import { operations } from "../operations/audit.mjs";
import { careSession } from "../accounts/email-auth.mjs";
import { DurableObject } from "cloudflare:workers";
import { nextCareReminder } from "./medication-schedule.mjs";
import { ReminderDevice, saveState, sendWindow } from "./device.mjs";
import { routeReminders } from "./routes.mjs";
import { sendPush } from "./push.mjs";

export function handleMedicationReminders(request, env, url) {
  return routeReminders(request, url, {
    signingKey: env.REMINDER_SIGNING_KEY,
    enrollBudget: async (request) =>
      (
        await env.PUSH_ENROLL_LIMIT.limit({
          key: request.headers.get("CF-Connecting-IP") || "unknown",
        })
      ).success,
    deviceBudget: async (key) =>
      (await env.PUSH_DEVICE_LIMIT.limit({ key })).success,
    device: (id) => env.REMINDERS.getByName(id),
    register: (id) => operations(env)?.registerReminder(id),
    async account(request, owner, revision) {
      const session = await careSession(request, env);
      if (!session || session.id !== owner.split(".")[0]) return null;
      const client = env.EMAIL_ACCOUNTS.getByName(session.id);
      const care = await client.reminderScope(session.token, session.id);
      if (care?.owner !== owner || revision > care.revision) return null;
      return {
        link: (id) =>
          client.registerReminderDevice(session.token, session.id, owner, id),
      };
    },
  });
}

export class MedicationReminders extends DurableObject {
  async exportReminder() {
    return (await this.ctx.storage.get("state")) ?? null;
  }

  async sendRelease(version) {
    const { storage } = this.ctx;
    if (this.env.MEDORA_PAUSE_PUSH === "true") return "retry";
    const reservation = await storage.transaction(async (txn) => {
      const previous = await txn.get("release-send");
      if (previous?.version === version && previous.until > Date.now())
        return null;
      if ((await txn.get("release-sent")) === version) return null;
      const current = await txn.get("state");
      if (!current?.plan?.subscription) return null;
      await txn.put("release-send", { version, until: Date.now() + 20_000 });
      return current;
    });
    if (!reservation) return;
    const { status, retry } = await sendReleaseNotice(
      (...args) => sendPush(this.env, ...args),
      reservation.plan,
      version,
      async () =>
        (await storage.get("state"))?.revision === reservation.revision,
    );
    await storage.transaction(async (txn) => {
      if ((await txn.get("release-send"))?.version !== version) return;
      if (!retry) await txn.put("release-sent", version);
      await txn.delete("release-send");
    });
    const count = operations(this.env)?.count(["release:" + status]);
    if (count) this.ctx.waitUntil(count.catch(() => {}));
    return retry ? "retry" : status;
  }

  async restoreReminder(state) {
    return this.ctx.storage.transaction(async (storage) => {
      const existing = await storage.get("state");
      if (existing)
        return (
          existing.revision === state.revision &&
          Boolean(existing.revoked) === Boolean(state.revoked) &&
          JSON.stringify(existing.plan) === JSON.stringify(state.plan)
        );
      const now = Date.now();
      const next = !state.plan
        ? null
        : state.next && state.next.at > now - sendWindow
          ? state.next
          : nextCareReminder(state.plan, now);
      await saveState(storage, { ...state, next, attempts: 0 });
      return true;
    });
  }

  #device() {
    return new ReminderDevice(this.ctx.storage, {
      checkAccount: Boolean(this.env.EMAIL_ACCOUNTS),
      paused: () => this.env.MEDORA_PAUSE_PUSH === "true",
      send: (...args) => sendPush(this.env, ...args),
      accountRevision: (link) => {
        const id = link.owner.split(".")[0];
        return this.env.EMAIL_ACCOUNTS?.getByName(id).reminderRevision(
          link.owner,
          id,
        );
      },
      count: (metrics) => {
        const count = operations(this.env)
          ?.count(metrics)
          .catch(() => {});
        if (count) this.ctx.waitUntil(count);
      },
    });
  }

  status() {
    return this.#device().status();
  }
  test() {
    return this.#device().test();
  }
  replace(...args) {
    return this.#device().replace(...args);
  }
  replaceAccountPlan(...args) {
    return this.#device().replaceAccountPlan(...args);
  }
  detachAccountPlan(...args) {
    return this.#device().detachAccountPlan(...args);
  }
  alarm() {
    return this.#device().alarm();
  }
}
