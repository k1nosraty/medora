import { codeKey, identityKey, passwordKey, passwordVersion, sessionKey, validAuthKeys } from "./keys.mjs";
import { operations, logOperation } from "../operations/audit.mjs";
import { DurableObject } from "cloudflare:workers";
import { equal, hex, hmac, passwordProof, randomCode, sessionHash } from "./auth-crypto.mjs";
import { applyFamilyChange } from "../family/care.mjs";
import { profileName } from "../../public/medication/domain/profile.js";
import { reminderCareProjection } from "../../public/medication/domain/care-plan.js";
import { smallJson } from "../http/validation.mjs";
import { careSnapshotFits, careVersion, validateCareRecords } from "../../public/medication/domain/care-records.js";

const cookieName = "__Host-medora_session";
const minute = 60_000;
const day = 24 * 60 * minute;
const sessionAge = 30 * day;
const familyReplayAge = 7 * day;
const adminSessionMaxAge = 10 * minute;
const emailPattern = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;
const sessionPattern = /^([a-f0-9]{64})\.([a-f0-9]{64})\.([a-f0-9]{64})$/;
const challengePattern = /^([a-f0-9-]{36})\.([a-f0-9]{64})$/;
const grantPattern = /^(\d{13})(?:\.([a-f0-9]{32}))?\.([a-f0-9]{64})$/;
const usernamePattern = /^[a-z0-9_]{3,32}$/;
const authRoutes = ["register-code", "confirm-email", "register", "login", "logout", "reset-code", "reset-password"];

function configured(env) {
  return Boolean(env.EMAIL_ACCOUNTS && env.CREDENTIALS && env.EMAIL_AUTH_LIMIT &&
    validAuthKeys(env));
}
function canSendCode(env) {
  return Boolean(configured(env) && env.RESEND_API_KEY && env.EMAIL_FROM);
}
export function normalizeEmail(email) {
  if (typeof email !== "string") return "";
  email = email.trim().toLowerCase();
  return email.length <= 254 && email.split("@")[0].length <= 64 && emailPattern.test(email) ? email : "";
}
function usernameOf(username) {
  const normalized = typeof username === "string" ? username.trim().toLowerCase() : "";
  return usernamePattern.test(normalized) ? normalized : "";
}
function validPassword(password) {
  return typeof password === "string" && password.length <= 128 && [...password].length >= 15;
}
const accountScope = (id, epoch) => epoch ? id + "." + epoch : id;
async function accountId(env, email) {
  return await credentials(env).accountIdFor(email) ?? await hmac(identityKey(env), "account-v1", email);
}
const credentials = env => env.CREDENTIALS.getByName("medora-credentials-v1");
function cookie(value, maxAge) {
  return `${cookieName}=${value}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Lax`;
}
async function readSession(request, secret) {
  const item = (request.headers.get("Cookie") ?? "").split(";").map(part => part.trim())
    .find(part => part.startsWith(cookieName + "="));
  const match = item?.slice(cookieName.length + 1).match(sessionPattern);
  if (!match || !secret) return null;
  const [, id, token, signature] = match;
  return equal(signature, await hmac(secret, "session-v1", `${id}.${token}`)) ? { id, token } : null;
}
export async function signedInEmail(request, env) {
  if (!configured(env)) return null;
  const session = await readSession(request, sessionKey(env));
  return session ? env.EMAIL_ACCOUNTS.getByName(session.id).session(session.token) : null;
}
export async function careSession(request, env) {
  if (!configured(env)) return null;
  const session = await readSession(request, sessionKey(env));
  const username = session && await credentials(env).usernameFor(session.id);
  return username ? { ...session, username } : null;
}
export function isAdminEmail(email, env) {
  return Boolean(email && email === env.ADMIN_EMAIL?.trim().toLowerCase());
}
function account(email, env, username = null) {
  return { email, username, ...(isAdminEmail(email, env) ? { admin: true } : {}) };
}
function reply(data, status = 200, setCookie) {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (setCookie) headers["Set-Cookie"] = setCookie;
  return Response.json(data, { status, headers });
}

const deletionTag = (env, record) => hmac(sessionKey(env), "delete-account-v1", `${record.email_id}:${record.salt}`);

