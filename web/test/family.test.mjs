import assert from "node:assert/strict";
import { createECDH, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { scheduleForPush } from "../../apps/web/product-assets/public/medication/domain/care-plan.js";
import { subscriptionId } from "../../apps/web/product-assets/public/medication/domain/subscription-id.js";
import { emptyCareRecords } from "../../apps/web/product-assets/public/medication/domain/family.js";
import { ageAt, validPersonalProfile } from "../../apps/web/product-assets/public/medication/domain/profile.js";

const require = createRequire(import.meta.url);

test("profile age follows the birthday and rejects invalid dates", () => {
  assert.equal(ageAt("1987-10-22", new Date(2026, 9, 21)), 38);
  assert.equal(ageAt("1987-10-22", new Date(2026, 9, 22)), 39);
  assert.equal(ageAt("2003-02-29", new Date(2026, 0, 1)), null);
  assert.equal(validPersonalProfile({ heightCm: -170 }), false);
});

test("family invitations, sharing and revocation are directional and group scoped", { timeout: 20_000 }, async () => {
  const { Miniflare, Response, convertV4MiniflareOptions } = require("miniflare");
  const { build } = require("esbuild");
  const { outputFiles } = await build({
    absWorkingDir: fileURLToPath(new URL("..", import.meta.url)),
    stdin: { resolveDir: fileURLToPath(new URL("..", import.meta.url)), contents: `
      export { default, Credentials, Operations } from "./src/worker.mjs";
      import { EmailAccount, Families, MedicationReminders } from "./src/worker.mjs";
      export class TestFamilies extends Families {
        failNextRemoval() { this.failRemoval = true; }
        eraseAccount(...args) {
          if (this.failRemoval) {
            this.failRemoval = false;
            throw new Error("temporary cleanup failure");
          }
          return super.eraseAccount(...args);
        }
      }
      export class TestAccount extends EmailAccount {
        async removalJob() { return await this.ctx.storage.get("account-deletion") ?? null; }
        async retryRemoval() { await this.finishRemoval(false); }
        pauseViews() { this.waitForView = new Promise(resolve => this.resume = resolve); }
        resumeViews() { this.resume?.(); this.waitForView = null; }
        viewStarted() { return this.started === true; }
        async exportFamilyCare(revision) {
          if (this.waitForView) {
            this.started = true;
            await this.waitForView;
          }
          return super.exportFamilyCare(revision);
        }
        async reminderJob() { return await this.ctx.storage.get("reminder-update") ?? null; }
        rejectNextSnapshotTransaction() { this.rejectSnapshot = true; }
        async queueReminderUpdate(...args) {
          if (this.rejectSnapshot) {
            this.rejectSnapshot = false;
            throw new Error("Synthetic transaction failure after staging the snapshot write");
          }
          await super.queueReminderUpdate(...args);
        }
        async retryReminderJob() {
          const job = await this.reminderJob();
          if (job) await this.ctx.storage.put("reminder-update", { ...job, at: Date.now() });
          await this.alarm();
        }
      }
      export class TestReminders extends MedicationReminders {
        failOnce() { this.failNext = true; }
        loseReplyOnce() { this.loseReply = true; }
        async replaceAccountPlan(...args) {
          if (this.failNext) {
            this.failNext = false;
            throw new Error("temporary test failure");
          }
          const result = await super.replaceAccountPlan(...args);
          if (this.loseReply) {
            this.loseReply = false;
            throw new Error("Synthetic lost device response");
          }
          return result;
        }
      }
    ` },
    bundle: true, platform: "browser", format: "esm", external: ["cloudflare:workers", "node:crypto", "node:buffer"], write: false
  });
  const mail = new Map();
  const origin = "https://medora.test";
  const vapid = createECDH("prime256v1");
  const vapidPublic = vapid.generateKeys().toString("base64url");
  const vapidSecret = Buffer.alloc(32);
  const privateKey = vapid.getPrivateKey();
  privateKey.copy(vapidSecret, vapidSecret.length - privateKey.length);
  const mf = new Miniflare(convertV4MiniflareOptions({
    cf: false, modules: true, script: outputFiles[0].text, compatibilityDate: "2026-10-29", compatibilityFlags: ["nodejs_compat"],
    durableObjects: {
      EMAIL_ACCOUNTS: { className: "TestAccount", useSQLite: true },
      CREDENTIALS: { className: "Credentials", useSQLite: true },
      FAMILIES: { className: "TestFamilies", useSQLite: true },
      OPERATIONS: { className: "Operations", useSQLite: true },
      REMINDERS: { className: "TestReminders", useSQLite: true }
    },
    ratelimits: {
      EMAIL_AUTH_LIMIT: { namespace_id: "750505", simple: { limit: 8, period: 60 } },
      PUSH_ENROLL_LIMIT: { namespace_id: "750501", simple: { limit: 8, period: 60 } },
      PUSH_DEVICE_LIMIT: { namespace_id: "750502", simple: { limit: 60, period: 60 } }
    },
    bindings: { EMAIL_AUTH_SECRET: "b".repeat(64), EMAIL_FROM: "login@medora.example", RESEND_API_KEY: "test",
      ADMIN_EMAIL: "admin@example.com", VAPID_PUBLIC_KEY: vapidPublic, VAPID_PRIVATE_KEY: vapidSecret.toString("base64url"),
      VAPID_SUBJECT: "mailto:push@medora.test", REMINDER_SIGNING_KEY: "c".repeat(64)
    },
    outboundService: async request => {
      assert.equal(request.url, "https://api.resend.com/emails");
      const message = await request.json();
      mail.set(message.to[0], message.text);
      return new Response(null, { status: 200 });
    }
  }));

  function call(path, data, cookie, method = data ? "POST" : "GET", extra = {}) {
    return mf.dispatchFetch(origin + "/api/" + path, { method, headers: {
      Origin: origin, "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.6", ...(cookie && { Cookie: cookie }), ...extra
    }, body: data && JSON.stringify(data) });
  }
  async function signup(username) {
    const email = username + "@example.com";
    const previous = mail.get(email);
    const { challenge } = await (await call("auth/register-code", { email })).json();
    await until(() => mail.has(email) && mail.get(email) !== previous);
    const code = mail.get(email).match(/[۰-۹]{6}/)[0].replace(/[۰-۹]/g, char => String(char.charCodeAt(0) & 15));
    const { grant } = await (await call("auth/confirm-email", { email, challenge, code })).json();
    const response = await call("auth/register", { email, grant, username, password: "family login sample" });
    assert.equal(response.status, 200, await response.clone().text());
    return response.headers.get("Set-Cookie").split(";")[0];
  }
  const stub = async (binding, name) => (await mf.getDurableObjectNamespace(binding)).getByName(name);
  async function until(check) {
    for (let i = 0; i < 50; i++) {
      if (await check()) return;
      await sleep(50);
    }
    assert.fail("condition did not become true");
  }
  const family = (cookie, data) => call("family", data, cookie);
  async function membership(cookie, group, self) {
    const { groups } = await (await family(cookie)).json();
    return groups.find(row => row.id === group).members.find(member => Boolean(member.self) === self).id;
  }
  async function invite(owner, recipient, group, email) {
    const { invite, delivered } = await (await family(owner, { action: "invite", group, email })).json();
    assert.equal(delivered, true);
    assert.equal((await family(owner, { action: "accept", invite })).status, 404);
    assert.equal((await family(recipient, { action: "accept", invite })).status, 200);
    assert.equal((await family(recipient, { action: "accept", invite })).status, 410);
  }

  try {
    assert.equal((await family()).status, 401);
    const a = await signup("family_a");
    const b = await signup("family_b");
    const { group } = await (await family(a, { action: "create", name: "Family", icon: "heart" })).json();
    const { group: otherGroup } = await (await family(a, { action: "create", name: "Other family" })).json();
    const lookup = { action: "invite-lookup", group, query: "family_b" };
    assert.equal((await family(b, lookup)).status, 403);
    for (const query of ["family_b", "@family_b", "family_b@example.com"]) {
      assert.deepEqual(await (await family(a, { ...lookup, query })).json(), { person: null });
    }
    assert.deepEqual(await (await family(a, { ...lookup, query: "new_member@example.com" })).json(), { person: null });
    const existingInvite = await (await family(a, { action: "invite", group, email: "family_b@example.com" })).json();
    assert.equal(existingInvite.delivered, true);
    const overview = (await (await family(a)).json()).groups.find(item => item.id === group);
    assert.equal(overview.icon, "heart");
    assert.equal(overview.pending[0].recipient, "family_b@example.com");
    const inbox = await (await call("family?inbox=1", null, b)).json();
    assert.equal(inbox.invitations[0].id, existingInvite.invite);
    const edit = { action: "update-group", group, name: "Care circle", icon: "sprout" };
    assert.equal((await family(b, edit)).status, 403);
    assert.equal((await family(a, { ...edit, name: " " })).status, 400);
    assert.equal((await family(a, { ...edit, icon: ["sprout"] })).status, 400);
    assert.equal((await family(a, edit)).status, 200);
    const renamedInbox = await (await call("family?inbox=1", null, b)).json();
    assert.equal(renamedInbox.invitations[0].name, edit.name);
    assert.equal((await family(b, { action: "accept", invite: existingInvite.invite })).status, 200);
    const memberGroup = (await (await family(b)).json()).groups.find(item => item.id === group);
    assert.equal(memberGroup.name, edit.name);
    assert.equal(memberGroup.icon, edit.icon);
    assert.equal((await family(b, { ...edit, name: "Wrong owner" })).status, 403);
    assert.deepEqual(await (await call("family?inbox=1", null, b)).json(), { invitations: [] });
    const newInvite = await (await family(a, { action: "invite", group, email: "new_member@example.com" })).json();
    assert.equal(newInvite.delivered, true);
    const newcomer = await signup("new_member");
    assert.equal((await family(newcomer, { action: "accept", invite: newInvite.invite })).status, 200);
    await invite(a, b, otherGroup, "family_b@example.com");
    const [aId, bId, otherA] = await Promise.all([
      membership(a, group, true), membership(b, group, true), membership(a, otherGroup, true)
    ]);
    const view = (cookie, target, scope = group) => family(cookie, { action: "view", group: scope, target });
    const share = (cookie, target, policy) => family(cookie, { action: "share", group, target, days: null, ...policy });
    assert.equal((await view(a, bId)).status, 403);
    assert.equal((await view(b, aId)).status, 403);
    assert.equal((await share(a, bId, { sections: ["profile"], record: false, add: false })).status, 200);
    assert.equal((await share(b, aId, { all: true, record: true, add: false })).status, 200);
    assert.equal((await view(b, otherA, otherGroup)).status, 403);
    assert.equal((await view(b, aId, otherGroup)).status, 403);

    const today = Math.floor(Date.now() / 86_400_000);
    const operation = randomUUID();
    const record = { action: "record", group, target: bId, operation, kind: "water", day: today, time: "09:00", amount: 250 };
    assert.equal((await family(a, record)).status, 409);
    const { owner, revision } = await (await call("account/care", null, b)).json();
    const records = emptyCareRecords();
    records.settings = { personalProfile: { firstName: "Sara" }, waterGoal: 2000, gender: "female" };
    records.cycleRecords[today] = { end: null, flow: "medium", note: "same account only until shared" };
    assert.equal((await call("account/care", { owner, revision, records, zone: "UTC" }, b, "PUT")).status, 200);
    const actorCare = await (await call("account/care", null, a)).json();
    const actorRecords = emptyCareRecords();
    actorRecords.settings.personalProfile = { firstName: "Ali", lastName: "Sadeghi" };
    assert.equal((await call("account/care", { ...actorCare, records: actorRecords, zone: "UTC" }, a, "PUT")).status, 200);
    const visible = await (await view(a, bId)).json();
    assert.equal(visible.records.profile.firstName, "Sara");
    assert.equal(visible.records.cycleRecords[today].flow, "medium");
    assert.equal(visible.records.waterGoal, 2000);
    assert.deepEqual(Object.keys((await (await view(b, aId)).json()).records).sort(), ["profile", "scheduleHistory"]);
    assert.equal((await family(b, { ...record, target: aId })).status, 403);
    assert.equal((await family(a, { ...record, action: "add", kind: "medicine" })).status, 403);
    assert.equal((await family(a, record)).status, 200);
    assert.equal((await family(a, record)).status, 200);
    const updated = await (await call("account/care", null, b)).json();
    assert.equal(updated.records.water.length, 1);
    assert.equal(updated.records.water[0].recordedBy, "family_a");
    assert.equal(updated.records.water[0].recordedByName, "Ali Sadeghi");
    assert.equal(updated.revision, revision + 2);

    const scheduled = { action: "add", kind: "medicine", group, target: bId, operation: randomUUID(),
      plan: { id: "supplied-id", name: "Two-stage plan", unit: "tablet", instructions: "with food",
        color: "purple", icon: "bottle", stock: 5000, threshold: 1000, phased: true, dates: [],
        phases: [
          { start: today, end: today + 7, interval: 1, mask: 127, slots: [{ minute: 480, amount: 500 }] },
          { start: today + 7, end: null, interval: 2, mask: 32, slots: [{ minute: 540, amount: 1000 }] }
        ] } };
    assert.equal((await family(a, scheduled)).status, 403);
    assert.equal((await share(b, aId, { all: true, record: true, add: true })).status, 200);
    const invalid = structuredClone(scheduled);
    invalid.plan.phases[1].start = today + 1;
    assert.equal((await family(a, invalid)).status, 400);
    assert.equal((await family(a, scheduled)).status, 200);
    assert.equal((await family(a, scheduled)).status, 200);
    const [savedPlan] = Object.values((await (await call("account/care", null, b)).json()).records.medicines);
    assert.equal(savedPlan.recordedBy, "family_a");
    assert.equal(savedPlan.recordedByName, "Ali Sadeghi");
    assert.notEqual(savedPlan.id, scheduled.plan.id);
    assert.deepEqual(savedPlan.phases, scheduled.plan.phases);
    assert.deepEqual((await (await call("account/care", null, a)).json()).records.medicines, {});

    const minute = 480;
    const day = today - 1;
    const originalDue = Date.now() + 90_000;
    const linkedSnapshot = await (await call("account/care", null, b)).json();
    const linkedRecords = linkedSnapshot.records;
    linkedRecords.medicines.postponed = { id: "postponed", name: "Postponed", unit: "tablet", stock: null,
      phases: [{ start: day, end: day + 1, interval: 1, mask: 127, slots: [{ minute, amount: 1000 }] }] };
    linkedRecords.doses[`postponed|${day}|${minute}`] = { medicineId: "postponed", day, minute,
      planned: 1000, actual: null, debit: 0, status: "snoozed", snoozeUntil: originalDue };
    for (const row of Object.values(linkedRecords.medicines)) if (row.id !== "postponed") row.paused = true;
    const saved = await (await call("account/care", { ...linkedSnapshot, records: linkedRecords, zone: "America/Toronto" }, b, "PUT")).json();
    assert.equal((await (await call("account/care?zone", null, b)).json()).zone, "UTC");
    const zone = (value, revision) => call("account/care", { owner, revision, zone: value }, b, "PATCH");
    assert.equal((await zone("Asia/Tehran", saved.revision - 1)).status, 409);
    const changedZone = await (await zone("America/Toronto", saved.revision)).json();
    assert.equal(changedZone.revision, saved.revision + 1);
    const resetZone = await (await zone("UTC", changedZone.revision)).json();
    assert.equal(resetZone.zone, "UTC");
    const subscription = { endpoint: "https://web.push.apple.com/family-test-endpoint",
      keys: { p256dh: createECDH("prime256v1").generateKeys().toString("base64url"), auth: Buffer.alloc(16).toString("base64url") } };
    const { token } = await (await call("reminders/enroll", { subscription })).json();
    const headers = { Authorization: "Bearer " + token };
    const plan = { ...scheduleForPush({ ...linkedRecords.settings, ...linkedRecords }, "UTC", today),
      enabled: true, revision: 1, subscription, language: "en",
      account: { owner, revision: resetZone.revision, details: false } };
    assert.equal((await call("reminders", plan, a, "PUT", headers)).status, 401);
    assert.equal((await (await call("reminders", plan, b, "PUT", headers)).json()).next, originalDue);
    const account = await stub("EMAIL_ACCOUNTS", owner);
    const device = await stub("REMINDERS", await subscriptionId(subscription));
    const otherSubscription = { ...subscription, endpoint: "https://web.push.apple.com/second-family-test-endpoint" };
    const otherEnrollment = await (await call("reminders/enroll", { subscription: otherSubscription })).json();
    const otherHeaders = { Authorization: "Bearer " + otherEnrollment.token };
    assert.equal((await call("reminders", { ...plan, subscription: otherSubscription }, b, "PUT", otherHeaders)).status, 200);
    const otherDevice = await stub("REMINDERS", await subscriptionId(otherSubscription));
    await until(async () => !(await account.reminderJob()));
    await device.failOnce();
    await otherDevice.loseReplyOnce();
    assert.equal((await family(a, { action: "record", group, target: bId, operation: randomUUID(), kind: "medicine",
      id: "postponed", day, minute, status: "taken" })).status, 200);
    await until(async () => (await account.reminderJob())?.at > Date.now() + 20_000);
    assert.equal((await device.status()).next, originalDue);
    assert.equal((await device.status()).accountSchedule.status, "pending");
    assert.equal((await otherDevice.status()).next, null);
    assert.equal((await otherDevice.status()).accountSchedule.status, "applied");
    await account.retryReminderJob();
    assert.equal((await device.status()).next, null);
    assert.equal(await device.replaceAccountPlan(owner, saved.revision, linkedRecords), "current");
    assert.equal((await (await call("reminders", { ...plan, revision: 2 }, b, "PUT", headers)).json()).next, null);
    assert.equal((await family(a, { action: "add", group, target: bId, operation: randomUUID(), kind: "visit",
      day: today + 2, time: "14:00", name: "A future visit" })).status, 200);
    await until(async () => (await device.status()).nextKinds.includes("appointment"));

    const health = await (await call("account/care", null, b)).json();
    await account.rejectNextSnapshotTransaction();
    const failed = await call("account/care", { ...health, records: { ...health.records,
      water: [...health.records.water, { id: "synthetic-failed-write", day, time: "10:00", amount: 500 }] }
    }, b, "PUT");
    assert.equal(failed.status, 503);
    assert.deepEqual(await failed.json(), { error: "unavailable" });
    assert.deepEqual(await (await call("account/care", null, b)).json(), health);
    const overloaded = structuredClone(health.records);
    for (let index = 0; index < 101; index++) {
      const id = "synthetic-" + index;
      overloaded.medicines[id] = { id, name: id, unit: "tablet", phases: [
        { start: today, end: null, interval: 1, mask: 127, slots: [{ minute, amount: 1000 }] }
      ] };
    }
    const rejected = await (await call("account/care", { ...health, records: overloaded }, b, "PUT")).json();
    await until(async () => (await device.status()).rejectedAccountRevision === rejected.revision);
    const degraded = await device.status();
    assert.deepEqual(degraded.suspendedKinds, ["dose"]);
    assert.deepEqual(degraded.nextKinds, ["appointment"]);
    assert.equal(degraded.appliedAccountRevision, health.revision);
    assert.equal(await device.replaceAccountPlan(owner, rejected.revision, overloaded), "invalid");
    assert.equal((await call("account/care", { ...rejected, records: health.records }, b, "PUT")).status, 200);
    await until(async () => !(await device.status()).accountPlanError);

    const clear = { enabled: false, revoke: true, revision: 2 };
    const staleClear = await (await call("reminders", clear, null, "PUT", headers)).json();
    assert.equal(staleClear.enabled, true);
    clear.revision = staleClear.revision + 1;
    const clearDevice = () => call("reminders", clear, null, "PUT", headers);
    assert.deepEqual(await (await clearDevice()).json(), { revision: 3, enabled: false, revoked: true });
    assert.deepEqual(await (await clearDevice()).json(), { revision: 3, enabled: false, revoked: true });
    assert.equal((await call("reminders", null, null, "GET", headers)).status, 401);
    assert.equal((await call("reminders/test", {}, null, "POST", headers)).status, 401);
    assert.equal((await call("reminders", { ...plan, revision: 4 }, b, "PUT", headers)).status, 401);
    assert.deepEqual(JSON.parse(JSON.stringify(await device.exportReminder())),
      { revision: 3, revoked: true, plan: null, next: null });
    assert.equal((await otherDevice.status()).enabled, true);

    await account.pauseViews();
    const pendingView = view(a, bId);
    await until(() => account.viewStarted());
    assert.equal((await family(a, { action: "share", group: otherGroup, target: "all", sections: ["water"],
      record: false, add: false, days: null })).status, 200);
    let revoked = false;
    const waitingRevoke = family(b, { action: "revoke", group, target: aId }).then(response => {
      revoked = true;
      return response;
    });
    await sleep(50);
    assert.equal(revoked, false);
    await account.resumeViews();
    assert.equal((await pendingView).status, 200);
    assert.equal((await waitingRevoke).status, 200);
    assert.equal((await view(a, bId)).status, 403);
    assert.equal((await family(a, record)).status, 403);
    assert.equal((await share(b, aId, { all: true, record: true, add: true })).status, 200);

    assert.equal((await family(a, { action: "revoke", group, target: bId })).status, 200);
    assert.equal((await view(b, aId)).status, 403);
    assert.equal((await view(a, bId)).status, 200);
    assert.equal((await family(b, { action: "revoke", group, target: aId })).status, 200);
    assert.equal((await view(a, bId)).status, 403);
    assert.equal((await family(a, record)).status, 403);
    assert.equal((await call("account/care", null, b)).status, 200);

    const remove = { action: "delete-group", group };
    assert.equal((await family(b, remove)).status, 403);
    assert.equal((await share(b, aId, { all: true, record: false, add: false })).status, 200);
    const { invite: pending } = await (await family(a, { action: "invite", group, email: "later@example.com" })).json();
    const savedBeforeDeletion = (await (await call("account/care", null, b)).json()).records;
    assert.equal((await view(a, bId)).status, 200);
    assert.equal((await family(a, remove)).status, 200);
    for (const account of [a, b]) {
      const { groups } = await (await family(account)).json();
      assert.deepEqual(groups.map(item => item.id), [otherGroup]);
    }
    assert.equal((await family(a, { action: "cancel", invite: pending })).status, 404);
    assert.equal((await view(a, bId)).status, 403);
    assert.deepEqual((await (await call("account/care", null, b)).json()).records, savedBeforeDeletion);
    const admin = await signup("admin");
    async function removeAccount(username) {
      const { users } = await (await call("admin/accounts?q=" + username, null, admin)).json();
      const { tag } = users.find(user => user.username === username);
      const response = await call("admin/accounts", { username, tag }, admin, "DELETE");
      assert.equal(response.status, 200);
      return (await response.json()).cleanup;
    }
    const hub = await stub("FAMILIES", "care-groups");
    await hub.failNextRemoval();
    assert.equal((await removeAccount("family_b")).status, "pending");
    assert.equal((await family(b)).status, 401);
    assert.ok(await account.removalJob());
    await account.retryRemoval();
    assert.equal(await account.removalJob(), null);
    const removal = await account.removalStatus();
    assert.equal(removal.status, "complete");
    assert.ok(removal.familyRows > 0);
    assert.equal(removal.devices, 2);
    assert.equal((await device.status()).enabled, false);
    assert.equal((await (await family(a)).json()).groups[0].members.length, 1);
    assert.equal((await hub.exportFamilyPage("audit", 0)).some(row => row.actor === owner || row.subject === owner), false);
    await removeAccount("family_a");
    assert.deepEqual(await hub.exportFamilyPage("groups", 0), []);
    const recreated = await signup("family_b");
    assert.deepEqual((await (await family(recreated)).json()).groups, []);
  } finally { await mf.dispose(); }
});
