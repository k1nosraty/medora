import { DurableObject } from "cloudflare:workers";
import { scryptSync } from "node:crypto";
import { smallJson } from "./validation.mjs";

const cookieName = "__Host-medora_session";
const minute = 60_000;
const day = 24 * 60 * minute;
const sessionAge = 30 * day;
const encoder = new TextEncoder();
const emailPattern = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;
const sessionPattern = /^([a-f0-9]{64})\.([a-f0-9]{64})\.([a-f0-9]{64})$/;
const challengePattern = /^([a-f0-9-]{36})\.([a-f0-9]{64})$/;
const grantPattern = /^(\d{13})(?:\.([a-f0-9]{32}))?\.([a-f0-9]{64})$/;
const usernamePattern = /^[a-z0-9_]{3,32}$/;
const authRoutes = ["register-code", "confirm-email", "register", "login", "logout"];

function hex(bytes) {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}
async function hmac(secret, purpose, value) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(`${purpose}:${value}`)));
}
async function sessionHash(token) {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(token)));
}
const equal = (left, right) => crypto.subtle.timingSafeEqual(encoder.encode(left), encoder.encode(right));
function randomCode() {
  const value = new Uint32Array(1);
  do crypto.getRandomValues(value); while (value[0] >= 4_294_000_000);
  return String(value[0] % 1_000_000).padStart(6, "0");
}
function configured(env) {
  return Boolean(env.EMAIL_ACCOUNTS && env.CREDENTIALS && env.EMAIL_AUTH_LIMIT &&
    /^[a-f0-9]{64}$/i.test(env.EMAIL_AUTH_SECRET ?? ""));
}
function canSendCode(env) {
  return Boolean(configured(env) && env.RESEND_API_KEY && env.EMAIL_FROM);
}
function normalizeEmail(email) {
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
const accountId = (env, email) => hmac(env.EMAIL_AUTH_SECRET, "account-v1", email);
const credentials = env => env.CREDENTIALS.getByName("medora-credentials-v1");
async function passwordProof(secret, password, salt) {
  const peppered = await hmac(secret, "password-v1", password);
  return hex(scryptSync(peppered, salt, 32, { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 }));
}
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
  const session = await readSession(request, env.EMAIL_AUTH_SECRET);
  return session ? env.EMAIL_ACCOUNTS.getByName(session.id).session(session.token) : null;
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

const deletionTag = (env, record) => hmac(env.EMAIL_AUTH_SECRET, "delete-account-v1", `${record.email_id}:${record.salt}`);

export async function handleAdminAccounts(request, env, url) {
  if (!["GET", "DELETE"].includes(request.method)) return reply({ error: "method" }, 405);
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
      tag: await deletionTag(env, record)
    })));
    return reply({ users, next: records.length > 25 ? users.at(-1).username : null });
  }
  if (request.headers.get("Origin") !== url.origin) return reply({ error: "forbidden" }, 403);
  const body = await smallJson(request, 4096);
  const username = usernameOf(body?.username);
  if (!username || typeof body.tag !== "string" || !/^[a-f0-9]{64}$/.test(body.tag)) {
    return reply({ error: "bad_request" }, 400);
  }
  const record = await index.find(username);
  if (!record || !equal(body.tag, await deletionTag(env, record))) return reply({ error: "account_changed" }, 409);
  if (isAdminEmail(record.email, env)) return reply({ error: "protected_account" }, 409);
  const removed = await env.EMAIL_ACCOUNTS.getByName(record.email_id).remove(username, record.email_id, record.salt);
  return removed ? reply({}) : reply({ error: "account_changed" }, 409);
}

