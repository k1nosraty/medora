import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { emptyCareRecords } from "../public/medication/domain/family.js";
import { ageAt, validPersonalProfile } from "../public/medication/domain/profile.js";

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
    absWorkingDir: fileURLToPath(new URL("..", import.meta.url)), entryPoints: ["src/worker.mjs"],
    bundle: true, platform: "browser", format: "esm", external: ["cloudflare:workers", "node:crypto", "node:buffer"], write: false
  });
  const mail = new Map();
  const origin = "https://medora.test";
  const mf = new Miniflare(convertV4MiniflareOptions({
    cf: false, modules: true, script: outputFiles[0].text, compatibilityDate: "2026-10-29", compatibilityFlags: ["nodejs_compat"],
    durableObjects: {
      EMAIL_ACCOUNTS: { className: "EmailAccount", useSQLite: true },
      CREDENTIALS: { className: "Credentials", useSQLite: true },
      FAMILIES: { className: "Families", useSQLite: true }
    },
    ratelimits: { EMAIL_AUTH_LIMIT: { namespace_id: "750505", simple: { limit: 8, period: 60 } } },
    bindings: { EMAIL_AUTH_SECRET: "b".repeat(64), EMAIL_FROM: "login@medora.example", RESEND_API_KEY: "test" },
    outboundService: async request => {
      assert.equal(request.url, "https://api.resend.com/emails");
      const message = await request.json();
      mail.set(message.to[0], message.text);
      return new Response(null, { status: 200 });
    }
  }));

  function call(path, data, cookie, method = data ? "POST" : "GET") {
    return mf.dispatchFetch(origin + "/api/" + path, { method, headers: {
      Origin: origin, "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.6", ...(cookie && { Cookie: cookie })
    }, body: data && JSON.stringify(data) });
  }
  async function signup(username) {
    const email = username + "@example.com";
    const { challenge } = await (await call("auth/register-code", { email })).json();
    const code = mail.get(email).match(/[۰-۹]{6}/)[0].replace(/[۰-۹]/g, char => String(char.charCodeAt(0) & 15));
    const { grant } = await (await call("auth/confirm-email", { email, challenge, code })).json();
    const response = await call("auth/register", { email, grant, username, password: "family login sample" });
    assert.equal(response.status, 200, await response.clone().text());
    return response.headers.get("Set-Cookie").split(";")[0];
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
      assert.deepEqual(await (await family(a, { ...lookup, query })).json(), { person: { username: "family_b", name: "" } });
    }
    assert.deepEqual(await (await family(a, { ...lookup, query: "new_member@example.com" })).json(), { person: null });
    const existingInvite = await (await family(a, { action: "invite", group, username: "family_b" })).json();
    assert.equal(existingInvite.delivered, true);
    const overview = (await (await family(a)).json()).groups.find(item => item.id === group);
    assert.equal(overview.icon, "heart");
    assert.equal(overview.pending[0].recipient, "family_b");
    assert.equal(JSON.stringify(overview).includes("family_b@example.com"), false);
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

    assert.equal((await family(a, { action: "revoke", group, target: bId })).status, 200);
    assert.equal((await view(b, aId)).status, 403);
    assert.equal((await view(a, bId)).status, 200);
    assert.equal((await family(b, { action: "revoke", group, target: aId })).status, 200);
    assert.equal((await view(a, bId)).status, 403);
    assert.equal((await family(a, record)).status, 403);
    assert.equal((await call("account/care", null, b)).status, 200);
  } finally { await mf.dispose(); }
});
