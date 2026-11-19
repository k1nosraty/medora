import { familyRequest } from "../../../product-assets/public/medication/features/family/api.js";
import type { CareState } from "../productState";
import type { PersonalProfile } from "../settings/Preferences";
import type { Policy } from "./FamilyViews";

export interface SharedCare {
  records: CareState & { profile?: PersonalProfile & { gender?: string } };
  policy: Policy;
  synced: boolean;
  zone: string;
  revision: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Validate the view envelope without reconstructing records or dropping fields
// sent by newer clients. The account service remains the authorization boundary.
function isSharedCare(value: unknown): value is SharedCare {
  if (!isObject(value)) return false;
  const { records, policy, synced, zone, revision } = value;
  return isObject(records) && isObject(policy) && Array.isArray(policy.sections) &&
    policy.sections.every((section) => typeof section === "string") &&
    (policy.record === undefined || typeof policy.record === "boolean") &&
    (policy.add === undefined || typeof policy.add === "boolean") &&
    typeof synced === "boolean" && typeof zone === "string" &&
    typeof revision === "number" && Number.isSafeInteger(revision) && revision >= 0;
}

type ViewQuery = { group: string; target: string };
type PollQuery = ViewQuery & { knownRevision?: number; knownPolicy?: string };

export async function readFamilyView(query: ViewQuery): Promise<SharedCare> {
  const view: unknown = await familyRequest("view", query);
  if (!isSharedCare(view)) throw Error("unavailable");
  return view;
}

export async function pollFamilyView(action: "view", query: PollQuery) {
  const view: unknown = await familyRequest(action, query);
  if (isObject(view) && view.unchanged === true) return { unchanged: true };
  if (!isSharedCare(view)) throw Error("unavailable");
  return view;
}