export async function handleEmailAuth(request, env, url) {
  const route = url.pathname.slice("/api/auth/".length);
  if (route === "session" && request.method === "GET") {
    const email = await signedInEmail(request, env);
    const username = email ? await credentials(env).usernameFor(await accountId(env, email)) : null;
    return reply({ available: configured(env), registrationAvailable: canSendCode(env), ...account(email, env, username) });
  }
  if (request.method !== "POST" || !authRoutes.includes(route)) return reply({ error: "not_found" }, 404);
  if (request.headers.get("Origin") !== url.origin) return reply({ error: "forbidden" }, 403);
  if (route === "logout") {
    const session = await readSession(request, env.EMAIL_AUTH_SECRET);
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
    if (!record) return reply({ error: "credentials" }, 401);
    const client = env.EMAIL_ACCOUNTS.getByName(record.email_id);
    const result = await client.login(username, record.email_id, body.password);
    if (!result.token) return reply({ error: result.error }, result.error === "rate_limit" ? 429 : 401);
    return signedIn(env, record.email, username, record.email_id, result.token);
  }
  if (route === "register") {
    const username = usernameOf(body?.username);
    if (!username) return reply({ error: "username" }, 400);
    if (!validPassword(body?.password)) return reply({ error: "password" }, 400);
    const session = body?.grant ? null : await readSession(request, env.EMAIL_AUTH_SECRET);
    const email = body?.grant ? normalizeEmail(body.email) :
      session && await env.EMAIL_ACCOUNTS.getByName(session.id).session(session.token);
    if (!email) return reply({ error: "setup_expired" }, 401);
    const id = await accountId(env, email);
    const grant = body.grant ? await readGrant(env, id, body.grant) : null;
    if (body.grant && !grant) return reply({ error: "setup_expired" }, 401);
    const client = env.EMAIL_ACCOUNTS.getByName(id);
    const result = await client.register(username, id, email, body.password, grant, session?.token);
    if (result.error) return reply({ error: result.error }, result.error === "setup_expired" ? 401 : 409);
    return signedIn(env, email, username, id, result.token);
  }
  const email = normalizeEmail(body?.email);
  if (!email) return reply({ error: "email" }, 400);
  const secret = env.EMAIL_AUTH_SECRET;
  const id = await accountId(env, email);
  if (route === "register-code") {
    if (!canSendCode(env)) return reply({ error: "unavailable" }, 503);
    const result = await index.usernameFor(id) ? { challenge: crypto.randomUUID() } :
      await env.EMAIL_ACCOUNTS.getByName(id).start(email, body.language === "en" ? "en" : "fa");
    if (result.error) return reply(result, result.error === "rate_limit" ? 429 : 503);
    const signature = await hmac(secret, "challenge-v1", `${id}.${result.challenge}`);
    return reply({ challenge: `${result.challenge}.${signature}` }, 202);
  }
  const { code } = body;
  const match = typeof body.challenge === "string" && body.challenge.match(challengePattern);
  if (typeof code !== "string" || !/^\d{6}$/.test(code) || !match ||
      !equal(match[2], await hmac(secret, "challenge-v1", `${id}.${match[1]}`))) {
    return reply({ error: "invalid_code" }, 400);
  }
  const grant = await env.EMAIL_ACCOUNTS.getByName(id).confirmCode(match[1], code);
  if (!grant) return reply({ error: "invalid_code" }, 400);
  const value = grant.epoch ? `${grant.expires}.${grant.epoch}` : String(grant.expires);
  const signature = await hmac(secret, "enrollment-v1", `${id}.${value}`);
  return reply({ grant: `${value}.${signature}` });
}

async function readGrant(env, id, value) {
  const match = typeof value === "string" && value.match(grantPattern);
  if (!match || Number(match[1]) <= Date.now()) return null;
  const proof = value.slice(0, value.lastIndexOf("."));
  if (!equal(match[3], await hmac(env.EMAIL_AUTH_SECRET, "enrollment-v1", `${id}.${proof}`))) return null;
  return { expires: Number(match[1]), epoch: match[2] ?? "" };
}

async function signedIn(env, email, username, id, token) {
  const value = `${id}.${token}`;
  const signature = await hmac(env.EMAIL_AUTH_SECRET, "session-v1", value);
  return reply(account(email, env, username), 200, cookie(`${value}.${signature}`, sessionAge / 1000));
}

