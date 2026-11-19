import type { PoolClient } from "pg";
import type { HouseholdCommand, CareCommit } from "@medora/contracts";
import { commitCare } from "./care";
import { applyFamilyChange } from "../../../web/src/family/care.mjs";
import { sharedCare } from "../../web/product-assets/public/medication/domain/family.js";
import { profileName } from "../../web/product-assets/public/medication/domain/profile.js";
import { careDelta } from "../../web/product-assets/public/medication/domain/care-delta.js";

type Policy = { sections: string[]; record: boolean; add: boolean };
export class Denied extends Error {
  constructor(
    public readonly code:
      | "forbidden"
      | "invalid"
      | "missing"
      | "expired"
      | "limit"
      | "sync_required"
      | "conflict"
      | "already_recorded"
      | "care_too_large",
  ) {
    super(code);
  }
}
export const deny = (code: Denied["code"]): never => {
  throw new Denied(code);
};
const categories = {
  water: "water",
  medicine: "medicines",
  visit: "visits",
  routine: "routines",
  cycle: "cycle",
};
const active =
  "(expires_ms IS NULL OR expires_ms > extract(epoch FROM now())*1000)";
export async function audit(
  c: PoolClient,
  group: string,
  person: string,
  action: string,
  subject = person,
) {
  await c.query(
    "INSERT INTO medora.access_audit(family,actor,action,subject) VALUES($1,$2,$3,$4)",
    [group, person, action, subject],
  );
}
export async function delegated(
  c: PoolClient,
  who: string,
  member: { label: string },
  d: HouseholdCommand,
) {
  const {
    rows: [grant],
  } = await c.query(
    `SELECT m.person,coalesce(m.label,a.username) AS label,g.sections,g.can_record,g.can_add,s.records,s.revision,s.zone,
    coalesce(p.epoch,'') AS epoch FROM medora.family_members m JOIN medora.water_grants g ON g.owner=m.person AND g.family=m.family
    JOIN medora.accounts a ON a.id=m.person AND a.sync_generation=2 JOIN medora.care_state s ON s.owner=a.id
    CROSS JOIN medora.writer_transition t LEFT JOIN medora.legacy_people p ON p.owner=m.person AND p.snapshot=t.snapshot
    WHERE m.family=$1 AND m.public_id=$2 AND g.viewer=$3 AND ${active}
    FOR SHARE OF g FOR UPDATE OF a,s`,
    [d.group, d.target, who],
  );
  if (!grant) return deny("forbidden");
  const permissions: Policy = {
    sections: grant.sections,
    record: grant.can_record,
    add: grant.can_add,
  };
  const revision = Number(grant.revision),
    zone = grant.zone ?? "Asia/Tehran";
  if (d.action === "view") {
    if (
      d.knownRevision === revision &&
      d.knownPolicy === JSON.stringify(permissions)
    )
      return { unchanged: true };
    await audit(c, d.group!, who, "view", grant.person);
    return {
      revision,
      label: grant.label,
      policy: permissions,
      records: sharedCare(grant.records, permissions.sections),
      synced: revision > 0,
      zone,
    };
  }
  const { kind, operation } = d;
  if (
    !kind ||
    !operation ||
    !permissions.sections.includes(categories[kind]) ||
    !(d.action === "record" ? permissions.record : permissions.add) ||
    (d.action === "record" &&
      kind === "medicine" &&
      !permissions.sections.includes("doses"))
  )
    return deny("forbidden");
  if (d.id && (d.id === "prototype" || Object.hasOwn(Object.prototype, d.id)))
    return deny("invalid");
  if (!revision) return deny("sync_required");
  const {
    rows: [actor],
  } = await c.query(
    `SELECT p.epoch,s.records->'settings'->'personalProfile' AS profile FROM medora.care_state s
    CROSS JOIN medora.writer_transition t LEFT JOIN medora.legacy_people p ON p.owner=s.owner AND p.snapshot=t.snapshot WHERE s.owner=$1`,
    [who],
  );
  const scope = who + (actor?.epoch ? "." + actor.epoch : "");
  const key = ["family-operation", grant.epoch, scope, d.group, operation].join(
    ":",
  );
  const saved = await c.query(
    `INSERT INTO medora.family_operations(owner,key,expires_ms,fingerprint)
    VALUES($1,$2,$3,sha256(convert_to($4::jsonb::text,'UTF8'))) ON CONFLICT(owner,key) DO UPDATE
    SET expires_ms=excluded.expires_ms,fingerprint=excluded.fingerprint WHERE medora.family_operations.expires_ms<=$5 RETURNING key`,
    [
      grant.person,
      key,
      Date.now() + 7 * 86400000,
      JSON.stringify(d),
      Date.now(),
    ],
  );
  if (!saved.rowCount) {
    const {
      rows: [receipt],
    } = await c.query(
      `SELECT fingerprint IS NULL OR fingerprint=sha256(convert_to($3::jsonb::text,'UTF8')) AS same
      FROM medora.family_operations WHERE owner=$1 AND key=$2`,
      [grant.person, key, JSON.stringify(d)],
    );
    if (!receipt.same) return deny("conflict");
    return { ok: true };
  }
  const records = applyFamilyChange(
    structuredClone(grant.records),
    {
      ...d,
      id: d.action === "add" || kind === "water" ? crypto.randomUUID() : d.id,
    },
    member.label,
    zone,
    Date.now(),
    profileName(actor?.profile),
  );
  if (typeof records === "string")
    return deny(
      records === "limit" || records === "already_recorded"
        ? records
        : "invalid",
    );
  const changes = careDelta(grant.records, records);
  if (!changes) return deny("invalid");
  await commitCare(c, grant.person, {
    baseRevision: revision,
    operation: crypto.randomUUID(),
    changes: changes as CareCommit["changes"],
  });
  await audit(c, d.group!, who, d.action + ":" + kind, grant.person);
  return { ok: true };
}
