import type { Pool } from "pg";
import { householdService } from "./household";
export function familyService(pool: Pool) {
  const household = householdService(pool);
  const audit =
    "INSERT INTO medora.access_audit(family,actor,action) VALUES($1,$2,$3)";
  return {
    async home(person: string) {
      const groups = await pool.query(
        `SELECT f.id,f.label,(f.creator=$1) AS manager,
    (SELECT jsonb_agg(jsonb_build_object('id',m.person,'name',a.username,'self',m.person=$1,
    'shared',EXISTS(SELECT 1 FROM medora.water_grants g WHERE g.family=f.id AND g.owner=$1 AND g.viewer=m.person AND 'water'=ANY(g.sections) AND (g.expires_ms IS NULL OR g.expires_ms>extract(epoch FROM now())*1000)),
    'canRead',EXISTS(SELECT 1 FROM medora.water_grants g WHERE g.family=f.id AND g.viewer=$1 AND g.owner=m.person AND 'water'=ANY(g.sections) AND (g.expires_ms IS NULL OR g.expires_ms>extract(epoch FROM now())*1000))) ORDER BY a.username)
    FROM medora.family_members m JOIN medora.accounts a ON a.id=m.person WHERE m.family=f.id) AS members
    FROM medora.family_members mine JOIN medora.families f ON f.id=mine.family WHERE mine.person=$1 ORDER BY f.id`,
        [person],
      );
      const invitations = await pool.query(
        `SELECT i.id,f.label FROM medora.family_invites i JOIN medora.families f ON f.id=i.family
     JOIN medora.accounts a ON a.email=i.email WHERE a.id=$1 AND i.expires_at>now() AND i.status='pending' ORDER BY i.id`,
        [person],
      );
      return { groups: groups.rows, invitations: invitations.rows };
    },
    async create(person: string, name: string) {
      const result = await household.command(person, {
        action: "create",
        name,
      });
      return "group" in result && result.group;
    },
    async invite(person: string, family: string, email: string) {
      const result = await household.command(person, {
        action: "invite",
        group: family,
        email,
      });
      return "invite" in result;
    },
    async accept(person: string, id: string) {
      const result = await household.command(person, {
        action: "accept",
        invite: id,
      });
      return "group" in result;
    },
    async grant(
      person: string,
      family: string,
      viewer: string,
      allow: boolean,
    ) {
      if (viewer === person) return false;
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const members = await c.query(
          "SELECT person FROM medora.family_members WHERE family=$1 AND person IN ($2,$3) FOR SHARE",
          [family, person, viewer],
        );
        if (members.rowCount !== 2) {
          await c.query("ROLLBACK");
          return false;
        }
        if (allow) {
          const granted = await c.query(
            `INSERT INTO medora.water_grants(family,owner,viewer) VALUES($1,$2,$3)
            ON CONFLICT(family,owner,viewer) DO UPDATE SET sections=CASE WHEN 'water'=ANY(medora.water_grants.sections)
            THEN medora.water_grants.sections ELSE array_append(medora.water_grants.sections,'water') END
            WHERE ('water'=ANY(medora.water_grants.sections) OR NOT (medora.water_grants.can_record OR medora.water_grants.can_add))
            AND (medora.water_grants.expires_ms IS NULL OR medora.water_grants.expires_ms>extract(epoch FROM now())*1000)
            RETURNING owner`,
            [family, person, viewer],
          );
          if (!granted.rowCount) {
            await c.query("ROLLBACK");
            return false;
          }
        } else {
          await c.query(
            "DELETE FROM medora.water_grants WHERE family=$1 AND owner=$2 AND viewer=$3 AND sections=ARRAY['water']",
            [family, person, viewer],
          );
          await c.query(
            "UPDATE medora.water_grants SET sections=array_remove(sections,'water') WHERE family=$1 AND owner=$2 AND viewer=$3 AND 'water'=ANY(sections)",
            [family, person, viewer],
          );
        }
        await c.query(audit, [
          family,
          person,
          allow ? "share_water" : "revoke_water",
        ]);
        await c.query("COMMIT");
        return true;
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
    },
    async water(person: string, family: string, owner: string, day: number) {
      const result = await pool.query(
        `SELECT COALESCE((SELECT sum((r.body->>'amount')::int) FROM medora.records r
    WHERE r.owner=g.owner AND r.kind='water' AND (r.body->>'day')::int=$4),0)::bigint AS total
    FROM medora.water_grants g WHERE g.family=$1 AND g.viewer=$2 AND g.owner=$3 AND 'water'=ANY(g.sections) AND (g.expires_ms IS NULL OR g.expires_ms>extract(epoch FROM now())*1000)`,
        [family, person, owner, day],
      );
      return result.rows[0]
        ? { day, amount: Number(result.rows[0].total) }
        : null;
    },
  };
}
export type FamilyService = ReturnType<typeof familyService>;
