// Keep the authenticated staging projection immutable. Resolve an epoch-qualified
// legacy person only if it matches the exact account generation being activated.
export async function activateHouseholds(client, snapshot) {
  const { rows } = await client.query(
    "SELECT owner,epoch FROM medora.legacy_people WHERE snapshot=$1",
    [snapshot],
  );
  const owners = new Map(
    rows.map((r) => [r.owner + (r.epoch ? "." + r.epoch : ""), r.owner]),
  );
  const id = (scope) => {
    if (!owners.has(scope)) throw Error("Unresolved household epoch");
    return owners.get(scope);
  };
  for (const row of (
    await client.query("SELECT * FROM medora.households WHERE snapshot=$1", [
      snapshot,
    ])
  ).rows)
    await client.query(
      "INSERT INTO medora.families(id,label,creator,icon) VALUES($1,$2,$3,$4)",
      [row.id, row.label, id(row.owner), row.icon ?? "group"],
    );
  for (const row of (
    await client.query("SELECT * FROM medora.memberships WHERE snapshot=$1", [
      snapshot,
    ])
  ).rows)
    await client.query(
      "INSERT INTO medora.family_members(family,person,public_id,label) VALUES($1,$2,$3,$4)",
      [row.group_id, id(row.person), row.id, row.label],
    );
  for (const row of (
    await client.query("SELECT * FROM medora.grants WHERE snapshot=$1", [
      snapshot,
    ])
  ).rows)
    await client.query(
      "INSERT INTO medora.water_grants(family,owner,viewer,sections,can_record,can_add,expires_ms) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        row.group_id,
        id(row.owner),
        id(row.recipient),
        row.policy.sections,
        row.policy.record,
        row.policy.add,
        row.expires_at,
      ],
    );
}