export async function handleAdminAccounts(request, env, url, ctx) {
  if (!["GET", "DELETE", "PATCH"].includes(request.method)) return reply({ error: "method" }, 405);
  const actor = await signedInEmail(request, env);
  if (!actor) return reply({ error: "sign_in" }, 401);
  if (!isAdminEmail(actor, env)) return reply({ error: "forbidden" }, 403);
  const index = credentials(env);
  if (request.method === "GET") {
    const after = url.searchParams.get("after") ?? "";
    const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    if ((after && !usernamePattern.test(after)) || query.length > 254) return reply({ error: "bad_request" }, 400);
    const records = await index.list(after, query);
    const users = await Promise.all(records.slice(0, 25).map(async record => ({
      username: record.username, email: record.email, admin: isAdminEmail(record.email, env),
      createdAt: record.created_at, emailVerified: true, tag: await deletionTag(env, record)
    })));
    return reply({ users, next: records.length > 25 ? users.at(-1).username : null });
  }
  if (request.headers.get("Origin") !== url.origin) return reply({ error: "forbidden" }, 403);
  const session = await readSession(request, sessionKey(env));
  if (!await env.EMAIL_ACCOUNTS.getByName(session.id).recentSession(session.token, actor)) {
    return reply({ error: "reauthenticate" }, 403);
  }
  const body = await smallJson(request, 4096);
  const username = usernameOf(body?.username);
  if (!username || typeof body.tag !== "string" || !/^[a-f0-9]{64}$/.test(body.tag)) {
    return reply({ error: "bad_request" }, 400);
  }
  const record = await index.find(username);
  if (!record || !equal(body.tag, await deletionTag(env, record))) return reply({ error: "account_changed" }, 409);
  if (isAdminEmail(record.email, env)) return reply({ error: "protected_account" }, 409);
  const client = env.EMAIL_ACCOUNTS.getByName(record.email_id);
  const revoke = request.method === "PATCH";
  const removed = revoke ? await client.revokeSessions(username, record.email_id, record.salt) :
    await client.remove(username, record.email_id, record.salt);
  if (removed) {
    const audit = logOperation(env, actor, revoke ? "sessions_revoked" : "account_removed");
    if (audit) ctx.waitUntil(audit);
  }
  return removed ? reply(revoke ? {} : { cleanup: await client.removalStatus() }) : reply({ error: "account_changed" }, 409);
}

export async function handleEmailAuth(request, env, url, ctx) {
  const route = url.pathname.slice("/api/auth/".length);
  if (route === "session" && request.method === "GET") {
    const email = await signedInEmail(request, env);
    const username = email ? await credentials(env).usernameFor(await accountId(env, email)) : null;
    return reply({ available: configured(env), registrationAvailable: canSendCode(env), ...account(email, env, username) });
  }
  if (request.method !== "POST" || !authRoutes.includes(route)) return reply({ error: "not_found" }, 404);
  if (request.headers.get("Origin") !== url.origin) return reply({ error: "forbidden" }, 403);
  if (route === "logout") {
    const session = await readSession(request, sessionKey(env));
    if (env.EMAIL_ACCOUNTS && session) await env.EMAIL_ACCOUNTS.getByName(session.id).logout(session.token);
    return reply({}, 200, cookie("", 0));
  }
  if (!configured(env)) return reply({ error: "unavailable" }, 503);
  const ip = request.headers.get("CF-Connecting-IP") ?? "local";
  if (!(await env.EMAIL_AUTH_LIMIT.limit({ key: `${route}:${ip}` })).success) return reply({ error: "rate_limit" }, 429);

  const body = await smallJson(request, 4096);
  const index = credentials(env);
  if (route === "login") {
    const username = usernameOf(body?.username);
    if (!username || !validPassword(body?.password)) return reply({ error: "credentials" }, 401);
    const record = await index.find(username);
    if (!record) {
      const task = operations(env)?.count(["login:failed"]).catch(() => {});
      if (task) ctx.waitUntil(task);
      return reply({ error: "credentials" }, 401);
    }
    const client = env.EMAIL_ACCOUNTS.getByName(record.email_id);
    const result = await client.login(username, record.email_id, body.password);
    const task = operations(env)?.count([result.token ? "login:success" : "login:failed"]).catch(() => {});
    if (task) ctx.waitUntil(task);
    if (!result.token) return reply({ error: result.error }, result.error === "rate_limit" ? 429 : 401);
    return signedIn(env, record.email, username, record.email_id, result.token);
  }
  if (route === "register") {
    const username = usernameOf(body?.username);
    if (!username) return reply({ error: "username" }, 400);
    if (!validPassword(body?.password)) return reply({ error: "password" }, 400);
    const session = body?.grant ? null : await readSession(request, sessionKey(env));
    const email = body?.grant ? normalizeEmail(body.email) :
      session && await env.EMAIL_ACCOUNTS.getByName(session.id).session(session.token);
    if (!email) return reply({ error: "setup_expired" }, 401);
    const id = session?.id ?? await accountId(env, email);
    const grant = body.grant ? await readGrant(env, id, body.grant) : null;
    if (body.grant && !grant) return reply({ error: "setup_expired" }, 401);
    const client = env.EMAIL_ACCOUNTS.getByName(id);
    const result = await client.register(username, id, email, body.password, grant, session?.token);
    if (result.error) return reply({ error: result.error }, result.error === "setup_expired" ? 401 : 409);
    return signedIn(env, email, username, id, result.token);
  }
  const email = normalizeEmail(body?.email);
  if (!email) return reply({ error: "email" }, 400);
  const secret = codeKey(env);
  const id = await accountId(env, email);
  const client = env.EMAIL_ACCOUNTS.getByName(id);
  if (route === "reset-code" || route === "register-code") {
    if (!canSendCode(env)) return reply({ error: "unavailable" }, 503);
    const reset = route === "reset-code";
    const challenge = crypto.randomUUID();
    // Both registered and unregistered addresses receive the same response.
    ctx.waitUntil((async () => {
      if (Boolean(await index.usernameFor(id)) === reset) {
        await client.start(email, body.language === "en" ? "en" : "fa", challenge, reset);
      }
    })().catch(() => console.warn("medora_code_delivery_failed")));
    const signature = await hmac(secret, reset ? "reset-challenge-v1" : "challenge-v1", `${id}.${challenge}`);
    return reply({ challenge: `${challenge}.${signature}` }, 202);
  }
  const { code } = body;
  const match = typeof body.challenge === "string" && body.challenge.match(challengePattern);
  const reset = route === "reset-password";
  const purpose = reset ? "reset-challenge-v1" : "challenge-v1";
  if (typeof code !== "string" || !/^\d{6}$/.test(code) || !match ||
      !equal(match[2], await hmac(secret, purpose, `${id}.${match[1]}`))) {
    return reply({ error: "invalid_code" }, 400);
  }
  if (reset) {
    if (!validPassword(body.password)) return reply({ error: "password" }, 400);
    const resetResult = await client.resetPassword(id, match[1], code, body.password);
    if (resetResult?.retry) return reply({ error: "reset_retry" }, 503);
    if (!resetResult) return reply({ error: "invalid_code" }, 400);
    return reply({}, 200, cookie("", 0));
  }
  const grant = await client.confirmCode(match[1], code);
  if (!grant) return reply({ error: "invalid_code" }, 400);
  const value = grant.epoch ? `${grant.expires}.${grant.epoch}` : String(grant.expires);
  const signature = await hmac(secret, "enrollment-v1", `${id}.${value}`);
  return reply({ grant: `${value}.${signature}` });
}

