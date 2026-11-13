import { DurableObject } from "cloudflare:workers";
import { isAdminEmail, signedInEmail } from "../accounts/email-auth.mjs";
import { pilotConfig, smallJson } from "../http/validation.mjs";

const day = 86_400_000;
const result = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const clean = (value, max) => typeof value === "string" && value.trim().length <= max ? value.trim() : "";
const flagNames = ["promotions", "support"];
export const operations = env => env.OPERATIONS?.getByName("operations");

export function logOperation(env, actor, action) {
  return operations(env)?.audit(actor, action).catch(() => {});
}

export async function handleOperations(request, env, url, ctx) {
  const store = operations(env);
  if (!store) return result({ error: "unavailable" }, 503);
  const { pathname: path } = url;
  const method = request.method;
  const cacheKey = new Request(new URL("/api/operations", url.origin));
  if (path === "/api/operations" && method === "GET") {
    const cached = await caches.default.match(cacheKey);
    if (cached) return cached;
    const config = await store.config();
    const notice = config.notice;
    const now = Date.now();
    const times = notice?.enabled ? [notice.start, notice.end].filter(time => time > now) : [];
    const ttl = Math.min(15, Math.floor((Math.min(...times) - now) / 1000));
    const response = Response.json({ flags: config.flags, notice: notice?.enabled &&
      (notice.start == null || now >= notice.start) && (notice.end == null || now < notice.end) ? notice : null },
    { headers: { "Cache-Control": `public, max-age=${ttl}` } });
    if (ttl > 0) ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
    return response;
  }
  if (!["GET", "POST", "PUT"].includes(method)) return result({ error: "method" }, 405);
  if (method !== "GET" && request.headers.get("Origin") !== url.origin) return result({ error: "forbidden" }, 403);
  const email = await signedInEmail(request, env);
  if (!email) return result({ error: "sign_in" }, 401);
  if (path === "/api/support") {
    if (method === "GET") return result({ tickets: await store.tickets(email) });
    if (method !== "POST") return result({ error: "method" }, 405);
    if ((await store.config()).flags.support === 0) return result({ error: "unavailable" }, 503);
    const body = await smallJson(request, 4096);
    const message = clean(body?.message, 1000);
    if (!message) return result({ error: "bad_request" }, 400);
    const details = body.diagnostics;
    const diagnostics = details && {
      version: clean(details.version, 64),
      platform: ["iOS", "Android", "Other"].includes(details.platform) ? details.platform : "Other",
      permission: ["granted", "denied", "default", "unavailable"].includes(details.permission) ? details.permission : "unavailable"
    };
    const ticket = await store.addTicket(email, message, diagnostics ?? null);
    return ticket ? result({ ticket }, 201) : result({ error: "ticket_limit" }, 409);
  }
  const admin = isAdminEmail(email, env);
  const support = (env.SUPPORT_EMAILS ?? "").toLowerCase().split(",").map(value => value.trim()).includes(email);
  if (!admin && !support) return result({ error: "forbidden" }, 403);
  if (path === "/api/admin/operations/access" && method === "GET") return result({ role: admin ? "admin" : "support" });
  if (path === "/api/admin/operations/tickets") {
    if (method === "GET") return result({ tickets: await store.tickets(), role: admin ? "admin" : "support" });
    if (method !== "PUT") return result({ error: "method" }, 405);
    const body = await smallJson(request, 4096);
    const reply = clean(body?.reply, 1000);
    if (typeof body?.id !== "string" || !/^[a-f0-9-]{36}$/.test(body.id) ||
        !["open", "closed"].includes(body.status) || (body.reply && !reply)) return result({ error: "bad_request" }, 400);
    return await store.replyTicket(body.id, reply, body.status, email) ? result({}) : result({ error: "ticket_missing" }, 409);
  }
  if (!admin) return result({ error: "forbidden" }, 403);
  if (method === "GET") return result({ ...await store.dashboard(), configured: {
    push: Boolean(pilotConfig(env)), email: Boolean(env.EMAIL_FROM && env.RESEND_API_KEY),
    analytics: Boolean(env.OPERATIONS), supportAccounts: (env.SUPPORT_EMAILS ?? "").split(",").filter(entry => entry.trim()).length
  } });
  if (method !== "PUT") return result({ error: "method" }, 405);
  const body = await smallJson(request, 4096);
  const source = body?.notice;
  const title = clean(source?.title, 80);
  const message = clean(source?.message, 240);
  if (typeof source?.enabled !== "boolean" || (source.enabled && (!title || !message)) ||
      ![source.start, source.end].every(time => time === null || (Number.isSafeInteger(time) && time > 0)) ||
      (source.start != null && source.end != null && source.start >= source.end) ||
      !flagNames.every(key => Number.isInteger(body.flags?.[key]) && body.flags[key] >= 0 && body.flags[key] <= 100)) {
    return result({ error: "bad_request" }, 400);
  }
  const flags = Object.fromEntries(flagNames.map(key => [key, body.flags[key]]));
  await store.saveConfig({ notice: { title, message, enabled: source.enabled, start: source.start, end: source.end }, flags }, email);
  ctx.waitUntil(caches.default.delete(cacheKey));
  return result({});
}

