import { DurableObject } from "cloudflare:workers";
import { smallJson } from "./validation.mjs";

const cookieName = "__Host-medora_session";
const minute = 60_000;
const day = 24 * 60 * minute;
const sessionAge = 30 * day;
const encoder = new TextEncoder();
const emailPattern = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;
const sessionPattern = /^([a-f0-9]{64})\.([a-f0-9]{64})\.([a-f0-9]{64})$/;
const challengePattern = /^([a-f0-9-]{36})\.([a-f0-9]{64})$/;

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
  return Boolean(env.EMAIL_ACCOUNTS && env.EMAIL_AUTH_LIMIT && env.RESEND_API_KEY && env.EMAIL_FROM &&
    /^[a-f0-9]{64}$/i.test(env.EMAIL_AUTH_SECRET ?? ""));
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
function reply(data, status = 200, setCookie) {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (setCookie) headers["Set-Cookie"] = setCookie;
  return Response.json(data, { status, headers });
}

export async function handleEmailAuth(request, env, url) {
  const route = url.pathname.slice("/api/auth/".length);
  if (route === "session" && request.method === "GET") {
    const available = configured(env);
    const session = available ? await readSession(request, env.EMAIL_AUTH_SECRET) : null;
    const email = session ? await env.EMAIL_ACCOUNTS.getByName(session.id).session(session.token) : null;
    return reply({ available, email });
  }
  if (request.method !== "POST" || !["start", "verify", "logout"].includes(route)) return reply({ error: "not_found" }, 404);
  if (request.headers.get("Origin") !== url.origin) return reply({ error: "forbidden" }, 403);
  if (route === "logout") {
    const session = await readSession(request, env.EMAIL_AUTH_SECRET);
    if (env.EMAIL_ACCOUNTS && session) await env.EMAIL_ACCOUNTS.getByName(session.id).logout(session.token);
    return reply({}, 200, cookie("", 0));
  }
  if (!configured(env)) return reply({ error: "unavailable" }, 503);
  const ip = request.headers.get("CF-Connecting-IP") ?? "local";
  if (!(await env.EMAIL_AUTH_LIMIT.limit({ key: `${route}:${ip}` })).success) return reply({ error: "rate_limit" }, 429);

  const body = await smallJson(request, 1024);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email.length > 254 || email.split("@")[0].length > 64 || !emailPattern.test(email)) return reply({ error: "email" }, 400);
  const secret = env.EMAIL_AUTH_SECRET;
  const id = await hmac(secret, "account-v1", email);
  if (route === "start") {
    const result = await env.EMAIL_ACCOUNTS.getByName(id).start(email, body.language === "en" ? "en" : "fa");
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
  const token = await env.EMAIL_ACCOUNTS.getByName(id).verify(email, match[1], code);
  if (!token) return reply({ error: "invalid_code" }, 400);
  const value = `${id}.${token}`;
  const signature = await hmac(secret, "session-v1", value);
  return reply({ email }, 200, cookie(`${value}.${signature}`, sessionAge / 1000));
}

export class EmailAccount extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS deliveries (id TEXT PRIMARY KEY, sent INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS challenge (id TEXT PRIMARY KEY, proof TEXT NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires INTEGER NOT NULL);
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
          subject: language === "en" ? "Your Medora sign-in code" : "کد ورود به مدورا",
          text: language === "en"
            ? `Your Medora sign-in code is ${code}.\nIt expires in 10 minutes. If you didn't request a code, you can ignore this email.`
            : `کد ورود شما به مدورا: ${localized}\nاین کد تا ۱۰ دقیقه اعتبار دارد. اگر شما درخواست ورود نداده‌اید، این پیام را نادیده بگیرید.`
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

  async verify(email, challenge, code) {
    const proof = await hmac(this.env.EMAIL_AUTH_SECRET, "code-v1", `${challenge}:${code}`);
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    const hash = await sessionHash(token);
    const now = Date.now();
    const row = this.sql.exec("SELECT proof, attempts FROM challenge WHERE id = ? AND expires > ?", challenge, now).toArray()[0];
    if (!row) return null;
    if (!equal(proof, row.proof)) {
      if (row.attempts >= 4) this.sql.exec("DELETE FROM challenge WHERE id = ?", challenge);
      else this.sql.exec("UPDATE challenge SET attempts = attempts + 1 WHERE id = ?", challenge);
      return null;
    }
    this.ctx.storage.transactionSync(() => {
      this.sql.exec("DELETE FROM challenge WHERE id = ?", challenge);
      this.sql.exec("INSERT INTO sessions VALUES (?, ?, ?)", hash, email, now + sessionAge);
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
