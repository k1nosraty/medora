import type { Pool } from "pg";
export function familyService(pool: Pool) {
  const audit =
    "INSERT INTO medora.access_audit(family,actor,action) VALUES($1,$2,$3)";
  return {
    async home(person: string) {
      const groups = await pool.query(
        `SELECT f.id,f.label,(f.creator=$1) AS manager,
    (SELECT jsonb_agg(jsonb_build_object('id',m.person,'name',a.username,'self',m.person=$1,
    'shared',EXISTS(SELECT 1 FROM medora.water_grants g WHERE g.family=f.id AND g.owner=$1 AND g.viewer=m.person),
    'canRead',EXISTS(SELECT 1 FROM medora.water_grants g WHERE g.family=f.id AND g.viewer=$1 AND g.owner=m.person)) ORDER BY a.username)
    FROM medora.family_members m JOIN medora.accounts a ON a.id=m.person WHERE m.family=f.id) AS members
    FROM medora.family_members mine JOIN medora.families f ON f.id=mine.family WHERE mine.person=$1 ORDER BY f.id`,
        [person],
      );
      const invitations = await pool.query(
        `SELECT i.id,f.label FROM medora.family_invites i JOIN medora.families f ON f.id=i.family
     JOIN medora.accounts a ON a.email=i.email WHERE a.id=$1 AND i.expires_at>now() ORDER BY i.id`,
        [person],
      );
      return { groups: groups.rows, invitations: invitations.rows };
    },
    async create(person: string, name: string) {
      const id = crypto.randomUUID(),
        c = await pool.connect();
      try {
        await c.query("BEGIN");
        await c.query("SELECT id FROM medora.accounts WHERE id=$1 FOR UPDATE", [
          person,
        ]);
        const groups = await c.query(
          "SELECT id FROM medora.families WHERE creator=$1",
          [person],
        );
        if ((groups.rowCount ?? 0) >= 32) {
          await c.query("ROLLBACK");
          return false;
        }
        await c.query("INSERT INTO medora.families VALUES($1,$2,$3)", [
          id,
          name,
          person,
        ]);
        await c.query("INSERT INTO medora.family_members VALUES($1,$2)", [
          id,
          person,
        ]);
        await c.query(audit, [id, person, "create"]);
        await c.query("COMMIT");
        return id;
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
    },
    async invite(person: string, family: string, email: string) {
      const result = await pool.query(
        `WITH i AS (INSERT INTO medora.family_invites(id,family,email,expires_at)
    SELECT $1,id,$2,now()+interval '7 days' FROM medora.families WHERE id=$3 AND creator=$4
    ON CONFLICT(family,email) DO UPDATE SET id=excluded.id, expires_at=excluded.expires_at RETURNING family)
    INSERT INTO medora.access_audit(family,actor,action) SELECT family,$4,'invite' FROM i RETURNING id`,
        [crypto.randomUUID(), email, family, person],
      );
      return !!result.rowCount;
    },
    async accept(person: string, id: string) {
      const result = await pool.query(
        `WITH invitation AS (DELETE FROM medora.family_invites i USING medora.accounts a
    WHERE i.id=$1 AND i.email=a.email AND a.id=$2 AND i.expires_at>now() RETURNING i.family),
    member AS (INSERT INTO medora.family_members SELECT family,$2 FROM invitation ON CONFLICT DO NOTHING)
    INSERT INTO medora.access_audit(family,actor,action) SELECT family,$2,'accept' FROM invitation RETURNING id`,
        [id, person],
      );
      return !!result.rowCount;
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
        if (allow)
          await c.query(
            "INSERT INTO medora.water_grants VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
            [family, person, viewer],
          );
        else
          await c.query(
            "DELETE FROM medora.water_grants WHERE family=$1 AND owner=$2 AND viewer=$3",
            [family, person, viewer],
          );
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
    FROM medora.water_grants g WHERE g.family=$1 AND g.viewer=$2 AND g.owner=$3`,
        [family, person, owner, day],
      );
      return result.rows[0]
        ? { day, amount: Number(result.rows[0].total) }
        : null;
    },
  };
}
export type FamilyService = ReturnType<typeof familyService>;
