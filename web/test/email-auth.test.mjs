import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const { Miniflare, Response, convertV4MiniflareOptions } = require("miniflare");
const { build } = require("esbuild");

test("registration consumes a single code and password login preserves admin authorization", async () => {
  const { outputFiles } = await build({
    absWorkingDir: fileURLToPath(new URL("..", import.meta.url)),
    entryPoints: ["src/worker.mjs"], bundle: true, platform: "browser",
    format: "esm", external: ["cloudflare:workers", "node:crypto"], write: false
  });
  const deliveries = [];
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: outputFiles[0].text, compatibilityDate: "2026-10-29",
    compatibilityFlags: ["nodejs_compat"],
    durableObjects: {
      EMAIL_ACCOUNTS: { className: "EmailAccount", useSQLite: true },
      CREDENTIALS: { className: "Credentials", useSQLite: true },
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
  const accounts = (cookie, { query = "", body, requestOrigin = origin } = {}) =>
    mf.dispatchFetch(`${origin}/api/admin/accounts?${query}`, {
      method: body ? "DELETE" : "GET",
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body ? { Origin: requestOrigin, "Content-Type": "application/json" } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
  const publicPromotion = async () => (await (await mf.dispatchFetch(`${origin}/api/promotion`)).json()).promotion;
  const cookieOf = response => response.headers.get("Set-Cookie").split(";")[0];
  const password = "river globe purple coat";
  const email = "me@example.com";
  const login = (username, password, ip) => auth("login", { username, password }, null, ip);
  try {
    assert.deepEqual(await (await auth("session")).json(), {
      available: true, registrationAvailable: true, email: null, username: null
    });
    assert.equal(await publicPromotion(), null);
    assert.equal((await admin()).status, 401);
    assert.equal((await auth("register-code", { email }, null, "192.0.2.2", "https://other.test")).status, 403);
    assert.equal((await auth("start", { email })).status, 404);
    assert.equal(deliveries.length, 0);

    const started = await auth("register-code", { email: " Me@Example.com " });
    assert.equal(started.status, 202);
    assert.match(started.headers.get("Cache-Control"), /no-store/);
    const { challenge } = await started.json();
    assert.deepEqual(deliveries[0].to, [email]);
    assert.equal((await auth("register-code", { email }, null, "192.0.2.3")).status, 429);
    const codeProof = { email, challenge, code: readCode(0) };
    assert.equal((await auth("confirm-email", { ...codeProof, email: "someone@example.com" })).status, 400);
    const confirmation = await Promise.all([auth("confirm-email", codeProof), auth("confirm-email", codeProof)]);
    assert.deepEqual(confirmation.map(result => result.status).sort(), [200, 400]);
    const verified = confirmation.find(result => result.ok);
    assert.equal(verified.headers.has("Set-Cookie"), false);
    const { grant } = await verified.json();

    const signup = { email, grant, username: "Medora_Admin", password };
    assert.equal((await auth("register", { ...signup, grant: "" })).status, 401);
    assert.equal((await auth("register", { ...signup, email: "someone@example.com" })).status, 401);
    assert.equal((await auth("register", { ...signup, password: "short" })).status, 400);
    const registered = await auth("register", signup);
    assert.equal(registered.status, 200, await registered.clone().text());
    assert.match(registered.headers.get("Set-Cookie"), /^__Host-medora_session=/);
    assert.match(registered.headers.get("Set-Cookie"), /Secure; HttpOnly; SameSite=Lax/);
    const cookie = cookieOf(registered);
    assert.deepEqual(await registered.json(), { email, username: "medora_admin", admin: true });
    assert.deepEqual(await (await auth("session", null, cookie)).json(), {
      available: true, registrationAvailable: true, email, username: "medora_admin", admin: true
    });
    assert.equal((await auth("register", { ...signup, username: "alternate" })).status, 409);
    assert.equal((await auth("register-code", { email })).status, 202);
    assert.equal(deliveries.length, 1);

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
    assert.equal((await admin(cookie)).status, 401);
    const wrong = await login("medora_admin", "this is a wrong password");
    assert.equal(wrong.status, 401);
    assert.deepEqual(await wrong.json(), await (await login("nobody", password)).json());
    const loggedIn = await login("MEDORA_ADMIN", password);
    assert.equal(loggedIn.status, 200);
    assert.equal((await admin(cookieOf(loggedIn))).status, 200);
    assert.equal(deliveries.length, 1);

    const other = "english@example.com";
    const sent = await auth("register-code", { email: other, language: "en" });
    assert.equal(sent.status, 202);
    assert.equal(deliveries[1].subject, "Verify your email for Medora");
    const secondProof = { email: other, challenge: (await sent.json()).challenge, code: deliveries[1].text.match(/\b\d{6}\b/)[0] };
    const secondGrant = (await (await auth("confirm-email", secondProof)).json()).grant;
    const duplicate = await auth("register", { email: other, grant: secondGrant, username: "MEDORA_ADMIN", password });
    assert.equal(duplicate.status, 409);
    assert.equal((await duplicate.json()).error, "username_taken");
    const nonAdmin = await auth("register", { email: other, grant: secondGrant, username: "second_user", password });
    assert.equal(nonAdmin.status, 200);
    assert.equal((await admin(cookieOf(nonAdmin), promotion)).status, 403);
    assert.equal(deliveries.length, 2);

    const legacyEmail = "old@example.com";
    const sign = (purpose, value) => createHmac("sha256", "d".repeat(64)).update(`${purpose}:${value}`).digest("hex");
    const legacyId = sign("account-v1", legacyEmail);
    const objects = await mf.getDurableObjectNamespace("EMAIL_ACCOUNTS");
    const legacyToken = await objects.getByName(legacyId).createSession(legacyEmail);
    const value = `${legacyId}.${legacyToken}`;
    const legacyCookie = `__Host-medora_session=${value}.${sign("session-v1", value)}`;
    const legacy = await auth("register", { username: "legacy", password }, legacyCookie, "192.0.2.4");
    assert.equal(legacy.status, 200);
    assert.equal((await login("legacy", password)).status, 200);
    assert.equal(deliveries.length, 2);

    const expiredEmail = "expired@example.com";
    const expired = Date.now() - 60_000;
    const expiredGrant = `${expired}.${sign("enrollment-v1", `${sign("account-v1", expiredEmail)}.${expired}`)}`;
    assert.equal((await auth("register", { email: expiredEmail, grant: expiredGrant, username: "expired", password },
      null, "192.0.2.4")).status, 401);

    for (let i = 0; i < 10; i++) {
      assert.equal((await login("second_user", "this is a wrong password", `192.0.2.${10 + i}`)).status, 401);
    }
    assert.equal((await login("second_user", password, "192.0.2.30")).status, 429);
    assert.equal(deliveries.length, 2);

    const adminCookie = cookieOf(loggedIn);
    const userCookie = cookieOf(nonAdmin);
    assert.equal((await accounts()).status, 401);
    assert.equal((await accounts(userCookie)).status, 403);
    const listed = await accounts(adminCookie);
    assert.equal(listed.headers.get("Cache-Control"), "no-store");
    const { users } = await listed.json();
    assert.deepEqual(users.map(user => Object.keys(user)), users.map(() => ["username", "email", "admin", "tag"]));
    const administrator = users.find(user => user.admin);
    assert.equal((await accounts(adminCookie, { body: administrator })).status, 409);
    const filtered = (await (await accounts(adminCookie, { query: "q=english%40example.com" })).json()).users;
    assert.equal(filtered.length, 1);
    const deleted = filtered[0];
    assert.equal(deleted.username, "second_user");
    assert.equal((await accounts(adminCookie, { body: deleted, requestOrigin: "https://other.test" })).status, 403);
    assert.equal((await accounts(adminCookie, { body: deleted })).status, 200);
    assert.equal((await (await auth("session", null, userCookie)).json()).email, null);
    assert.equal((await login(deleted.username, password, "192.0.2.31")).status, 401);
    const repeatedSignup = { email: other, grant: secondGrant, username: deleted.username, password };
    assert.equal((await auth("register", repeatedSignup, null, "192.0.2.31")).status, 401);
    const newCode = await auth("register-code", { email: other });
    assert.equal(newCode.status, 202);
    const freshProof = { email: other, challenge: (await newCode.json()).challenge, code: readCode(2) };
    const freshGrant = (await (await auth("confirm-email", freshProof)).json()).grant;
    assert.equal((await auth("register", { ...repeatedSignup, grant: freshGrant }, null, "192.0.2.31")).status, 200);
    assert.equal((await accounts(adminCookie, { body: deleted })).status, 409);
  } finally {
    await mf.dispose();
  }
});
