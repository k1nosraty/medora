import {
  nextCareReminder,
  validSchedule,
  reminderRequestLimit,
} from "./medication-schedule.mjs";
import { scheduleForPush } from "../../public/medication/domain/care-plan.js";
import {
  dayMs,
  localWall,
  timezone,
} from "../../public/medication/domain/wall-clock.js";
import { reminderCopy } from "./copy.mjs";

const encoder = new TextEncoder();
export const sendWindow = 5 * 60_000;
function publicState(state) {
  return {
    revision: state?.revision ?? 0,
    enabled: Boolean(state?.plan),
    next: state?.next?.at ?? null,
    nextKinds: state?.next ? (state.next.kinds ?? ["dose"]) : [],
    ...(state?.accountPlanError && {
      accountPlanError: state.accountPlanError,
      appliedAccountRevision: state.link?.revision,
      rejectedAccountRevision: state.rejectedAccountRevision,
      suspendedKinds: state.suspendedKinds,
    }),
    last: state?.last
      ? {
          at: state.last.at,
          status: state.last.status,
          providerStatus: state.last.providerStatus,
          kinds: state.last.kinds,
        }
      : null,
  };
}

// Compile independent categories from the new records. A rejected category
// must never fall back to instructions from an old plan.
function replacementPlan(raw, subscription, language) {
  const fits = (input) =>
    encoder.encode(JSON.stringify({ ...input, subscription, language }))
      .length <= reminderRequestLimit;
  const complete = fits(raw) && validSchedule(raw);
  if (complete) return { plan: complete, suspendedKinds: [] };

  let plan = { zone: raw.zone, rules: [] };
  const suspendedKinds = [];
  for (const [kind, field] of [
    ["dose", "rules"],
    ["appointment", "appointments"],
    ["routine", "routineRules"],
    ["water", "water"],
    ["sleep", "sleepRules"],
    ["cycle", "cycleTimes"],
  ]) {
    const candidate = { ...plan, [field]: raw[field] };
    if (fits(candidate) && validSchedule(candidate)) plan = candidate;
    else suspendedKinds.push(kind);
  }
  return { plan: validSchedule(plan), suspendedKinds };
}

export async function saveState(storage, state, alarm = state.next?.at) {
  await storage.put("state", state);
  if (alarm != null) await storage.setAlarm(alarm);
  else await storage.deleteAlarm();
}

export class ReminderDevice {
  constructor(storage, dependencies) {
    this.storage = storage;
    this.dependencies = dependencies;
  }

  async status() {
    const state = await this.storage.get("state");
    if (state?.revoked) return { ...publicState(state), revoked: true };
    const result = publicState(state);
    if (!state?.link?.owner) return result;
    const applied = state.link.revision;
    const target =
      (await this.accountRevision(state.link)) ??
      state.rejectedAccountRevision ??
      applied;
    const covered = state.rejectedAccountRevision ?? applied;
    const status =
      target > covered
        ? "pending"
        : state.accountPlanError
          ? "rejected"
          : "applied";
    return { ...result, accountSchedule: { status, applied, target } };
  }

  accountRevision(link) {
    return this.dependencies.accountRevision(link);
  }

  async test() {
    const now = Date.now();
    const target = await this.storage.transaction(async (storage) => {
      const state = await storage.get("state");
      if (state?.revoked) return { status: "revoked" };
      if (!state?.plan?.subscription) return { status: "inactive" };
      const lastTest = await storage.get("lastTest");
      if (lastTest && now - lastTest < 60_000) return { status: "rate_limit" };
      await storage.put("lastTest", now);
      return {
        subscription: state.plan.subscription,
        revision: state.revision,
        language: state.plan.language,
      };
    });
    if (!target.subscription) return target;
    return this.dependencies.send(
      target.subscription,
      {
        title:
          target.language === "en"
            ? "Medora notification test"
            : "آزمایش اعلان مدورا",
        body:
          target.language === "en"
            ? "Your notifications are working on this device."
            : "این پیام از اشتراک اعلان نوبت‌های همین دستگاه فرستاده شد.",
        tag: `test-${now.toString(36)}`,
        day: new Date(now).toISOString().slice(0, 10),
      },
      120,
      async () =>
        (await this.storage.get("state"))?.revision === target.revision,
    );
  }

  /** @param {number} revision @param {any} plan @param {{owner:string,revision:number,details:boolean}|null} link */
  async replace(revision, plan, link = null, revoke = false) {
    return this.storage.transaction(async (storage) => {
      const previous = await storage.get("state");
      if (previous?.revoked) return { ...publicState(previous), revoked: true };
      if (revision <= (previous?.revision ?? 0)) return publicState(previous);
      if (revoke) {
        const state = { revision, revoked: true, plan: null, next: null };
        await saveState(storage, state);
        await storage.delete(["lastTest", "release-send", "release-sent"]);
        return { ...publicState(state), revoked: true };
      }
      if (
        link &&
        previous?.link?.owner === link.owner &&
        Math.max(
          previous.link.revision,
          previous.rejectedAccountRevision ?? 0,
        ) > link.revision &&
        previous.plan
      ) {
        const state = { ...previous, revision };
        await saveState(storage, state, await storage.getAlarm());
        return publicState(state);
      }
      const next = plan ? nextCareReminder(plan, Date.now()) : null;
      const state = {
        revision,
        plan,
        next,
        link,
        last:
          previous?.last?.status === "gone" ? null : (previous?.last ?? null),
        attempts: 0,
      };
      await saveState(storage, state);
      return publicState(state);
    });
  }

