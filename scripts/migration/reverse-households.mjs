// Explicit mapping keeps new columns and new event types from being silently
// reinterpreted by an older runtime. Unknown source columns stay in SQLite.
const relations = [
  "families",
  "family_members",
  "family_invites",
  "water_grants",
];
export async function householdReplay(client, snapshot) {
  const { rows: accounts } = await client.query(
    `SELECT a.id,a.username,p.epoch FROM medora.accounts a
    JOIN medora.legacy_people p ON p.owner=a.id AND p.snapshot=$1`,
    [snapshot],
  );
  const people = new Map(accounts.map((a) => [a.id, a]));
  const person = (id) => {
    const row = people.get(id);
    if (!row) throw Error("Family history contains an unresolved identity");
    return id + (row.epoch ? "." + row.epoch : "");
  };
  function map(table, r) {
    if (!r) return null;
    switch (table) {
      case "families":
        return {
          id: r.id,
          name: r.label,
          owner: person(r.creator),
          icon: r.icon,
        };
      case "family_members":
        return {
          id: r.public_id,
          group_id: r.family,
          person: person(r.person),
          label: r.label ?? people.get(r.person).username,
        };
      case "family_invites":
        return {
          id: r.id,
          group_id: r.family,
          email: r.email,
          created: new Date(r.created_at).getTime(),
          expires: new Date(r.expires_at).getTime(),
          status: r.status,
          recipient_label: r.recipient_label,
        };
      case "water_grants":
        return {
          group_id: r.family,
          owner: person(r.owner),
          recipient: person(r.viewer),
          policy: {
            sections: r.sections,
            record: r.can_record,
            add: r.can_add,
          },
          expires: r.expires_ms === null ? null : Number(r.expires_ms),
        };
      case "access_audit":
        return {
          id: Number(r.id),
          group_id: r.family,
          actor: person(r.actor),
          subject: person(r.subject ?? r.actor),
          action: r.action,
          time: new Date(r.happened_at).getTime(),
        };
      default:
        throw Error("Unmapped household change");
    }
  }
  const { rows: changes } = await client.query(
    "SELECT relation_name,previous,following FROM medora.household_changes ORDER BY sequence",
  );
  const events = [],
    receipts = new Map();
  for (const e of changes) {
    if (e.relation_name === "family_operations") {
      const { owner } = e.following ?? e.previous;
      if (!people.has(owner)) throw Error("Unresolved operation owner");
      const rows = receipts.get(owner) ?? [];
      const op = (r) =>
        r && { operation: r.key, expires: Number(r.expires_ms) };
      rows.push({ before: op(e.previous), after: op(e.following) });
      receipts.set(owner, rows);
    } else
      events.push({
        table: e.relation_name,
        before: map(e.relation_name, e.previous),
        after: map(e.relation_name, e.following),
      });
  }
  const final = {};
  for (const name of relations)
    final[name] = (await client.query("SELECT * FROM medora." + name)).rows.map(
      (row) => map(name, row),
    );
  return { events, receipts, final };
}
