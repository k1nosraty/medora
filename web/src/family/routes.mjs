import { DurableObject } from "cloudflare:workers";
import { careSession, normalizeEmail } from "../accounts/email-auth.mjs";
import { smallJson } from "../http/validation.mjs";
import { familySections, sharedCare } from "../../public/medication/domain/family.js";
import { clean, idPattern } from "./care.mjs";

const oneDay = 86_400_000;
const sectionsFor = { medicine: "medicines", visit: "visits", routine: "routines", water: "water", cycle: "cycle" };
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const reply = (value, status = 200) => Response.json(value, { status, headers });
const failure = error => ({ error });

export async function handleFamily(request, env, url) {
  if (!env.FAMILIES) return reply(failure("unavailable"), 503);
  if (!["GET", "POST"].includes(request.method)) return reply(failure("method"), 405);
  if (request.method === "POST" && request.headers.get("Origin") !== url.origin) return reply(failure("forbidden"), 403);
  const session = await careSession(request, env);
  if (!session) return reply(failure("sign_in"), 401);
  const data = request.method === "POST" ? await smallJson(request, 64 * 1024) : null;
  const identity = await env.EMAIL_ACCOUNTS.getByName(session.id).familyIdentity(session.token,
    data?.action === "record" || data?.action === "add");
  if (!identity) return reply(failure("sign_in"), 401);
  const actor = { ...identity, person: session.id + (identity.epoch ? "." + identity.epoch : ""), label: session.username };
  const store = env.FAMILIES.getByName("care-groups");
  if (request.method === "GET") return reply(await store.overview(actor));
  if (!data) return reply(failure("invalid"), 400);
  let result;
  switch (data.action) {
    case "create": result = await store.create(actor, clean(data.name, 60)); break;
    case "invite": {
      const email = normalizeEmail(data.email);
      if (!email || email === actor.email || !idPattern.test(data.group)) return reply(failure("invalid"), 400);
      result = await store.invite(actor, data.group, email);
      if (result.invite && env.EMAIL_FROM && env.RESEND_API_KEY) {
        const link = new URL("/medication/#family-invite=" + result.invite, url.origin);
        try {
          const english = data.language === "en";
          const sent = await fetch("https://api.resend.com/emails", {
            method: "POST", signal: AbortSignal.timeout(8000),
            headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ from: env.EMAIL_FROM, to: [email],
              subject: english ? "Medora family invitation" : "دعوت به گروه خانوادگی مدورا",
              text: english ? `Open this link to review the invitation: ${link}` : `برای بررسی دعوت، این پیوند را باز کنید: ${link}` })
          });
          result.delivered = sent.ok;
          await sent.body?.cancel();
        } catch { result.delivered = false; }
      }
      break;
    }
    case "accept": case "decline": case "cancel":
      result = idPattern.test(data.invite) ? await store.respond(actor, data.invite, data.action) : failure("invalid");
      break;
    case "share": case "revoke":
      result = idPattern.test(data.group) && (data.target === "all" || idPattern.test(data.target))
        ? await store.share(actor, data) : failure("invalid");
      break;
    case "view": case "record": case "add":
      result = idPattern.test(data.group) && idPattern.test(data.target)
        ? await store.access(actor, data) : failure("invalid");
      break;
    default: result = failure("invalid");
  }
  const statuses = { invalid: 400, missing: 404, forbidden: 403, expired: 410, limit: 429, sync_required: 409, already_recorded: 409, conflict: 409 };
  return reply(result, result.error ? statuses[result.error] ?? 400 : 200);
}

