import { withLocalWorker } from "./local-worker.mjs";
import { setTimeout as delay } from "node:timers/promises";
import assert from "node:assert/strict";
import { createECDH, createHmac, randomBytes } from "node:crypto";

export function fixturePush() {
  const vapid = createECDH("prime256v1");
  const pub = vapid.generateKeys();
  const privateKey = Buffer.alloc(32);
  const raw = vapid.getPrivateKey();
  raw.copy(privateKey, 32 - raw.length);
  return {
    MEDORA_PAUSE_PUSH: "true",
    REMINDER_SIGNING_KEY: randomBytes(32).toString("hex"),
    VAPID_PUBLIC_KEY: pub.toString("base64url"),
    VAPID_PRIVATE_KEY: privateKey.toString("base64url"),
    VAPID_SUBJECT: "mailto:fixture@example.test",
  };
}

export async function verifyReminderWrites(
  origin,
  expected,
  ownerHeaders,
  revision,
  push,
  database,
  connection,
) {
  const client = createECDH("prime256v1");
  const subscription = {
    endpoint: "https://web.push.apple.com/medora-local-test-device-only",
    keys: {
      p256dh: client.generateKeys().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
  };
  const path = origin + "/api/v2/reminders";
  function command(method, token, data, suffix = "") {
    return fetch(path + suffix, {
      method,
      headers: {
        ...ownerHeaders,
        ...(token && { Authorization: "Bearer " + token }),
      },
      ...(data && { body: JSON.stringify(data) }),
    });
  }
  assert.equal(
    (await fetch(origin + "/api/v2/config").then((r) => r.json())).publicKey,
    push.VAPID_PUBLIC_KEY,
  );
  const enrollment = await command("POST", null, { subscription }, "/enroll");
  assert.equal(enrollment.status, 200);
  const { token } = await enrollment.json();
  const id = token.split(".")[0];
  const stale = {
    revision: 1,
    enabled: true,
    zone: "UTC",
    rules: [],
    subscription,
  };
  const withAccount = {
    ...stale,
    revision: 2,
    account: { owner: expected.people[0].id, revision, details: false },
  };
  assert.equal(
    (
      await command("PUT", token, {
        ...withAccount,
        account: { ...withAccount.account, owner: expected.people[1].id },
      })
    ).status,
    401,
  );
  const saved = await command("PUT", token, withAccount);
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).revision, 2);
  assert.equal(
    (await command("PUT", token, stale).then((r) => r.json())).revision,
    2,
  );
  const diagnostic = await command("POST", token, null, "/test");
  assert.equal(diagnostic.status, 200);
  assert.equal((await diagnostic.json()).status, "paused");
  assert.equal(
    (await command("POST", token, null, "/test").then((r) => r.json())).status,
    "rate_limit",
  );
  const oldId = expected.device;
  const oldToken =
    oldId +
    "." +
    createHmac("sha256", push.REMINDER_SIGNING_KEY)
      .update("medora-install-v1:" + oldId)
      .digest("hex");
  assert.equal(
    (await command("GET", oldToken).then((r) => r.json())).revision,
    2,
  );
  assert.equal(
    (
      await command("PUT", oldToken, {
        revision: 3,
        enabled: false,
        revoke: true,
      }).then((r) => r.json())
    ).revoked,
    true,
  );
  assert.equal((await command("GET", oldToken)).status, 401);
  await withLocalWorker(
    database,
    48979,
    {
      ...push,
      MEDORA_LEGACY_WRITES_FENCED: "true",
      MEDORA_PASSWORD_KEYS: JSON.stringify({ legacy: "a".repeat(64) }),
      ADMIN_EMAIL: expected.people[1].credential[2],
    },
    async (gateway) => {
      const h = {
        ...ownerHeaders,
        Origin: gateway,
        Authorization: "Bearer " + token,
      };
      const current = await fetch(gateway + "/api/v2/reminders", {
        headers: h,
      });
      assert.equal(current.status, 200);
      assert.equal((await current.json()).revision, 2);
      const due = Date.now() + 1400;
      const scheduled = await fetch(gateway + "/api/v2/reminders", {
        method: "PUT",
        headers: h,
        body: JSON.stringify({
          ...withAccount,
          revision: 3,
          appointments: [[due, Math.floor(due / 86_400_000), due + 90_000]],
        }),
      });
      assert.equal(scheduled.status, 200);
      assert.equal((await scheduled.json()).next, due);
      await delay(Math.max(0, due - Date.now() + 50));
      assert.equal((await fetch(gateway + "/__scheduled")).status, 200);
      const result = await connection.query(
        "SELECT wake FROM medora.reminder_devices WHERE id=$1",
        [id],
      );
      assert.ok(Number(result.rows[0].wake) >= due + 60_000);
      assert.equal(
        (await (await fetch(gateway + "/api/v2/promotion")).json()).promotion
          .id,
        expected.postCampaign.id,
      );
    },
  );
  expected.postReminders = { id, revision: 3, revokedLegacy: true };
}