export class Operations extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS counters (day INTEGER, metric TEXT, count INTEGER, PRIMARY KEY(day, metric));
      CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, actor TEXT, action TEXT);
      CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, email TEXT, at INTEGER, message TEXT, diagnostics TEXT, reply TEXT, status TEXT);
      CREATE INDEX IF NOT EXISTS tickets_email ON tickets(email, at);`);
  }

  async config() {
    return await this.ctx.storage.get("config") ?? { flags: { promotions: 100, support: 100 }, notice: null };
  }

  async saveConfig(config, actor) {
    await this.ctx.storage.put("config", config);
    this.audit(actor, "operations_updated");
  }

  count(metrics) {
    const date = Math.floor(Date.now() / day);
    for (const metric of metrics) this.sql.exec(`INSERT INTO counters VALUES (?, ?, 1)
      ON CONFLICT(day, metric) DO UPDATE SET count = count + 1`, date, metric);
    this.sql.exec("DELETE FROM counters WHERE day < ?", date - 30);
  }

  audit(actor, action) {
    this.sql.exec("INSERT INTO audit(at, actor, action) VALUES (?, ?, ?)", Date.now(), actor, action);
    this.sql.exec("DELETE FROM audit WHERE id <= (SELECT MAX(id) - 200 FROM audit)");
  }

  async dashboard() {
    return {
      ...await this.config(),
      counters: this.sql.exec("SELECT metric, SUM(count) AS count FROM counters WHERE day >= ? GROUP BY metric",
        Math.floor(Date.now() / day) - 6).toArray(),
      audit: this.sql.exec("SELECT at, actor, action FROM audit ORDER BY id DESC LIMIT 30").toArray()
    };
  }

  tickets(email) {
    return email ? this.sql.exec("SELECT id, at, message, reply, status FROM tickets WHERE email = ? ORDER BY at DESC LIMIT 30", email).toArray()
      : this.sql.exec("SELECT * FROM tickets ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, at DESC LIMIT 100").toArray();
  }

  addTicket(email, message, diagnostics) {
    const now = Date.now();
    if (this.sql.exec("SELECT COUNT(*) AS count FROM tickets WHERE email = ? AND at >= ?", email, now - day).one().count >= 5) return null;
    this.sql.exec("DELETE FROM tickets WHERE status = 'closed' AND at < ?", now - 90 * day);
    if (this.sql.exec("SELECT COUNT(*) AS count FROM tickets").one().count >= 2000) return null;
    const id = crypto.randomUUID();
    this.sql.exec("INSERT INTO tickets VALUES (?, ?, ?, ?, ?, '', 'open')", id, email, now, message, JSON.stringify(diagnostics));
    return { id, at: now, message, reply: "", status: "open" };
  }

  replyTicket(id, reply, status, actor) {
    const updated = this.sql.exec("UPDATE tickets SET reply = ?, status = ? WHERE id = ? RETURNING id", reply, status, id).toArray().length > 0;
    if (updated) this.audit(actor, "ticket_updated");
    return updated;
  }
}