export class Families extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS family_groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS family_members (
        id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES family_groups(id), person TEXT NOT NULL, label TEXT NOT NULL,
        UNIQUE(group_id, person));
      CREATE INDEX IF NOT EXISTS family_members_person ON family_members(person, group_id);
      CREATE TABLE IF NOT EXISTS family_invites (
        id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES family_groups(id), email TEXT NOT NULL,
        created INTEGER NOT NULL, expires INTEGER NOT NULL, status TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS family_invites_email ON family_invites(email, status, expires);
      CREATE INDEX IF NOT EXISTS family_invites_group ON family_invites(group_id, status, expires);
      CREATE TABLE IF NOT EXISTS family_grants (
        group_id TEXT NOT NULL, owner TEXT NOT NULL, recipient TEXT NOT NULL,
        policy TEXT NOT NULL, expires INTEGER, PRIMARY KEY (group_id, owner, recipient),
        FOREIGN KEY (group_id, owner) REFERENCES family_members(group_id, person),
        FOREIGN KEY (group_id, recipient) REFERENCES family_members(group_id, person));
      CREATE TABLE IF NOT EXISTS family_audit (
        id INTEGER PRIMARY KEY, group_id TEXT NOT NULL, actor TEXT NOT NULL, subject TEXT NOT NULL, action TEXT NOT NULL, time INTEGER NOT NULL);
    `);
  }

  audit(group, actor, subject, action) {
    this.sql.exec("INSERT INTO family_audit(group_id,actor,subject,action,time) VALUES(?,?,?,?,?)", group, actor, subject, action, Date.now());
  }

  member(group, person) {
    return this.sql.exec("SELECT id,label FROM family_members WHERE group_id=? AND person=?", group, person).toArray()[0];
  }

  overview(actor) {
    const now = Date.now();
    const groups = this.sql.exec(`SELECT g.id,g.name,(g.owner=?) AS manager FROM family_groups g
      JOIN family_members m ON m.group_id=g.id WHERE m.person=? ORDER BY g.name`, actor.person, actor.person).toArray();
    for (const group of groups) {
      group.members = this.sql.exec(`SELECT m.id,m.label,(m.person=?) AS self,s.policy AS given,s.expires AS givenExpires,
        r.policy AS received,r.expires AS receivedExpires FROM family_members m
        LEFT JOIN family_grants s ON s.group_id=m.group_id AND s.recipient=m.person AND s.owner=? AND (s.expires IS NULL OR s.expires>?)
        LEFT JOIN family_grants r ON r.group_id=m.group_id AND r.owner=m.person AND r.recipient=? AND (r.expires IS NULL OR r.expires>?)
        WHERE m.group_id=? ORDER BY m.label`, actor.person, actor.person, now, actor.person, now, group.id).toArray()
        .map(row => ({ ...row, given: row.given && JSON.parse(row.given), received: row.received && JSON.parse(row.received) }));
      group.pending = group.manager ? this.sql.exec(`SELECT id,email,expires FROM family_invites
        WHERE group_id=? AND status='pending' AND expires>? ORDER BY expires DESC`, group.id, now).toArray() : [];
    }
    const invitations = this.sql.exec(`SELECT i.id,i.expires,g.name,m.label AS inviter FROM family_invites i
      JOIN family_groups g ON g.id=i.group_id JOIN family_members m ON m.group_id=g.id AND m.person=g.owner
      WHERE i.email=? AND i.status='pending' AND i.expires>? ORDER BY i.expires DESC`, actor.email, now).toArray();
    return { groups, invitations, label: actor.label };
  }

  create(actor, name) {
    if (!name) return failure("invalid");
    return this.ctx.storage.transactionSync(() => {
      if (this.sql.exec("SELECT count(*) n FROM family_members WHERE person=?", actor.person).one().n >= 40) return failure("limit");
      const id = crypto.randomUUID();
      this.sql.exec("INSERT INTO family_groups VALUES(?,?,?)", id, name, actor.person);
      this.sql.exec("INSERT INTO family_members VALUES(?,?,?,?)", crypto.randomUUID(), id, actor.person, actor.label);
      this.audit(id, actor.person, actor.person, "create");
      return { group: id };
    });
  }

  invite(actor, group, email) {
    return this.ctx.storage.transactionSync(() => {
      if (!this.sql.exec("SELECT 1 FROM family_groups WHERE id=? AND owner=?", group, actor.person).toArray().length) return failure("forbidden");
      const now = Date.now();
      const existing = this.sql.exec(`SELECT 1 FROM family_invites WHERE group_id=? AND email=? AND
        status='pending' AND expires>?`, group, email, now).toArray();
      if (existing.length) return failure("conflict");
      if (this.sql.exec("SELECT count(*) n FROM family_invites WHERE group_id=? AND created>?", group, now - oneDay).one().n >= 20) return failure("limit");
      const id = crypto.randomUUID();
      this.sql.exec("INSERT INTO family_invites VALUES(?,?,?,?,?,'pending')", id, group, email, now, now + 3 * oneDay);
      this.audit(group, actor.person, actor.person, "invite");
      return { invite: id };
    });
  }

  respond(actor, invite, action) {
    return this.ctx.storage.transactionSync(() => {
      const row = this.sql.exec(`SELECT i.*,g.owner FROM family_invites i JOIN family_groups g ON g.id=i.group_id
        WHERE i.id=?`, invite).toArray()[0];
      if (!row || (action === "cancel" ? row.owner !== actor.person : row.email !== actor.email)) return failure("missing");
      if (row.status !== "pending" || row.expires <= Date.now()) return failure("expired");
      if (action === "accept") {
        if (this.member(row.group_id, actor.person)) return failure("conflict");
        if (this.sql.exec("SELECT count(*) n FROM family_members WHERE group_id=?", row.group_id).one().n >= 40 ||
            this.sql.exec("SELECT count(*) n FROM family_members WHERE person=?", actor.person).one().n >= 40) return failure("limit");
        this.sql.exec("INSERT OR IGNORE INTO family_members VALUES(?,?,?,?)", crypto.randomUUID(), row.group_id, actor.person, actor.label);
      }
      this.sql.exec("UPDATE family_invites SET status=? WHERE id=?", action === "accept" ? "accepted" : action, invite);
      this.audit(row.group_id, actor.person, actor.person, action);
      return { group: row.group_id };
    });
  }

  share(actor, data) {
    const { group, target } = data;
    if (!this.member(group, actor.person)) return failure("forbidden");
    const members = target === "all"
      ? this.sql.exec("SELECT person FROM family_members WHERE group_id=? AND person<>?", group, actor.person).toArray()
      : this.sql.exec("SELECT person FROM family_members WHERE group_id=? AND id=? AND person<>?", group, target, actor.person).toArray();
    if (!members.length) return failure("missing");
    const sections = data.all === true ? familySections : data.sections;
    let expires = data.days === null ? null : [7, 30, 90].includes(data.days) ? Date.now() + data.days * oneDay : undefined;
    if (data.days === "keep" && target !== "all") {
      expires = this.sql.exec("SELECT expires FROM family_grants WHERE group_id=? AND owner=? AND recipient=?",
        group, actor.person, members[0].person).toArray()[0]?.expires;
    }
    if (data.action === "share" && (!Array.isArray(sections) || !sections.length || !sections.every(value => familySections.includes(value)) ||
        typeof data.record !== "boolean" || typeof data.add !== "boolean" || expires === undefined)) return failure("invalid");
    return this.ctx.storage.transactionSync(() => {
      for (const { person } of members) {
        if (data.action === "revoke") {
          this.sql.exec("DELETE FROM family_grants WHERE group_id=? AND owner=? AND recipient=?", group, actor.person, person);
        } else {
          const policy = { sections: [...new Set(sections)], record: data.record, add: data.add };
          this.sql.exec("INSERT OR REPLACE INTO family_grants VALUES(?,?,?,?,?)", group, actor.person, person, JSON.stringify(policy), expires);
        }
        this.audit(group, actor.person, person, data.action);
      }
      return { ok: true };
    });
  }

  async access(actor, data) {
    // Keep the authorization decision and cross-object mutation ordered against revocation.
    return this.ctx.blockConcurrencyWhile(async () => {
      const { group, target, action } = data;
      const membership = this.member(group, actor.person);
      if (!membership) return failure("forbidden");
      const row = this.sql.exec(`SELECT m.person,m.label,g.policy FROM family_members m JOIN family_grants g
        ON g.group_id=m.group_id AND g.owner=m.person WHERE m.id=? AND m.group_id=? AND g.recipient=?
        AND (g.expires IS NULL OR g.expires>?)`, target, group, actor.person, Date.now()).toArray()[0];
      if (!row) return failure("forbidden");
      const [account, epoch = ""] = row.person.split(".");
      const owner = this.env.EMAIL_ACCOUNTS.getByName(account);
      const policy = JSON.parse(row.policy);
      if (action === "view") {
        const known = data.knownPolicy === row.policy && Number.isSafeInteger(data.knownRevision) ? data.knownRevision : null;
        const snapshot = await owner.exportFamilyCare(known);
        if (snapshot.epoch !== epoch) return failure("forbidden");
        if (snapshot.unchanged) return { unchanged: true };
        this.audit(group, actor.person, row.person, action);
        return { revision: snapshot.care.revision, label: row.label, policy, records: sharedCare(snapshot.care.records, policy.sections),
          synced: snapshot.care.records !== null, zone: snapshot.zone ?? "Asia/Tehran" };
      }
      if (!policy[action] || typeof data.kind !== "string" || !Object.hasOwn(sectionsFor, data.kind) ||
          !policy.sections.includes(sectionsFor[data.kind]) ||
          (action === "record" && data.kind === "medicine" && !policy.sections.includes("doses"))) return failure("forbidden");
      if (typeof data.operation !== "string" || !idPattern.test(data.operation) || (data.id !== undefined &&
          (typeof data.id !== "string" || !data.id || data.id.length > 512 || Object.hasOwn(Object.prototype, data.id)))) return failure("invalid");
      const result = await owner.changeFamilyCare(epoch, data, actor.person, membership.label, actor.displayName);
      if (result.error) return result;
      if (!result.replay) this.audit(group, actor.person, row.person, action + ":" + data.kind);
      return { ok: true };
    });
  }
}
