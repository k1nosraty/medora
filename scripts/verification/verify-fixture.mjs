import { Client } from "pg";
import { isDeepStrictEqual } from "node:util";
import {
  openPrivateCare,
  importRecoveryKey,
} from "../../apps/web/product-assets/public/medication/features/sync/private-care.js";

// Read the target through direct SQL and compare it to the fixture writer's own inputs.
// Keep mismatching values out of logs, including test credentials and notes.
const check = (a, b, kind) => {
  if (!isDeepStrictEqual(a, b))
    throw Error("Fixture value mismatch in " + kind);
};
export async function verifyFixture(url, snapshot, expected) {
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    for (const p of expected.people) {
      const values = [snapshot, p.id];
      const one = async (sql) => (await db.query(sql, values)).rows[0];
      const account = (
        await db.query({
          text: "SELECT username,id,email,password_salt,password_proof,created_at::float8,password_key FROM medora.accounts WHERE id=$1",
          values: [p.id],
          rowMode: "array",
        })
      ).rows[0];
      check(account, p.credential, "credential");
      check(
        await one(
          "SELECT zone,source_revision::int AS revision FROM medora.legacy_people WHERE snapshot=$1 AND owner=$2",
        ),
        { zone: "Asia/Tehran", revision: 7 },
        "owner",
      );
      check(
        await one(
          "SELECT digest,expires_at::float8 AS expires FROM medora.legacy_sessions WHERE snapshot=$1 AND owner=$2",
        ),
        { digest: p.digest, expires: 1900000000000 },
        "session",
      );
      check(
        await one(
          "SELECT device FROM medora.account_devices WHERE snapshot=$1 AND owner=$2",
        ),
        { device: expected.device },
        "device link",
      );
      const member = (
        await db.query({
          text: "SELECT id,group_id,person,label FROM medora.memberships WHERE snapshot=$1 AND person=$2",
          values,
          rowMode: "array",
        })
      ).rows[0];
      check(member, p.member, "membership");
      const { rows } = await db.query(
        "SELECT kind,id,value FROM medora.legacy_care WHERE snapshot=$1 AND owner=$2",
        values,
      );
      const result = {
        ...Object.fromEntries(
          Object.entries(p.records)
            .filter(([, v]) => v && typeof v === "object" && !Array.isArray(v))
            .map(([k]) => [k, {}]),
        ),
        water: [],
      };
      for (const r of rows) {
        if (r.kind === "water") {
          check(r.value.id, r.id, "water identifier");
          result.water.push(r.value);
        } else if (r.id === "") result[r.kind] = r.value;
        else result[r.kind][r.id] = r.value;
      }
      const ordered = (water) =>
        [...water].sort((a, b) => a.id.localeCompare(b.id));
      check(
        { ...result, water: ordered(result.water) },
        { ...p.records, water: ordered(p.records.water) },
        "care records",
      );
      if (result.privacyKey) {
        const opened = await openPrivateCare(
          result,
          await importRecoveryKey(expected.recovery),
        );
        check(
          opened.visits.sample.note,
          "synthetic private note",
          "private appointment",
        );
        check(
          opened.cycleDays["20002"].note,
          "synthetic cycle note",
          "private cycle",
        );
      }
    }
    const grant = (
      await db.query(
        "SELECT group_id,owner,recipient,policy,expires_at::float8 AS expires FROM medora.grants WHERE snapshot=$1",
        [snapshot],
      )
    ).rows;
    check(
      grant,
      [
        {
          group_id: expected.group,
          owner: expected.people[0].id,
          recipient: expected.people[1].id,
          policy: { sections: ["water"], record: false, add: false },
          expires: 1900000000000,
        },
      ],
      "grant",
    );
    check(
      (
        await db.query(
          "SELECT id,owner,label,icon FROM medora.households WHERE snapshot=$1",
          [snapshot],
        )
      ).rows,
      [
        {
          id: expected.group,
          owner: expected.people[0].id,
          label: "Synthetic household",
          icon: "group",
        },
      ],
      "household",
    );
    check(
      (
        await db.query(
          "SELECT device,state FROM medora.import_devices WHERE snapshot=$1",
          [snapshot],
        )
      ).rows,
      [{ device: expected.device, state: { revision: 2, enabled: false } }],
      "device",
    );
  } finally {
    await db.end();
  }
}