async function readGrant(env, id, value) {
  const match = typeof value === "string" && value.match(grantPattern);
  if (!match || Number(match[1]) <= Date.now()) return null;
  const proof = value.slice(0, value.lastIndexOf("."));
  if (!equal(match[3], await hmac(codeKey(env), "enrollment-v1", `${id}.${proof}`))) return null;
  return { expires: Number(match[1]), epoch: match[2] ?? "" };
}

async function signedIn(env, email, username, id, token) {
  const value = `${id}.${token}`;
  const signature = await hmac(sessionKey(env), "session-v1", value);
  return reply(account(email, env, username), 200, cookie(`${value}.${signature}`, sessionAge / 1000));
}

export class EmailAccount extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS deliveries (id TEXT PRIMARY KEY, sent INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS challenge (id TEXT PRIMARY KEY, proof TEXT NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS reset_challenge (id TEXT PRIMARY KEY, proof TEXT NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS pending_password_reset
        (id TEXT PRIMARY KEY REFERENCES reset_challenge(id) ON DELETE CASCADE, salt TEXT NOT NULL, proof TEXT NOT NULL, version TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS password_attempts (id INTEGER PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS account_reset (id INTEGER PRIMARY KEY, epoch TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS family_operations (operation TEXT PRIMARY KEY, expires INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS family_operations_expiry ON family_operations(expires);
    `);
  }

  async start(email, language, id = crypto.randomUUID(), reset = false) {
    const table = reset ? "reset_challenge" : "challenge";
    const code = randomCode();
    const proof = await hmac(codeKey(this.env), reset ? "reset-code-v1" : "code-v1", `${id}:${code}`);
    const now = Date.now();
    this.prune(now);
    if (reset && this.sql.exec("SELECT 1 FROM reset_challenge LIMIT 1").toArray().length) {
      return { error: "rate_limit" };
    }
    const recent = this.sql.exec("SELECT sent FROM deliveries ORDER BY sent DESC").toArray();
    if (recent.length >= 5 || now - (recent[0]?.sent ?? 0) < minute) return { error: "rate_limit" };
    this.ctx.storage.transactionSync(() => {
      this.sql.exec("INSERT INTO deliveries VALUES (?, ?)", id, now);
      this.sql.exec(`DELETE FROM ${table}`);
      this.sql.exec(`INSERT INTO ${table} (id, proof, expires) VALUES (?, ?, ?)`, id, proof, now + 10 * minute);
    });
    await this.scheduleCleanup();
    try {
      const localized = code.replace(/\d/g, digit => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        signal: AbortSignal.timeout(10_000),
        headers: { Authorization: `Bearer ${this.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": id },
        body: JSON.stringify({
          from: this.env.EMAIL_FROM, to: [email],
          subject: reset ? language === "en" ? "Reset your Medora password" : "بازیابی رمز مدورا" :
            language === "en" ? "Verify your email for Medora" : "تأیید ایمیل برای مدورا",
          text: reset ? (language === "en"
            ? `Your Medora password reset code is ${code}.\nIt expires in 10 minutes. If you didn't request a password reset, ignore this email.`
            : `کد بازیابی رمز مدورا: ${localized}\nاین کد تا ۱۰ دقیقه اعتبار دارد. اگر درخواست بازیابی نداده‌اید، این پیام را نادیده بگیرید.`) : language === "en"
            ? `Your Medora email verification code is ${code}.\nIt expires in 10 minutes. If you didn't request a code, you can ignore this email.`
            : `کد تأیید ایمیل شما در مدورا: ${localized}\nاین کد تا ۱۰ دقیقه اعتبار دارد. اگر شما درخواست کد نداده‌اید، این پیام را نادیده بگیرید.`
        })
      });
      const metric = response.ok ? "email:accepted" : "email:failed";
      const count = operations(this.env)?.count([metric]).catch(() => {});
      if (count) this.ctx.waitUntil(count);
      if (response.ok) return { challenge: id };
      await response.body?.cancel();
    } catch {
      // Treat delivery failures the same as a provider error.
    }
    this.sql.exec(`DELETE FROM ${table} WHERE id = ?`, id);
    return { error: "delivery" };
  }

  async takeCode(challenge, code, reset = false, consume = true) {
    const table = reset ? "reset_challenge" : "challenge";
    const proof = await hmac(codeKey(this.env), reset ? "reset-code-v1" : "code-v1", `${challenge}:${code}`);
    const row = this.sql.exec(`SELECT proof, attempts FROM ${table} WHERE id = ? AND expires > ?`, challenge, Date.now()).toArray()[0];
    if (!row) return false;
    if (!equal(proof, row.proof)) {
      if (row.attempts >= 4) this.sql.exec(`DELETE FROM ${table} WHERE id = ?`, challenge);
      else this.sql.exec(`UPDATE ${table} SET attempts = attempts + 1 WHERE id = ?`, challenge);
      return false;
    }
    if (consume) this.sql.exec(`DELETE FROM ${table} WHERE id = ?`, challenge);
    return reset || { expires: Date.now() + 10 * minute, epoch: this.epoch() };
  }

  confirmCode(challenge, code) {
    return this.takeCode(challenge, code);
  }

  async resetPassword(id, challenge, code, password) {
    return this.ctx.blockConcurrencyWhile(async () => {
      if (!await this.takeCode(challenge, code, true, false)) return false;
      const previous = this.sql.exec("SELECT salt, proof, version FROM pending_password_reset WHERE id=?", challenge).toArray()[0];
      const salt = previous?.salt ?? hex(crypto.getRandomValues(new Uint8Array(16)));
      const version = previous?.version ?? passwordVersion(this.env);
      const pepper = passwordKey(this.env, version);
      if (!pepper) return false;
      const proof = await passwordProof(pepper, password, salt);
      if (previous && !equal(previous.proof, proof)) return false;
      this.ctx.storage.transactionSync(() => {
        this.sql.exec("INSERT OR IGNORE INTO pending_password_reset VALUES (?,?,?,?)", challenge, salt, proof, version);
        this.sql.exec("DELETE FROM sessions");
      });
      try {
        if (!await credentials(this.env).replacePassword(id, salt, proof, version)) return false;
      } catch {
        // Return a retryable error while keeping the verified challenge.
        return { retry: true };
      }
      this.ctx.storage.transactionSync(() => {
        this.sql.exec("DELETE FROM password_attempts; DELETE FROM reset_challenge;");
      });
      return true;
    });
  }

  epoch() {
    return this.sql.exec("SELECT epoch FROM account_reset WHERE id = 1").toArray()[0]?.epoch ?? "";
  }

  async register(username, id, email, password, grant, sessionToken) {
    return this.ctx.blockConcurrencyWhile(async () => {
      if (await this.ctx.storage.get("account-deletion")) return { error: "setup_expired" };
      const verified = grant ? grant.epoch === this.epoch() && grant.expires > Date.now() :
        sessionToken && await this.session(sessionToken) === email;
      if (!verified) return { error: "setup_expired" };
      const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
      const proof = await passwordProof(passwordKey(this.env), password, salt);
      const error = await credentials(this.env).register(username, id, email, salt, proof, passwordVersion(this.env));
      return error ? { error } : { token: await this.createSession(email) };
    });
  }

  async login(username, emailId, password) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const record = await credentials(this.env).find(username);
      if (record?.email_id !== emailId) return { error: "credentials" };
      if (await this.ctx.storage.get("account-deletion")) return { error: "credentials" };
      const now = Date.now();
      const attempts = this.sql.exec("SELECT count, expires FROM password_attempts WHERE id = 1 AND expires > ?", now).toArray()[0];
      if (attempts?.count >= 10) return { error: "rate_limit" };
      this.sql.exec("INSERT OR REPLACE INTO password_attempts VALUES (1, ?, ?)",
        (attempts?.count ?? 0) + 1, attempts?.expires ?? now + 15 * minute);
      const currentVersion = passwordVersion(this.env);
      const key = passwordKey(this.env, record.password_key);
      if (!key || !equal(record.proof, await passwordProof(key, password, record.salt))) return { error: "credentials" };
      if (record.password_key !== currentVersion) {
        const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
        const proof = await passwordProof(passwordKey(this.env), password, salt);
        await credentials(this.env).replacePassword(emailId, salt, proof, currentVersion);
      }
      this.sql.exec("DELETE FROM password_attempts WHERE id = 1");
      return { token: await this.createSession(record.email) };
    });
  }

  async remove(username, emailId, salt) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const index = credentials(this.env);
      const record = await index.find(username);
      if (record?.email_id !== emailId || record.salt !== salt || isAdminEmail(record.email, this.env)) return false;
      await this.ctx.storage.transaction(async storage => {
        if (await storage.get("account-deletion")) return;
        const job = { username, emailId, salt, email: record.email, owner: accountScope(emailId, this.epoch()),
          devices: await storage.get("reminder-devices") ?? [], at: Date.now() + 100,
          counts: { familyRows: 0, devices: 0, operationKeys: this.sql.exec("SELECT count(*) AS n FROM family_operations").one().n } };
        this.sql.exec("DELETE FROM sessions; DELETE FROM challenge; DELETE FROM reset_challenge; DELETE FROM deliveries; DELETE FROM password_attempts; DELETE FROM family_operations;");
        this.sql.exec("INSERT OR REPLACE INTO account_reset VALUES (1, ?)", hex(crypto.getRandomValues(new Uint8Array(16))));
        await storage.delete(["care-sync", "care-zone", "reminder-devices", "reminder-update"]);
        await storage.put("account-deletion", job);
        await storage.setAlarm(job.at);
      });
      // The alarm retries if a dependency fails after access has been revoked.
      await this.finishRemoval(false);
      return true;
    });
  }

  async finishRemoval(dueOnly = true) {
    const { storage } = this.ctx;
    const job = await storage.get("account-deletion");
    if (!job || (dueOnly && job.at > Date.now())) return;
    try {
      if (!job.familyDone) {
        job.counts.familyRows += await this.env.FAMILIES?.getByName("care-groups").eraseAccount(job.owner, job.email) ?? 0;
        job.familyDone = true;
        await storage.put("account-deletion", job);
      }
      if (!job.supportDone) {
        await operations(this.env)?.eraseSupportTickets(job.email);
        job.supportDone = true;
        await storage.put("account-deletion", job);
      }
      const batch = job.devices.slice(0, 15);
      for (const device of batch) {
        await this.env.REMINDERS.getByName(device).detachAccountPlan(job.owner);
        job.counts.devices++;
        job.devices = job.devices.slice(1);
        await storage.put("account-deletion", job);
      }
      const keys = await storage.list({ prefix: "family-operation:", limit: 128 });
      job.counts.operationKeys += keys.size;
      await storage.transaction(async txn => {
        if (keys.size) await txn.delete([...keys.keys()]);
        await txn.put("account-deletion", { ...job, at: Date.now() + 250 });
      });
      if (keys.size === 128 || job.devices.length) {
        return;
      }
      await credentials(this.env).remove(job.username, job.emailId, job.salt);
      await storage.transaction(async txn => {
        await txn.put("account-deletion-summary", { ...job.counts, expires: Date.now() + day });
        await txn.delete("account-deletion");
      });
    } catch {
      await storage.put("account-deletion", { ...job, at: Date.now() + 30_000 });
    } finally {
      await this.scheduleCleanup();
    }
  }

  async removalStatus() {
    const job = await this.ctx.storage.get("account-deletion");
    if (job) return { status: "pending", ...job.counts, remainingDevices: job.devices.length, familyPending: !job.familyDone };
    const summary = await this.ctx.storage.get("account-deletion-summary");
    if (!summary) return { status: "complete" };
    const { expires, ...counts } = summary;
    return { status: "complete", ...counts };
  }

  async restoreCare(snapshot, epoch, zone, devices) {
    return this.ctx.storage.transaction(async storage => {
      const currentEpoch = this.epoch();
      const current = await storage.get("care-sync");
      const currentZone = await storage.get("care-zone");
      const registered = await storage.get("reminder-devices");
      if ((currentEpoch && currentEpoch !== epoch) || (current && JSON.stringify(current) !== JSON.stringify(snapshot))) {
        return false;
      }
      if ((zone !== undefined && currentZone && currentZone !== zone) ||
          (devices && registered && JSON.stringify(registered) !== JSON.stringify(devices))) return false;
      if (epoch) this.sql.exec("INSERT OR IGNORE INTO account_reset VALUES (1, ?)", epoch);
      if (zone) await storage.put("care-zone", zone);
      if (snapshot.records && !current) await storage.put("care-sync", snapshot);
      if (devices?.length) await storage.put("reminder-devices", devices);
      return true;
    });
  }

  async exportCare() {
    return this.ctx.storage.transaction(async storage => ({
      care: await storage.get("care-sync") ?? { revision: 0, records: null },
      epoch: this.epoch(),
      zone: await storage.get("care-zone") ?? null,
      devices: await storage.get("reminder-devices") ?? []
    }));
  }

  async exportFamilyCare(knownRevision) {
    return this.ctx.storage.transaction(async storage => {
      const care = await storage.get("care-sync") ?? { revision: 0, records: null };
      const epoch = this.epoch();
      if (knownRevision === care.revision) return { epoch, unchanged: true };
      return { epoch, care, zone: await storage.get("care-zone") };
    });
  }

  async familyIdentity(token, withName) {
    const hash = await sessionHash(token);
    const email = this.activeSessionEmail(hash);
    if (!email) return null;
    const epoch = this.epoch();
    if (!withName) return { email, epoch };
    return { email, epoch, displayName: await this.inviteProfileName() };
  }

  async inviteProfileName() {
    const snapshot = await this.ctx.storage.get("care-sync");
    return profileName(snapshot?.records?.settings?.personalProfile);
  }

  async changeFamilyCare(epoch, data, actor, label, displayName, account) {
    const entryId = crypto.randomUUID();
    return this.ctx.storage.transaction(async storage => {
      if (this.epoch() !== epoch) return { error: "forbidden" };
      const key = ["family-operation", epoch, actor, data.group, data.operation].join(":");
      const now = Date.now();
      if (this.sql.exec("SELECT 1 FROM family_operations WHERE operation=? AND expires>?", key, now).toArray().length ||
          (await storage.get(key) ?? 0) + familyReplayAge > now) return { replay: true };
      const current = await storage.get("care-sync") ?? { revision: 0, records: null };
      if (!current.records) return { error: "sync_required" };
      const zone = await storage.get("care-zone") ?? "Asia/Tehran";
      const records = applyFamilyChange(current.records, { ...data, id: data.action === "add" || data.kind === "water"
        ? entryId : data.id }, label, zone, now, displayName);
      if (typeof records === "string") return { error: records };
      try { validateCareRecords(records); } catch { return { error: "invalid" }; }
      const owner = accountScope(account, epoch);
      if (!careSnapshotFits(owner, current.revision + 1, records, zone)) {
        return { error: "care_too_large" };
      }
      await storage.put("care-sync", { revision: current.revision + 1, records });
      this.sql.exec("INSERT OR REPLACE INTO family_operations VALUES (?,?)", key, now + familyReplayAge);
      await this.queueReminderUpdate(storage, owner);
      const alarm = await storage.getAlarm();
      if (alarm === null || alarm > now + familyReplayAge) await storage.setAlarm(now + familyReplayAge);
      return { ok: true };
    });
  }

  async readCareForSession(token, owner, known, includeZone = false) {
    const hash = await sessionHash(token);
    return this.ctx.storage.transaction(async storage => {
      if (!this.activeSessionEmail(hash)) return null;
      const snapshot = await storage.get("care-sync") ?? { revision: 0, records: null };
      const epoch = this.epoch();
      if (known && known === careVersion(accountScope(owner, epoch), snapshot.revision)) return { unchanged: known };
      if (includeZone) return { epoch, revision: snapshot.revision, zone: await storage.get("care-zone") ?? null };
      return { epoch, ...snapshot };
    });
  }

  async saveCareSnapshot(revision, records, generation, token, zone, id) {
    const hash = await sessionHash(token);
    return this.ctx.storage.transaction(async storage => {
      if (!this.activeSessionEmail(hash)) return { signedOut: true };
      if (generation !== this.epoch()) return null;
      const current = await storage.get("care-sync") ?? { revision: 0 };
      if (current.revision !== revision) return null;
      if (current.records?.privacyVersion && current.records.privacyKey !== records.privacyKey) return { privacyKey: true };
      const next = { revision: revision + 1, records };
      const owner = accountScope(id, generation);
      if (!careSnapshotFits(owner, next.revision, records, zone ?? await storage.get("care-zone") ?? "Asia/Tehran")) {
        return { tooLarge: true };
      }
      await storage.put("care-sync", next);
      if (zone && !(await storage.get("care-zone"))) await storage.put("care-zone", zone);
      await this.queueReminderUpdate(storage, owner);
      return next;
    });
  }

  async setCareZone(id, epoch, revision, token, zone) {
    const hash = await sessionHash(token);
    return this.ctx.storage.transaction(async storage => {
      if (!this.activeSessionEmail(hash)) return { signedOut: true };
      if (epoch !== this.epoch()) return null;
      const snapshot = await storage.get("care-sync");
      if (revision !== (snapshot?.revision ?? 0)) return null;
      if (zone === await storage.get("care-zone")) return { zone, revision };
      await storage.put("care-zone", zone);
      if (!snapshot) return { zone, revision };
      const next = revision + 1;
      await storage.put("care-sync", { ...snapshot, revision: next });
      await this.queueReminderUpdate(storage, accountScope(id, epoch));
      return { zone, revision: next };
    });
  }

  async reminderRevision(owner, id) {
    return this.ctx.storage.transaction(async storage => {
      if (owner !== accountScope(id, this.epoch())) return null;
      return (await storage.get("care-sync"))?.revision ?? null;
    });
  }

  async reminderScope(token, id) {
    const hash = await sessionHash(token);
    return this.ctx.storage.transaction(async storage => {
      if (!this.activeSessionEmail(hash)) return null;
      const snapshot = await storage.get("care-sync");
      return snapshot?.records ? { owner: accountScope(id, this.epoch()), revision: snapshot.revision } : null;
    });
  }

  async registerReminderDevice(token, id, owner, device) {
    const hash = await sessionHash(token);
    return this.ctx.storage.transaction(async storage => {
      if (!this.activeSessionEmail(hash) || accountScope(id, this.epoch()) !== owner || !this.env.REMINDERS) return false;
      const devices = await storage.get("reminder-devices") ?? [];
      if (!devices.includes(device)) await storage.put("reminder-devices", [...devices, device]);
      await this.queueReminderUpdate(storage, owner);
      return true;
    });
  }

  async resumeReminderDevice(id, owner, device) {
    return this.ctx.storage.transaction(async storage => {
      if (accountScope(id, this.epoch()) !== owner || !(await storage.get("reminder-devices"))?.includes(device) ||
          !(await storage.get("care-sync"))?.records) return false;
      await this.queueReminderUpdate(storage, owner);
      return true;
    });
  }

  async queueReminderUpdate(storage, owner) {
    if (!(await storage.get("reminder-devices"))?.length) return;
    const at = Date.now() + 100;
    await storage.put("reminder-update", { owner, at, id: crypto.randomUUID() });
    const alarm = await storage.getAlarm();
    if (alarm === null || alarm > at) await storage.setAlarm(at);
  }

  async updateReminders() {
    const { storage } = this.ctx;
    const [job, snapshot, devices] = await storage.transaction(async txn => [
      await txn.get("reminder-update"), await txn.get("care-sync"), await txn.get("reminder-devices") ?? []
    ]);
    if (!job || !snapshot?.records || job.at > Date.now()) return;
    const projection = reminderCareProjection(snapshot.records);
    let failed = false;
    const unlinked = new Set();
    if (this.env.MEDORA_MAINTENANCE === "true" || this.env.MEDORA_PAUSE_PUSH === "true") failed = true;
    else for (let i = 0; i < devices.length; i += 3) {
      const batch = devices.slice(i, i + 3);
      const results = await Promise.allSettled(batch.map(device =>
        this.env.REMINDERS.getByName(device).replaceAccountPlan(job.owner, snapshot.revision, projection)));
      failed ||= results.some(result => result.status === "rejected");
      results.forEach((result, index) => {
        if (result.status === "fulfilled" && result.value === "unlinked") unlinked.add(batch[index]);
      });
    }
    await storage.transaction(async txn => {
      const current = await txn.get("reminder-update");
      if (current?.id !== job.id) return;
      if (unlinked.size) await txn.put("reminder-devices", devices.filter(device => !unlinked.has(device)));
      if (failed) await txn.put("reminder-update", { ...job, at: Date.now() + 30_000 });
      else await txn.delete("reminder-update");
    });
  }

  async revokeSessions(username, emailId, salt) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const record = await credentials(this.env).find(username);
      if (record?.email_id !== emailId || record.salt !== salt || isAdminEmail(record.email, this.env)) return false;
      this.sql.exec("DELETE FROM sessions");
      await this.scheduleCleanup();
      return true;
    });
  }

  async createSession(email) {
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    const hash = await sessionHash(token);
    this.ctx.storage.transactionSync(() => {
      this.sql.exec("INSERT INTO sessions VALUES (?, ?, ?)", hash, email, Date.now() + sessionAge);
      this.sql.exec("DELETE FROM sessions WHERE hash IN (SELECT hash FROM sessions ORDER BY expires DESC LIMIT -1 OFFSET 20)");
    });
    await this.scheduleCleanup();
    return token;
  }

  async session(token) {
    const hash = await sessionHash(token);
    return this.activeSessionEmail(hash);
  }

  async recentSession(token, email) {
    const hash = await sessionHash(token);
    const expires = this.sql.exec("SELECT expires FROM sessions WHERE hash = ? AND email = ?", hash, email).toArray()[0]?.expires;
    return Number.isSafeInteger(expires) && expires > Date.now() + sessionAge - adminSessionMaxAge;
  }

  activeSessionEmail(hash) {
    return this.sql.exec("SELECT email FROM sessions WHERE hash = ? AND expires > ?", hash, Date.now()).toArray()[0]?.email ?? null;
  }

  async logout(token) {
    const hash = await sessionHash(token);
    this.sql.exec("DELETE FROM sessions WHERE hash = ?", hash);
  }

  prune(now) {
    this.sql.exec("DELETE FROM deliveries WHERE sent <= ?", now - day);
    this.sql.exec("DELETE FROM challenge WHERE expires <= ?", now);
    this.sql.exec("DELETE FROM reset_challenge WHERE expires <= ?", now);
    this.sql.exec("DELETE FROM sessions WHERE expires <= ?", now);
    this.sql.exec("DELETE FROM family_operations WHERE expires <= ?", now);
  }

  async migrateLegacyFamilyOperations() {
    const { storage } = this.ctx;
    if (await storage.get("family-operations-migrated")) return;
    await storage.transaction(async txn => {
      const keys = await txn.list({ prefix: "family-operation:", limit: 100 });
      const now = Date.now();
      for (const [key, recorded] of keys) {
        const expires = recorded + familyReplayAge;
        if (Number.isSafeInteger(expires) && expires > now) {
          this.sql.exec("INSERT OR IGNORE INTO family_operations VALUES (?,?)", key, expires);
        }
      }
      if (keys.size) await txn.delete([...keys.keys()]);
      if (keys.size < 100) await txn.put("family-operations-migrated", true);
    });
  }

  async scheduleCleanup() {
    await this.ctx.storage.transaction(async storage => {
      const { next } = this.sql.exec("SELECT MIN(value) AS next FROM (SELECT sent + ? AS value FROM deliveries UNION ALL SELECT expires FROM challenge UNION ALL SELECT expires FROM reset_challenge UNION ALL SELECT expires FROM sessions UNION ALL SELECT expires FROM family_operations)", day).one();
      const job = await storage.get("reminder-update");
      const deletion = await storage.get("account-deletion");
      const summary = await storage.get("account-deletion-summary");
      const legacy = await storage.get("family-operations-migrated") ? Infinity : Date.now() + 250;
      const alarm = Math.min(next ?? Infinity, job?.at ?? Infinity, deletion?.at ?? Infinity, summary?.expires ?? Infinity, legacy);
      if (Number.isFinite(alarm)) await storage.setAlarm(alarm);
    });
  }

  async alarm() {
    this.prune(Date.now());
    if ((await this.ctx.storage.get("account-deletion-summary"))?.expires <= Date.now()) {
      await this.ctx.storage.delete("account-deletion-summary");
    }
    if (await this.ctx.storage.get("account-deletion")) {
      await this.ctx.blockConcurrencyWhile(() => this.finishRemoval());
    } else await this.migrateLegacyFamilyOperations();
    await this.updateReminders();
    await this.scheduleCleanup();
  }
}
