import { expect, it } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { familyService } from "../../apps/api/src/family";
import { repository } from "../../apps/api/src/repository";
it.skipIf(!process.env.MEDORA_TEST_DATABASE_URL)(
  "scopes invitations, directional water grants, household reads and revocation",
  async () => {
    const pool = new Pool({
      connectionString: process.env.MEDORA_TEST_DATABASE_URL,
    });
    const family = familyService(pool),
      repo = repository(pool),
      people = [randomUUID(), randomUUID(), randomUUID()] as const;
    const [a, b, c] = people;
    try {
      for (const p of people)
        await pool.query(
          "INSERT INTO medora.accounts(id,email,username,password_salt,password_proof,password_key,sync_generation) VALUES ($1,$2,$1,'unused','unused','fixture',2)",
          [p, p + "@example.test"],
        );
      const group = await family.create(a, "Fixture household");
      if (!group) throw Error("fixture");
      expect(await family.invite(b, group, b + "@example.test")).toBe(false);
      expect(await family.invite(a, group, b + "@example.test")).toBe(true);
      const invite = (await family.home(b)).invitations[0]!.id;
      expect(await family.accept(c, invite)).toBe(false);
      expect(await family.accept(b, invite)).toBe(true);
      expect(await family.grant(a, group, c, true)).toBe(false);
      expect(await family.water(b, group, a, 10)).toBe(null);
      await repo.push(a, {
        operation: randomUUID(),
        kind: "water",
        id: "w",
        baseRevision: 0,
        body: { day: 10, time: "08:00", amount: 350 },
      });
      expect(await family.grant(a, group, b, true)).toBe(true);
      expect(await family.water(b, group, a, 10)).toEqual({
        day: 10,
        amount: 350,
      });
      expect(await family.water(a, group, b, 10)).toBe(null);
      expect(await family.water(c, group, a, 10)).toBe(null);
      expect(await family.grant(a, group, b, false)).toBe(true);
      expect(await family.water(b, group, a, 10)).toBe(null);
    } finally {
      await pool.end();
    }
  },
);
