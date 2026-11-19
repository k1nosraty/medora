import { DurableObject } from "cloudflare:workers";
import { equalCareValues } from "../../apps/web/product-assets/public/medication/domain/care-contract.js";
const tables = {
  families: ["family_groups", ["id"]],
  family_members: ["family_members", ["id"]],
  family_invites: ["family_invites", ["id"]],
  water_grants: ["family_grants", ["group_id", "owner", "recipient"]],
  access_audit: ["family_audit", ["id"]],
};
const allowed = new Set(
  "id name owner icon group_id person label email created expires status recipient_label recipient policy actor subject action time".split(
    " ",
  ),
);
function matches(stored, expected) {
  if (!expected) return !stored;
  if (!stored) return false;
  return Object.entries(expected).every(([k, v]) => {
    if (k !== "policy") return stored[k] === v;
    const raw = JSON.parse(stored.policy);
    return Object.entries(v).every(([field, value]) =>
      equalCareValues(raw[field], value),
    );
  });
}
export class HouseholdRecovery extends DurableObject {
  async replay(events, final) {
    this.ctx.storage.transactionSync(() => {
      const sql = this.ctx.storage.sql;
      for (const { table, before, after } of events) {
        const [target, primary] = tables[table];
        const where = primary.map((k) => k + "=?").join(" AND ");
        const identity = primary.map((k) => (before ?? after)[k]);
        const [stored] = sql
          .exec("SELECT * FROM " + target + " WHERE " + where, ...identity)
          .toArray();
        if (!matches(stored, before))
          throw Error("Household event baseline mismatch");
        if (!after) {
          sql.exec("DELETE FROM " + target + " WHERE " + where, ...identity);
          continue;
        }
        const fields = Object.keys(after);
        if (!fields.every((k) => allowed.has(k)))
          throw Error("Unsupported household column");
        const values = fields.map((k) =>
          k === "policy"
            ? JSON.stringify({
                ...JSON.parse(stored?.policy ?? "{}"),
                ...after.policy,
              })
            : after[k],
        );
        if (stored)
          sql.exec(
            "UPDATE " +
              target +
              " SET " +
              fields.map((k) => k + "=?").join(",") +
              " WHERE " +
              where,
            ...values,
            ...identity,
          );
        else
          sql.exec(
            "INSERT INTO " +
              target +
              "(" +
              fields.join(",") +
              ") VALUES(" +
              fields.map(() => "?").join(",") +
              ")",
            ...values,
          );
      }
      for (const [table, rows] of Object.entries(final)) {
        const [target, primary] = tables[table],
          where = primary.map((k) => k + "=?").join(" AND ");
        if (
          sql.exec("SELECT count(*) AS n FROM " + target).one().n !==
          rows.length
        )
          throw Error("Household census mismatch");
        for (const row of rows)
          if (
            !matches(
              sql
                .exec(
                  "SELECT * FROM " + target + " WHERE " + where,
                  ...primary.map((k) => row[k]),
                )
                .toArray()[0],
              row,
            )
          )
            throw Error("Restored household differs from frozen writer");
      }
    });
  }
}
