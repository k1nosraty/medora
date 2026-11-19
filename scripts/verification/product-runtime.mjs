// Standalone loopback Workerd and an in-memory mail sink. No external delivery.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { fixtureMailbox } from "./mailbox.mjs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
const mailbox = await fixtureMailbox();
const { codes } = mailbox;
const scratch = await mkdtemp(join(tmpdir(), "medora-product-"));
const port = 48973,
  origin = "http://127.0.0.1:" + port;
const env = {
  PATH: process.env.PATH,
  MEDORA_COMPAT_FIXTURE_KEY: randomBytes(32).toString("hex"),
  MEDORA_FIXTURE_STATE: scratch,
  MEDORA_FIXTURE_PORT: String(port),
  MEDORA_FIXTURE_MAILPIT: mailbox.origin,
};
let worker, closed;
async function start(fenced = false) {
  worker = spawn(process.execPath, ["apps/compat-worker/scripts/fixture-service.mjs"], {
    stdio: "ignore",
    env: { ...env, MEDORA_LEGACY_WRITES_FENCED: String(fenced) },
  });
  closed = once(worker, "exit");
  for (let n = 0; n < 100; n++) {
    if (worker.exitCode !== null)
      throw Error("Product fixture could not start");
    const res = await fetch(origin + "/api/auth/session").catch(() => null);
    if (res && (fenced ? res.status === 503 : res.ok)) return;
    await delay(100);
  }
  throw Error("Product fixture unavailable");
}
async function stop() {
  if (worker?.exitCode === null) worker.kill();
  await closed;
}
function account(label) {
  const email = label + "@example.test",
    username = "test_" + label,
    password = randomBytes(16).toString("hex");
  let cookie;
  const request = async (
    path,
    body,
    method = body ? "POST" : "GET",
    status = 200,
  ) => {
    const res = await fetch(origin + "/api/" + path, {
      method,
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...(cookie && { Cookie: cookie }),
      },
      ...(body && { body: JSON.stringify(body) }),
    });
    assert.equal(res.status, status, method + " " + path);
    if (res.headers.has("Set-Cookie"))
      cookie = res.headers.get("Set-Cookie").split(";")[0];
    return res.status === 204 ? {} : res.json();
  };
  async function register() {
    const { challenge } = await request(
      "auth/register-code",
      { email, language: "en" },
      "POST",
      202,
    );
    for (let n = 0; !codes.has(email) && n < 100; n++) await delay(50);
    assert.ok(codes.has(email), "Local verification message arrived");
    const { grant } = await request("auth/confirm-email", {
      email,
      challenge,
      code: codes.get(email),
    });
    await request("auth/register", { grant, email, username, password });
    assert.equal((await request("auth/session")).username, username);
  }
  return { request, register, email, username, password };
}
try {
  await start();
  const owner = account("owner"),
    member = account("member");
  await owner.register();
  await member.register();
  const empty = await owner.request("account/care");
  const today = Math.floor(Date.now() / 86400000);
  const records = {
    water: [{ id: "initial", day: today, time: "08:00", amount: 250 }],
    settings: {},
    medicines: {},
    doses: {},
    visits: {},
    routines: {},
    routineLogs: {},
  };
  await owner.request(
    "account/care",
    { owner: empty.owner, revision: 0, records, zone: "UTC" },
    "PUT",
  );
  const delta = {
    owner: empty.owner,
    revision: 1,
    changes: [["settings", "waterGoal", 1800]],
  };
  const receipt = await owner.request("account/care", delta, "PUT");
  assert.deepEqual(receipt, { owner: empty.owner, revision: 2, applied: true });
  await owner.request("account/care", delta, "PUT", 409);
  const { group } = await owner.request("family", {
    action: "create",
    name: "Fixture circle",
    icon: "group",
  });
  await owner.request("family", {
    action: "invite",
    group,
    email: member.email,
    language: "en",
  });
  const [{ id: invite }] = (await member.request("family")).invitations;
  await member.request("family", { action: "accept", invite });
  const [{ members }] = (await owner.request("family")).groups;
  const target = members.find((m) => !m.self).id,
    ownerMember = members.find((m) => m.self).id;
  await owner.request("family", {
    action: "share",
    group,
    target,
    sections: ["water"],
    days: 7,
    record: true,
    add: false,
  });
  assert.equal(
    (
      await member.request("family", {
        action: "view",
        group,
        target: ownerMember,
      })
    ).records.water.length,
    1,
  );
  const delegated = {
    action: "record",
    kind: "water",
    group,
    target: ownerMember,
    day: today,
    time: "12:00",
    amount: 350,
    operation: randomUUID(),
  };
  await member.request("family", delegated);
  await member.request("family", delegated);
  const current = await owner.request("account/care");
  assert.equal(current.records.water.length, 2);
  assert.equal(current.records.settings.waterGoal, 1800);
  await owner.request("family", { action: "revoke", group, target });
  await member.request(
    "family",
    { action: "view", group, target: ownerMember },
    "POST",
    403,
  );
  await owner.request(
    "support",
    { message: "Fixture support request" },
    "POST",
    201,
  );
  assert.equal((await owner.request("support")).tickets.length, 1);
  await stop();
  await start(true);
  await owner.request("account/care", delta, "PUT", 503);
  await stop();
  await start();
  assert.equal((await owner.request("account/care")).records.water.length, 2);
  await owner.request("auth/logout", {});
  await owner.request("auth/login", {
    username: owner.username,
    password: owner.password,
  });
  assert.equal((await owner.request("auth/session")).email, owner.email);
  console.log(
    "Loopback product passed registration, sessions, care deltas, invitation, scoped family write/replay/revoke, support and fenced restart.",
  );
} finally {
  await stop();
  await mailbox.close();
  await rm(scratch, { recursive: true, force: true });
}
