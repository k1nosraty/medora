import { accountEmail } from "@medora/contracts";
import type { Pool, PoolClient } from "pg";
import type { HouseholdCommand } from "@medora/contracts";
import {
  groupIcons,
  groupIconOf,
} from "../../web/product-assets/public/medication/domain/group-icons.js";
import {
  allFamilySections,
  familySections,
} from "../../web/product-assets/public/medication/domain/family.js";
import { Denied, deny, audit, delegated } from "./household-access";
const validPolicy = (sections: string[] | undefined): sections is string[] =>
  Boolean(
    sections?.length && sections.every((v) => familySections.includes(v)),
  );
const active =
  "(expires_ms IS NULL OR expires_ms > extract(epoch FROM now())*1000)";
const policy = (alias: string) =>
  `CASE WHEN ${alias}.viewer IS NOT NULL THEN jsonb_build_object('sections',${alias}.sections,'record',${alias}.can_record,'add',${alias}.can_add) END`;
export function householdService(pool: Pool) {
  async function home(who: string, inbox: boolean) {
    const invitations = await pool.query(
      `SELECT i.id,f.label AS name,coalesce(inviter.label,a.username) AS inviter,
      (extract(epoch FROM i.expires_at)*1000)::float8 AS expires FROM medora.family_invites i
      JOIN medora.accounts r ON r.email=i.email JOIN medora.families f ON f.id=i.family JOIN medora.accounts a ON a.id=f.creator JOIN medora.family_members inviter ON inviter.family=f.id AND inviter.person=f.creator
      WHERE r.id=$1 AND status='pending' AND i.expires_at>now() ORDER BY i.expires_at DESC`,
      [who],
    );
    if (inbox) return { invitations: invitations.rows };
    const groups = await pool.query(
      `SELECT f.id,f.label AS name,f.icon,f.creator=$1 AS manager,
      (SELECT jsonb_agg(jsonb_build_object('id',m.public_id,'label',coalesce(m.label,a.username),'self',m.person=$1,
        'given',${policy("g")},'received',${policy("r")},'givenExpires',g.expires_ms,'receivedExpires',r.expires_ms) ORDER BY coalesce(m.label,a.username))
      FROM medora.family_members m JOIN medora.accounts a ON a.id=m.person
      LEFT JOIN medora.water_grants g ON g.family=f.id AND g.owner=$1 AND g.viewer=m.person AND ${active.replaceAll("expires_ms", "g.expires_ms")}
      LEFT JOIN medora.water_grants r ON r.family=f.id AND r.viewer=$1 AND r.owner=m.person AND ${active.replaceAll("expires_ms", "r.expires_ms")}
      WHERE m.family=f.id) AS members, CASE WHEN f.creator=$1 THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,
      'recipient',coalesce(i.recipient_label,i.email),'expires',extract(epoch FROM i.expires_at)*1000) ORDER BY i.expires_at DESC)
      FROM medora.family_invites i WHERE i.family=f.id AND i.status='pending' AND i.expires_at>now()),'[]') ELSE '[]'::jsonb END AS pending
      FROM medora.family_members mine JOIN medora.families f ON f.id=mine.family WHERE mine.person=$1 ORDER BY f.label,f.id`,
      [who],
    );
    const {
      rows: [me],
    } = await pool.query("SELECT username FROM medora.accounts WHERE id=$1", [
      who,
    ]);
    return {
      groups: groups.rows,
      invitations: invitations.rows,
      label: me.username,
    };
  }
  async function execute(c: PoolClient, who: string, d: HouseholdCommand) {
    if (d.action === "create") {
      if (!d.name) return deny("invalid");
      const activeAccount = await c.query(
        "SELECT id FROM medora.accounts WHERE id=$1 AND sync_generation=2 FOR UPDATE",
        [who],
      );
      if (!activeAccount.rowCount) return deny("forbidden");
      if (
        (
          await c.query(
            "SELECT 1 FROM medora.family_members WHERE person=$1 LIMIT 40",
            [who],
          )
        ).rowCount === 40
      )
        return deny("limit");
      const group = crypto.randomUUID();
      await c.query(
        "INSERT INTO medora.families(id,label,creator,icon) VALUES($1,$2,$3,$4)",
        [group, d.name, who, groupIconOf(d.icon)],
      );
      await c.query(
        "INSERT INTO medora.family_members(family,person) VALUES($1,$2)",
        [group, who],
      );
      await audit(c, group, who, "create");
      return { group };
    }
    if (["accept", "decline", "cancel"].includes(d.action)) {
      if (!d.invite) return deny("invalid");
      const {
        rows: [invite],
      } = await c.query(
        `SELECT i.id,i.family,i.status='pending' AND i.expires_at>now() AS active FROM medora.family_invites i JOIN medora.families f ON f.id=i.family
        JOIN medora.accounts a ON a.id=$2 WHERE i.id=$1
        AND (CASE WHEN $3='cancel' THEN f.creator=a.id ELSE i.email=a.email END) FOR UPDATE OF f,i`,
        [d.invite, who, d.action],
      );
      if (!invite) return deny("missing");
      if (!invite.active) return deny("expired");
      if (d.action === "accept") {
        const activeAccount = await c.query(
          "SELECT id FROM medora.accounts WHERE id=$1 AND sync_generation=2 FOR UPDATE",
          [who],
        );
        if (!activeAccount.rowCount) return deny("forbidden");
        const membershipCount = await c.query(
          "SELECT 1 FROM medora.family_members WHERE person=$1 LIMIT 40",
          [who],
        );
        const members = await c.query(
          "SELECT person FROM medora.family_members WHERE family=$1",
          [invite.family],
        );
        if (members.rows.some((m) => m.person === who)) return deny("conflict");
        if (membershipCount.rowCount === 40 || (members.rowCount ?? 0) >= 40)
          return deny("limit");
        await c.query(
          "INSERT INTO medora.family_members(family,person) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [invite.family, who],
        );
      }
      await c.query("UPDATE medora.family_invites SET status=$2 WHERE id=$1", [
        d.invite,
        d.action === "accept" ? "accepted" : d.action,
      ]);
      await audit(c, invite.family, who, d.action);
      return { group: invite.family };
    }
    if (!d.group) return deny("invalid");
    const {
      rows: [member],
    } = await c.query(
      `SELECT f.creator,m.public_id,coalesce(m.label,a.username) AS label,
      a.email FROM medora.families f JOIN medora.family_members m ON m.family=f.id JOIN medora.accounts a ON a.id=m.person
      WHERE f.id=$1 AND m.person=$2 FOR UPDATE OF f`,
      [d.group, who],
    );
    if (!member) return deny("forbidden");
    if (["view", "add", "record"].includes(d.action)) {
      if (!d.target || d.target === "all") return deny("invalid");
      return delegated(c, who, member, d);
    }
    if (d.action === "share" || d.action === "revoke") {
      if (!d.target) return deny("invalid");
      const sections = d.all ? allFamilySections : d.sections;
      if (
        d.action === "share" &&
        (!validPolicy(sections) ||
          d.record === undefined ||
          d.add === undefined ||
          d.days === undefined ||
          (d.days === "keep" && d.target === "all"))
      )
        return deny("invalid");
      const target = await c.query(
        `SELECT person FROM medora.family_members WHERE family=$1 AND person<>$2 AND
        ($3='all' OR public_id::text=$3)`,
        [d.group, who, d.target],
      );
      if (!target.rowCount) return deny("missing");
      for (const { person } of target.rows) {
        if (d.action === "revoke")
          await c.query(
            "DELETE FROM medora.water_grants WHERE family=$1 AND owner=$2 AND viewer=$3",
            [d.group, who, person],
          );
        else {
          const expires =
            d.days === "keep"
              ? (
                  await c.query(
                    "SELECT expires_ms FROM medora.water_grants WHERE family=$1 AND owner=$2 AND viewer=$3",
                    [d.group, who, person],
                  )
                ).rows[0]?.expires_ms
              : d.days
                ? Date.now() + d.days * 86400000
                : null;
          if (expires === undefined) return deny("invalid");
          await c.query(
            `INSERT INTO medora.water_grants(family,owner,viewer,sections,can_record,can_add,expires_ms) VALUES($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT(family,owner,viewer) DO UPDATE SET sections=excluded.sections,can_record=excluded.can_record,can_add=excluded.can_add,expires_ms=excluded.expires_ms`,
            [
              d.group,
              who,
              person,
              [...new Set(sections)],
              d.record,
              d.add,
              expires,
            ],
          );
        }
      }
      await audit(c, d.group, who, d.action);
      return { ok: true };
    }
    if (member.creator !== who) return deny("forbidden");
    if (d.action === "invite-lookup") {
      const query = d.query?.replace(/^@(?=[a-z0-9_]+$)/i, "");
      return query &&
        (/^[a-z0-9_]{3,32}$/i.test(query) ||
          accountEmail.safeParse(query).success)
        ? { person: null }
        : deny("invalid");
    }
    if (d.action === "invite") {
      if (!d.email || d.email === member.email) return deny("invalid");
      const existing = await c.query(
        "SELECT 1 FROM medora.family_invites WHERE family=$1 AND email=$2 AND status='pending' AND expires_at>now()",
        [d.group, d.email],
      );
      if (existing.rowCount) return deny("conflict");
      const recent = await c.query(
        "SELECT 1 FROM medora.family_invites WHERE family=$1 AND created_at>now()-interval '1 day' LIMIT 20",
        [d.group],
      );
      if (recent.rowCount === 20) return deny("limit");
      const id = crypto.randomUUID();
      await c.query(
        "INSERT INTO medora.family_invites(id,family,email,expires_at) VALUES($1,$2,$3,now()+interval '3 days')",
        [id, d.group, d.email],
      );
      await audit(c, d.group, who, "invite");
      return { invite: id };
    }
    if (
      d.action === "update-group" &&
      d.name &&
      d.icon &&
      Object.hasOwn(groupIcons, d.icon)
    ) {
      await c.query("UPDATE medora.families SET label=$2,icon=$3 WHERE id=$1", [
        d.group,
        d.name,
        d.icon,
      ]);
      await audit(c, d.group, who, d.action);
      return { group: d.group };
    }
    if (d.action === "delete-group") {
      for (const table of ["water_grants", "family_invites", "family_members"])
        await c.query("DELETE FROM medora." + table + " WHERE family=$1", [
          d.group,
        ]);
      await audit(c, d.group, who, d.action);
      await c.query("DELETE FROM medora.families WHERE id=$1", [d.group]);
      return { ok: true };
    }
    return deny("invalid");
  }
  return {
    home,
    async command(who: string, d: HouseholdCommand) {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const r = await execute(c, who, d);
        await c.query("COMMIT");
        return r;
      } catch (e) {
        await c.query("ROLLBACK");
        if (e instanceof Denied) return { error: e.code };
        throw e;
      } finally {
        c.release();
      }
    },
  };
}
