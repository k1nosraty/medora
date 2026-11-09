import assert from "node:assert/strict";
import { createECDH } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { smallJson, validSubject, validSubscription } from "../src/validation.mjs";

const ecdh = createECDH("prime256v1");
const keys = { p256dh: ecdh.generateKeys().toString("base64url"), auth: Buffer.alloc(16).toString("base64url") };

test("restricts outbound push subscriptions to supported HTTPS providers", () => {
  const token = "push-token-long-enough";
  for (const endpoint of [
    `https://web.push.apple.com/${token}`,
    `https://fcm.googleapis.com/fcm/send/${token}`,
    `https://updates.push.services.mozilla.com/wpush/v2/${token}`
  ]) {
    assert.equal(validSubscription({ endpoint, keys }).endpoint, endpoint);
  }

  for (const endpoint of [
    `https://127.0.0.1/${token}`,
    `https://web.push.apple.com.attacker.test/${token}`,
    `http://web.push.apple.com/${token}`,
    `https://web.push.apple.com:1234/${token}`,
    `https://web.push.apple.com/${token}?destination=https://example.com`,
    `https://fcm.googleapis.com/invalid/path/${token}`
  ]) {
    assert.equal(validSubscription({ endpoint, keys }), null);
  }
  assert.equal(validSubscription({ endpoint: `https://web.push.apple.com/${token}`, keys: { ...keys, auth: "bad" } }), null);
});

test("supports real email and HTTPS VAPID contacts and caps request bodies", async () => {
  assert.equal(validSubject("https://github.com/k1nosraty/medora"), true);
  assert.equal(validSubject("mailto:pilot@example.com"), true);
  assert.equal(validSubject("http://localhost"), false);
  const request = body => new Request("https://pilot.example/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body
  });
  assert.deepEqual(await smallJson(request('{"delaySeconds":60}')), { delaySeconds: 60 });
  assert.equal(await smallJson(request(JSON.stringify({ invalid: "x".repeat(4096) }))), null);
});

test("the service worker displays a notification without an open client", async () => {
  const listeners = new Map();
  const notifications = [];
  const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  vm.runInNewContext(source, {
    self: {
      addEventListener: (name, listener) => listeners.set(name, listener),
      registration: { showNotification: async (title, options) => notifications.push({ title, ...options }) }
    }
  });
  let completion;
  listeners.get("push")({
    data: { json: () => ({ title: "Pilot", body: "Test", tag: "test-id" }) },
    waitUntil: promise => { completion = promise; }
  });
  await completion;
  assert.deepEqual(notifications, [{ title: "Pilot", body: "Test", tag: "test-id", icon: "/icon-192.png" }]);
  listeners.get("push")({
    data: { json: () => { throw new Error("malformed"); } },
    waitUntil: promise => { completion = promise; }
  });
  await completion;
  assert.equal(notifications.length, 2);
  assert.equal(notifications[1].title, "آزمایش اعلان مدورا");
  listeners.get("push")({
    data: { json: () => ({ title: "مدورا", body: "زمان یک نوبت دارو رسیده است.", tag: "dose-test", day: "2026-11-09" }) },
    waitUntil: promise => { completion = promise; }
  });
  await completion;
  assert.equal(notifications[2].data.day, "2026-11-09");
});
