const uuid = value => typeof value === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const person = value => typeof value === "string" && /^[a-f0-9]{64}(?:\.[a-f0-9]{32})?$/.test(value);
const text = max => value => typeof value === "string" && value.length > 0 && value.length <= max;
const int = value => Number.isSafeInteger(value) && value >= 0;
const nullable = check => value => value === null || check(value);
const oneOf = values => value => values.includes(value);
import { familySections } from "../../public/medication/domain/family.js";

const policy = value => {
  if (typeof value !== "string" || value.length > 512) return false;
  try {
    const data = JSON.parse(value);
    return Array.isArray(data?.sections) && data.sections.length > 0 && data.sections.every(oneOf(familySections)) &&
      typeof data.add === "boolean" && typeof data.record === "boolean";
  } catch { return false; }
};

export const familyTables = {
  groups: { primary: ["id"], columns: { id: uuid, name: text(60), owner: person, icon: text(48) } },
  members: { primary: ["id"], columns: { id: uuid, group_id: uuid, person, label: text(32) } },
  invites: { primary: ["id"], columns: { id: uuid, group_id: uuid, email: text(254), created: int,
    expires: int, status: oneOf(["pending", "accepted", "decline", "cancel"]), recipient_label: nullable(text(32)) } },
  grants: { primary: ["group_id", "owner", "recipient"], columns: { group_id: uuid, owner: person, recipient: person, policy, expires: nullable(int) } },
  audit: { primary: ["id"], columns: { id: int, group_id: uuid, actor: person, subject: person, action: text(64), time: int } }
};

export const familyTableNames = Object.keys(familyTables);
export const familyPageSize = 100;

export function validFamilyRows(table, rows) {
  if (!Object.hasOwn(familyTables, table) || !Array.isArray(rows)) return false;
  const { primary, columns } = familyTables[table];
  const keys = new Set();
  return rows.every(row => {
    if (!row || Object.keys(row).length !== Object.keys(columns).length ||
        !Object.entries(columns).every(([key, check]) => Object.hasOwn(row, key) && check(row[key]))) return false;
    const identity = JSON.stringify(primary.map(key => row[key]));
    if (keys.has(identity)) return false;
    keys.add(identity);
    return true;
  });
}
