import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

export async function verifyRegistration(origin, mailbox) {
  const username = "rollback_fixture",
    email = username + "@example.test",
    password = randomBytes(24).toString("hex");
  const headers = { Origin: origin, "Content-Type": "application/json" };
  const send = (endpoint, value) =>
    fetch(origin + "/api/v2/" + endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(value),
    });
  const challenge = await send("identity/challenges", {
    email,
    purpose: "register",
    language: "fa",
  });
  assert.equal(challenge.status, 202);
  const { challenge: id } = await challenge.json();
  const deadline = Date.now() + 20_000;
  while (!mailbox.codes.has(email) && Date.now() < deadline) await delay(100);
  const code = mailbox.codes.get(email);
  assert.ok(code);
  const confirmation = await send("identity/confirm-email", {
    email,
    challenge: id,
    code,
  });
  assert.equal(confirmation.status, 200);
  const { grant } = await confirmation.json();
  const complete = { challenge: id, grant: grant.split(".")[1], password };
  const collision = await send("identity/register", {
    ...complete,
    username: "fixture0",
  });
  assert.equal(collision.status, 409);
  assert.equal((await collision.json()).error, "username_taken");
  assert.equal(
    (await send("identity/register", { ...complete, username })).status,
    200,
  );
  const login = await send("session", { username, password });
  assert.equal(login.status, 200);
  headers.Cookie = login.headers.get("set-cookie").split(";")[0];
  const profile = await (
    await fetch(origin + "/api/v2/profile", { headers })
  ).json();
  const owner = profile.scope;
  headers["X-Medora-Owner"] = owner;
  const day = 20001;
  const water = {
    id: "rollback-new-account-water",
    time: "08:00",
    day,
    amount: 100,
  };
  const edit = await send("care", {
    operation: randomUUID(),
    baseRevision: 0,
    changes: [["water", water.id, water]],
    zone: "UTC",
  });
  assert.equal(edit.status, 200);
  return { owner, username, email, password, water };
}
