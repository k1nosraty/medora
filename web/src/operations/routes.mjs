import { exportResponse } from "./export.mjs";
import { emptyHash } from "./backup-parts-format.mjs";
import { DurableObject } from "cloudflare:workers";
import { isAdminEmail, signedInEmail } from "../accounts/email-auth.mjs";
import { pilotConfig, smallJson } from "../http/validation.mjs";

const day = 86_400_000;
const tehranDay = () => Math.floor((Date.now() + 12_600_000) / day);
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
  if (path === "/api/operations/activity" && method === "POST") {
    if (request.headers.get("Origin") !== url.origin) return result({ error: "forbidden" }, 403);
    if (env.PROMOTION_EVENT_LIMIT && !(await env.PROMOTION_EVENT_LIMIT.limit({ key: "activity:" + (request.headers.get("CF-Connecting-IP") ?? "unknown") })).success) {
      return result({ error: "rate_limit" }, 429);
    }
    await store.count(["activity:open"]);
    return new Response(null, { status: 204 });
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
  const promotion = env.PROMOTIONS.getByName("home");
  const credentials = env.CREDENTIALS.getByName("medora-credentials-v1");
  if (path === "/api/admin/operations/export" && method === "GET") return exportResponse({ promotion, credentials, store });
  if (path !== "/api/admin/operations") return result({ error: "not_found" }, 404);
  if (method === "GET") {
    const [dashboard, promotions, accounts] = await Promise.all([store.dashboard(), promotion.getStorageSize(), credentials.getStorageSize()]);
    return result({ ...dashboard, storage: { promotions, accounts, operations: dashboard.storage }, configured: {
      push: Boolean(pilotConfig(env)), email: Boolean(env.EMAIL_FROM && env.RESEND_API_KEY),
      analytics: Boolean(env.OPERATIONS), supportAccounts: (env.SUPPORT_EMAILS ?? "").split(",").filter(entry => entry.trim()).length
    } });
  }
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

  registerReminder(id) { return this.ctx.storage.put("reminder:" + id, true); }

  async reminderIds(after, limit = 100) {
    const page = await this.ctx.storage.list({ prefix: "reminder:", limit, ...(after && { startAfter: "reminder:" + after }) });
    return [...page.keys()].map(key => key.slice(9));
  }

  async publishRelease(version) {
    if (this.env.MEDORA_PAUSE_PUSH === "true" || this.env.MEDORA_MAINTENANCE === "true") return;
    const storage = this.ctx.storage;
    const state = await storage.get("release-batch");
    if (state?.version === version) return;
    await storage.transaction(async txn => {
      if ((await txn.get("release-batch"))?.version === version) return;
      await txn.put("release-batch", { version, after: "" });
      await txn.setAlarm(Date.now() + 1000);
    });
  }

  async alarm() {
    const storage = this.ctx.storage;
    const state = await storage.get("release-batch");
    if (!state || state.done) return;
    if (this.env.MEDORA_PAUSE_PUSH === "true" || this.env.MEDORA_MAINTENANCE === "true") {
      await storage.setAlarm(Date.now() + 60_000);
      return;
    }
    const ids = await this.reminderIds(state.after, 12);
    // Keep outbound connections bounded and let failures retry via the alarm.
    for (let i = 0; i < ids.length; i += 3) {
      await Promise.all(ids.slice(i, i + 3).map(id => this.env.REMINDERS.getByName(id).sendRelease(state.version)));
    }
    await storage.transaction(async txn => {
      if ((await txn.get("release-batch"))?.version !== state.version) return;
      await txn.put("release-batch", { version: state.version, after: ids.at(-1) ?? state.after, done: ids.length < 12 });
      if (ids.length === 12) await txn.setAlarm(Date.now() + 1000);
    });
  }

  async migrationTargetEmpty() {
    const storage = this.ctx.storage;
    return !await storage.get("config") && !(await storage.list({ prefix: "reminder:", limit: 1 })).size &&
      !this.sql.exec("SELECT 1 FROM counters UNION ALL SELECT 1 FROM audit UNION ALL SELECT 1 FROM tickets LIMIT 1").toArray().length;
  }

  async claimRestore(hash, reminders) {
    return this.ctx.storage.transaction(async storage => {
      const journal = await storage.get("server-restore");
      if (journal && journal.hash !== hash) return { error: "archive_conflict" };
      if (journal?.until > Date.now()) return { error: "restore_in_progress" };
      if (journal?.done && (!reminders || journal.reminders)) return { complete: true, ...journal.result };
      const id = crypto.randomUUID();
      await storage.put("server-restore", { ...journal, hash, id, until: Date.now() + 3_600_000 });
      return { id, prepared: journal?.prepared, done: journal?.done, result: journal?.result };
    });
  }

  async prepareRestore(id) {
    await this.ctx.storage.transaction(async storage => {
      const journal = await storage.get("server-restore");
      if (journal?.id !== id) throw new Error("restore_in_progress");
      await storage.put("server-restore", { ...journal, prepared: true });
    });
  }

  async releaseRestore(id, result, reminders) {
    await this.ctx.storage.transaction(async storage => {
      const journal = await storage.get("server-restore");
      if (journal?.id !== id) throw new Error("restore_in_progress");
      if (!result && !journal.prepared) {
        await storage.delete("server-restore");
        return;
      }
      await storage.put("server-restore", { ...journal, until: 0, ...(result && { done: true, result, reminders }) });
    });
  }

  async partRestore(hash, total, phase, index) {
    return this.ctx.storage.transaction(async storage => {
      const journal = await storage.get("server-restore");
      if (journal && (journal.hash !== hash || journal.total !== total)) return { error: "archive_conflict" };
      if (phase === "reminders" && !journal?.done) return { error: "restore_data_first" };
      const next = journal?.[phase + "Index"] ?? 0;
      if (index < next) return { next };
      if (index !== next || index >= total) return { error: "part_out_of_order" };
      if (journal?.until > Date.now()) return { error: "restore_in_progress" };
      const id = crypto.randomUUID();
      await storage.put("server-restore", { ...journal, hash, total, id, until: Date.now() + 120_000 });
      return { id, prepared: journal?.prepared, chain: journal?.[phase + "Chain"] ?? emptyHash };
    });
  }

  async finishPart(id, phase, index, chain) {
    return this.ctx.storage.transaction(async storage => {
      const journal = await storage.get("server-restore");
      if (journal?.id !== id) throw new Error("restore_in_progress");
      if (!journal.prepared) {
        await storage.delete("server-restore");
        return index;
      }
      const next = index + Number(Boolean(chain));
      await storage.put("server-restore", { ...journal, until: 0, [phase + "Index"]: next,
        ...(chain && { [phase + "Chain"]: chain }),
        done: journal.done || (phase === "data" && next === journal.total) });
      return next;
    });
  }

  async restoreData(data) {
    if (!data) return;
    await this.ctx.storage.put("config", data.config);
    this.ctx.storage.transactionSync(() => {
      for (const { day, metric, count } of data.counters) this.sql.exec("INSERT OR REPLACE INTO counters VALUES (?, ?, ?)", day, metric, count);
      for (const { id, at, actor, action } of data.audit) this.sql.exec("INSERT OR IGNORE INTO audit VALUES (?, ?, ?, ?)", id, at, actor, action);
      for (const { id, email, at, message, diagnostics, reply, status } of data.tickets) {
        this.sql.exec("INSERT OR IGNORE INTO tickets VALUES (?, ?, ?, ?, ?, ?, ?)", id, email, at, message, diagnostics, reply, status);
      }
    });
  }

  async config() {
    return await this.ctx.storage.get("config") ?? { flags: { promotions: 100, support: 100 }, notice: null };
  }

  async saveConfig(config, actor) {
    await this.ctx.storage.put("config", config);
    this.audit(actor, "operations_updated");
  }

  count(metrics) {
    const date = tehranDay();
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
      storage: this.sql.databaseSize,
      activity: this.sql.exec("SELECT day, count FROM counters WHERE metric = 'activity:open' AND day >= ? ORDER BY day",
        tehranDay() - 13).toArray(),
      counters: this.sql.exec("SELECT metric, SUM(count) AS count FROM counters WHERE day >= ? GROUP BY metric",
        tehranDay() - 6).toArray(),
      audit: this.sql.exec("SELECT at, actor, action FROM audit ORDER BY id DESC LIMIT 30").toArray()
    };
  }

  async exportData() {
    return { config: await this.config(), counters: this.sql.exec("SELECT * FROM counters").toArray(),
      audit: this.sql.exec("SELECT * FROM audit").toArray(), tickets: this.sql.exec("SELECT * FROM tickets").toArray() };
  }

  async exportOperationPage(offset) {
    const config = await this.config();
    const counters = this.sql.exec("SELECT * FROM counters ORDER BY day, metric LIMIT 100 OFFSET ?", offset).toArray();
    const audit = this.sql.exec("SELECT * FROM audit ORDER BY id LIMIT 100 OFFSET ?", offset).toArray();
    const tickets = this.sql.exec("SELECT * FROM tickets ORDER BY id LIMIT 100 OFFSET ?", offset).toArray();
    return { operations: { config, counters, audit, tickets }, complete: [counters, audit, tickets].every(rows => rows.length < 100) };
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
