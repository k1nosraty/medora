import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const { Miniflare, Response, convertV4MiniflareOptions } = require("miniflare");
const { build } = require("esbuild");

test("email login protects sessions and only an authenticated admin can publish", async () => {
  const { outputFiles } = await build({
    absWorkingDir: fileURLToPath(new URL("..", import.meta.url)),
    entryPoints: ["src/worker.mjs"], bundle: true, platform: "browser",
    format: "esm", external: ["cloudflare:workers"], write: false
  });
  const deliveries = [];
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: outputFiles[0].text, compatibilityDate: "2026-10-29",
    durableObjects: {
      EMAIL_ACCOUNTS: { className: "EmailAccount", useSQLite: true },
      PROMOTIONS: { className: "Promotions", useSQLite: true }
    },
    ratelimits: { EMAIL_AUTH_LIMIT: { namespace_id: "750503", simple: { limit: 8, period: 60 } } },
    bindings: {
      EMAIL_AUTH_SECRET: "d".repeat(64), EMAIL_FROM: "login@medora.example", RESEND_API_KEY: "test",
      ADMIN_EMAIL: "Me@Example.com"
    },
    outboundService: async request => {
      assert.equal(request.url, "https://api.resend.com/emails");
      deliveries.push(await request.json());
      return new Response(null, { status: 200 });
    }
  }));
  const origin = "https://medora.test";
  const auth = (route, body, cookie, ip = "192.0.2.2", requestOrigin = origin) =>
    mf.dispatchFetch(`${origin}/api/auth/${route}`, {
      method: body ? "POST" : "GET",
      headers: {
        "CF-Connecting-IP": ip, ...(cookie ? { Cookie: cookie } : {}),
        ...(body ? { Origin: requestOrigin, "Content-Type": "application/json" } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
  const readCode = index => deliveries[index].text.match(/[۰-۹]{6}/)[0].replace(/[۰-۹]/g, char => String(char.charCodeAt(0) & 15));
  const admin = (cookie, body, requestOrigin = origin) => mf.dispatchFetch(`${origin}/api/admin/promotion`, {
    method: body ? "PUT" : "GET",
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { Origin: requestOrigin, "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const publicPromotion = async () => (await (await mf.dispatchFetch(`${origin}/api/promotion`)).json()).promotion;
  try {
    assert.deepEqual(await (await auth("session")).json(), { available: true, email: null });
    const email = "me@example.com";
    assert.equal(await publicPromotion(), null);
    assert.equal((await admin()).status, 401);
    assert.equal((await auth("start", { email }, null, "192.0.2.2", "https://other.test")).status, 403);
    assert.equal(deliveries.length, 0);
    const started = await auth("start", { email: " Me@Example.com " });
    assert.equal(started.status, 202);
    assert.match(started.headers.get("Cache-Control"), /no-store/);
    const { challenge } = await started.json();
    assert.deepEqual(deliveries[0].to, [email]);
    assert.equal((await auth("start", { email }, null, "192.0.2.3")).status, 429);
    const proof = { email, challenge, code: readCode(0) };
    assert.equal((await auth("verify", { ...proof, email: "someone@example.com" }, null, "192.0.2.3")).status, 400);
    const results = await Promise.all([auth("verify", proof), auth("verify", proof)]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 400]);
    const loggedIn = results.find(result => result.ok);
    const session = loggedIn.headers.get("Set-Cookie");
    assert.match(session, /^__Host-medora_session=/);
    assert.match(session, /Secure; HttpOnly; SameSite=Lax/);
    const cookie = session.split(";")[0];
    assert.deepEqual(await loggedIn.json(), { email, admin: true });
    assert.deepEqual(await (await auth("session", null, cookie)).json(), { available: true, email, admin: true });
    const altered = cookie.slice(0, -1) + (cookie.endsWith("0") ? "1" : "0");
    assert.equal((await (await auth("session", null, altered)).json()).email, null);
    const promotion = { title: "A message", description: "Description", url: "https://example.com", enabled: true };
    assert.equal((await admin(altered, promotion)).status, 401);
    assert.equal((await admin(cookie, promotion, "https://other.test")).status, 403);
    assert.equal((await admin(cookie, { ...promotion, url: "javascript:alert(1)" })).status, 400);
    const published = (await (await admin(cookie, promotion)).json()).promotion;
    assert.equal(published.enabled, true);
    assert.deepEqual(await publicPromotion(), published);
    const hidden = (await (await admin(cookie, { ...promotion, enabled: false })).json()).promotion;
    assert.equal(hidden.id, published.id);
    assert.equal(await publicPromotion(), null);
    assert.equal((await auth("logout", {}, cookie, "192.0.2.2", "https://other.test")).status, 403);
    assert.match((await auth("logout", {}, cookie)).headers.get("Set-Cookie"), /Max-Age=0/);
    assert.equal((await (await auth("session", null, cookie)).json()).email, null);
    assert.equal((await admin(cookie, promotion)).status, 401);

    const other = "other@example.com";
    const second = await (await auth("start", { email: other })).json();
    const correct = readCode(1);
    const invalid = correct === "000000" ? "000001" : "000000";
    for (let i = 0; i < 5; i++) {
      assert.equal((await auth("verify", { ...second, email: other, code: invalid })).status, 400);
    }
    assert.equal((await auth("verify", { ...second, email: other, code: correct }, null, "192.0.2.3")).status, 400);
    const third = await auth("start", { email: "english@example.com", language: "en" });
    assert.equal(third.status, 202);
    assert.equal(deliveries[2].subject, "Your Medora sign-in code");
    assert.match(deliveries[2].text, /\b\d{6}\b/);
    const thirdChallenge = (await third.json()).challenge;
    const nonAdmin = await auth("verify", {
      email: "english@example.com", challenge: thirdChallenge, code: deliveries[2].text.match(/\b\d{6}\b/)[0]
    }, null, "192.0.2.4");
    assert.equal(nonAdmin.status, 200);
    const nonAdminCookie = nonAdmin.headers.get("Set-Cookie").split(";")[0];
    assert.equal((await admin(nonAdminCookie)).status, 403);
    assert.equal((await admin(nonAdminCookie, promotion)).status, 403);
    assert.equal(deliveries.length, 3);
  } finally {
    await mf.dispose();
  }
});