  async replaceAccountPlan(owner, revision, records) {
    return this.storage.transaction(async (storage) => {
      const state = await storage.get("state");
      if (!state?.plan || state.link?.owner !== owner) return "unlinked";
      if (
        revision < (state.rejectedAccountRevision ?? 0) ||
        (state.link.revision >= revision && !state.accountPlanError)
      )
        return "current";
      if (revision === state.rejectedAccountRevision) return "invalid";
      const now = Date.now();
      const { zone, subscription, language } = state.plan;
      const today = Math.floor(localWall(now, timezone(zone)) / dayMs);
      const raw = scheduleForPush(
        {
          ...records.settings,
          ...records,
          reminderDetails: state.link.details,
        },
        zone,
        today,
        now,
      );
      const { plan, suspendedKinds } = replacementPlan(
        raw,
        subscription,
        language,
      );
      const rejected = suspendedKinds.length > 0;
      await saveState(storage, {
        ...state,
        link: rejected ? state.link : { ...state.link, revision },
        rejectedAccountRevision: rejected ? revision : null,
        accountPlanError: rejected ? "bad_schedule" : null,
        suspendedKinds,
        plan: { ...plan, subscription, language },
        next: nextCareReminder(plan, now),
        attempts: 0,
      });
      return rejected ? "invalid" : "updated";
    });
  }

  async detachAccountPlan(owner, revision) {
    return this.storage.transaction(async (storage) => {
      const state = await storage.get("state");
      if (
        state?.link?.owner !== owner ||
        (revision !== undefined && state.revision !== revision)
      )
        return;
      await saveState(storage, {
        ...state,
        plan: null,
        next: null,
        link: null,
        accountPlanError: null,
        rejectedAccountRevision: null,
        suspendedKinds: [],
      });
    });
  }

  async alarm() {
    const state = await this.storage.get("state");
    // Older versions retained a superseded plan without recording which revision failed.
    if (
      !state?.next ||
      !state.plan ||
      (state.accountPlanError && state.rejectedAccountRevision == null)
    )
      return;
    const now = Date.now();
    const due = state.next.at;
    if (this.dependencies.paused()) {
      await this.storage.setAlarm(Math.max(due, now + 60_000));
      return;
    }
    if (now < due) {
      await this.storage.setAlarm(due);
      return;
    }
    const dueKinds = (state.next.kinds ?? ["dose"]).filter(
      (kind) => kind !== "appointment" || now < state.next.appointmentExpires,
    );
    const singleRoutine = dueKinds.length === 1 && dueKinds[0] === "routine";
    const tag = `${dueKinds.length === 1 ? dueKinds[0] : "care"}-${due.toString(36)}`;
    const currentIs = (current) =>
      current?.revision === state.revision &&
      current?.next?.at === due &&
      current.link?.revision === state.link?.revision &&
      current.rejectedAccountRevision === state.rejectedAccountRevision;
    const result =
      dueKinds.length && now - due < sendWindow
        ? await this.dependencies.send(
            state.plan.subscription,
            {
              ...reminderCopy(
                state.next,
                dueKinds,
                state.plan.language,
                state.plan.zone,
                now,
              ),
              kind: dueKinds.length === 1 ? dueKinds[0] : undefined,
              tag,
              ...(singleRoutine && state.next.routineId
                ? { routineId: state.next.routineId }
                : {}),
              day: new Date(state.next.day * 86_400_000)
                .toISOString()
                .slice(0, 10),
            },
            300,
            async () => {
              if (state.link?.owner && this.dependencies.checkAccount) {
                const revision =
                  state.rejectedAccountRevision ?? state.link.revision;
                if ((await this.accountRevision(state.link)) !== revision)
                  return false;
              }
              return currentIs(await this.storage.get("state"));
            },
          )
        : { status: "expired" };

    if (dueKinds.length && result.status !== "superseded") {
      const metrics = dueKinds.map((kind) => `push:${kind}:${result.status}`);
      if (Number.isInteger(result.providerStatus))
        metrics.push("push-http:" + result.providerStatus);
      this.dependencies.count(metrics);
    }

    await this.storage.transaction(async (storage) => {
      const current = await storage.get("state");
      if (!currentIs(current)) return;
      const finished = Date.now();
      const retry =
        result.status === "failed" ||
        result.providerStatus === 429 ||
        result.providerStatus >= 500;
      if (
        retry &&
        current.attempts < 2 &&
        finished - due + 30_000 < sendWindow
      ) {
        await saveState(
          storage,
          { ...current, attempts: current.attempts + 1 },
          finished + 30_000,
        );
        return;
      }
      const plan = result.status === "gone" ? null : current.plan;
      const next = plan ? nextCareReminder(plan, finished) : null;
      const { status, providerStatus } = result;
      await saveState(storage, {
        ...current,
        plan,
        next,
        attempts: 0,
        last: { at: due, status, providerStatus, kinds: dueKinds },
      });
    });
  }
}