export class EmailAccount extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS deliveries (id TEXT PRIMARY KEY, sent INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS challenge (id TEXT PRIMARY KEY, proof TEXT NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS password_attempts (id INTEGER PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS account_reset (id INTEGER PRIMARY KEY, epoch TEXT NOT NULL);
    `);
  }

  async start(email, language) {
    const id = crypto.randomUUID();
    const code = randomCode();
    const proof = await hmac(this.env.EMAIL_AUTH_SECRET, "code-v1", `${id}:${code}`);
    const now = Date.now();
    this.prune(now);
    const recent = this.sql.exec("SELECT sent FROM deliveries ORDER BY sent DESC").toArray();
    if (recent.length >= 5 || now - (recent[0]?.sent ?? 0) < minute) return { error: "rate_limit" };
    this.ctx.storage.transactionSync(() => {
      this.sql.exec("INSERT INTO deliveries VALUES (?, ?)", id, now);
      this.sql.exec("DELETE FROM challenge");
      this.sql.exec("INSERT INTO challenge (id, proof, expires) VALUES (?, ?, ?)", id, proof, now + 10 * minute);
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
          subject: language === "en" ? "Verify your email for Medora" : "تأیید ایمیل برای مدورا",
          text: language === "en"
            ? `Your Medora email verification code is ${code}.\nIt expires in 10 minutes. If you didn't request a code, you can ignore this email.`
            : `کد تأیید ایمیل شما در مدورا: ${localized}\nاین کد تا ۱۰ دقیقه اعتبار دارد. اگر شما درخواست کد نداده‌اید، این پیام را نادیده بگیرید.`
        })
      });
      if (response.ok) return { challenge: id };
      await response.body?.cancel();
    } catch {
      // Treat delivery failures the same as a provider error.
    }
    this.sql.exec("DELETE FROM challenge WHERE id = ?", id);
    return { error: "delivery" };
  }

  async confirmCode(challenge, code) {
    const proof = await hmac(this.env.EMAIL_AUTH_SECRET, "code-v1", `${challenge}:${code}`);
    const row = this.sql.exec("SELECT proof, attempts FROM challenge WHERE id = ? AND expires > ?", challenge, Date.now()).toArray()[0];
    if (!row) return false;
    if (!equal(proof, row.proof)) {
      if (row.attempts >= 4) this.sql.exec("DELETE FROM challenge WHERE id = ?", challenge);
      else this.sql.exec("UPDATE challenge SET attempts = attempts + 1 WHERE id = ?", challenge);
      return false;
    }
    this.sql.exec("DELETE FROM challenge WHERE id = ?", challenge);
    return { expires: Date.now() + 10 * minute, epoch: this.epoch() };
  }

  epoch() {
    return this.sql.exec("SELECT epoch FROM account_reset WHERE id = 1").toArray()[0]?.epoch ?? "";
  }

  async register(username, id, email, password, grant, sessionToken) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const verified = grant ? grant.epoch === this.epoch() && grant.expires > Date.now() :
        sessionToken && await this.session(sessionToken) === email;
      if (!verified) return { error: "setup_expired" };
      const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
      const proof = await passwordProof(this.env.EMAIL_AUTH_SECRET, password, salt);
      const error = await credentials(this.env).register(username, id, email, salt, proof);
      return error ? { error } : { token: await this.createSession(email) };
    });
  }

  async login(username, emailId, password) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const record = await credentials(this.env).find(username);
      if (record?.email_id !== emailId) return { error: "credentials" };
      const now = Date.now();
      const attempts = this.sql.exec("SELECT count, expires FROM password_attempts WHERE id = 1 AND expires > ?", now).toArray()[0];
      if (attempts?.count >= 10) return { error: "rate_limit" };
      this.sql.exec("INSERT OR REPLACE INTO password_attempts VALUES (1, ?, ?)",
        (attempts?.count ?? 0) + 1, attempts?.expires ?? now + 15 * minute);
      if (!equal(record.proof, await passwordProof(this.env.EMAIL_AUTH_SECRET, password, record.salt))) return { error: "credentials" };
      this.sql.exec("DELETE FROM password_attempts WHERE id = 1");
      return { token: await this.createSession(record.email) };
    });
  }

  async remove(username, emailId, salt) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const index = credentials(this.env);
      const record = await index.find(username);
      if (record?.email_id !== emailId || record.salt !== salt || isAdminEmail(record.email, this.env)) return false;
      this.ctx.storage.transactionSync(() => {
        this.sql.exec("DELETE FROM sessions; DELETE FROM challenge; DELETE FROM deliveries; DELETE FROM password_attempts;");
        this.sql.exec("INSERT OR REPLACE INTO account_reset VALUES (1, ?)", hex(crypto.getRandomValues(new Uint8Array(16))));
      });
      await this.ctx.storage.deleteAlarm();
      return index.remove(username, emailId, salt);
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
    return this.sql.exec("SELECT email FROM sessions WHERE hash = ? AND expires > ?", hash, Date.now()).toArray()[0]?.email ?? null;
  }

  async logout(token) {
    const hash = await sessionHash(token);
    this.sql.exec("DELETE FROM sessions WHERE hash = ?", hash);
  }

  prune(now) {
    this.sql.exec("DELETE FROM deliveries WHERE sent <= ?", now - day);
    this.sql.exec("DELETE FROM challenge WHERE expires <= ?", now);
    this.sql.exec("DELETE FROM sessions WHERE expires <= ?", now);
  }

  async scheduleCleanup() {
    const { next } = this.sql.exec("SELECT MIN(value) AS next FROM (SELECT sent + ? AS value FROM deliveries UNION ALL SELECT expires FROM challenge UNION ALL SELECT expires FROM sessions)", day).one();
    if (next !== null) await this.ctx.storage.setAlarm(next);
  }

  async alarm() {
    this.prune(Date.now());
    await this.scheduleCleanup();
  }
}
