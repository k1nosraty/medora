import { applyCareDelta } from "../../public/medication/domain/care-delta.js";
import { isRecoveryKeyId } from "../../public/medication/domain/private-fields.js";
import { careSession } from "../accounts/email-auth.mjs";
import { smallJson } from "../http/validation.mjs";
import { careSyncLimit, careVersion, portable, validateCareRecords } from "../../public/medication/domain/care-records.js";
import { timezone } from "../../public/medication/domain/wall-clock.js";

const privateHeaders = { "Cache-Control": "private, no-store", "X-Medora-Care-Delta": "1" };
const reply = (data, status = 200, headers = {}) => Response.json(data, { status, headers: { ...privateHeaders, ...headers } });

export async function handleCareSync(request, env, url) {
  const method = request.method;
  if (!["GET", "PUT", "PATCH"].includes(method)) return reply({ error: "method" }, 405);
  if (method !== "GET" && request.headers.get("Origin") !== url.origin) return reply({ error: "forbidden" }, 403);
  const session = await careSession(request, env);
  if (!session) return reply({ error: "sign_in" }, 401);
  const { id: owner, token } = session;
  const client = env.EMAIL_ACCOUNTS.getByName(owner);
  if (method === "GET") {
    const snapshot = await client.readCareForSession(token, owner, request.headers.get("If-None-Match"), url.searchParams.has("zone"));
    if (!snapshot) return reply({ error: "sign_in" }, 401);
    if (snapshot.unchanged) return new Response(null, { status: 304, headers: { ...privateHeaders, ETag: snapshot.unchanged } });
    const { epoch, ...current } = snapshot;
    const scope = epoch ? owner + "." + epoch : owner;
    return reply({ owner: scope, ...current }, 200, { ETag: careVersion(scope, current.revision) });
  }
  if (method === "PATCH") {
    const data = await smallJson(request, 1024);
    const scope = typeof data?.owner === "string" && /^([a-f0-9]{64})(?:\.([a-f0-9]{32}))?$/.exec(data.owner);
    if (!scope || scope[1] !== owner || !Number.isSafeInteger(data.revision) || data.revision < 0 ||
        typeof data.zone !== "string" || data.zone.length > 64) return reply({ error: "invalid_sync" }, 400);
    try { timezone(data.zone); } catch { return reply({ error: "invalid_sync" }, 400); }
    const saved = await client.setCareZone(owner, scope[2] ?? "", data.revision, token, data.zone);
    if (saved?.signedOut) return reply({ error: "sign_in" }, 401);
    return saved ? reply(saved) : reply({ error: "conflict" }, 409);
  }
  if (Number(request.headers.get("Content-Length")) > careSyncLimit) return reply({ error: "care_too_large" }, 413);
  const data = await smallJson(request, careSyncLimit, { onLimit: () => ({ tooLarge: true }) });
  if (data?.tooLarge) return reply({ error: "care_too_large" }, 413);
  const scope = typeof data?.owner === "string" && /^([a-f0-9]{64})(?:\.([a-f0-9]{32}))?$/.exec(data.owner);
  if (!scope || scope[1] !== owner || !Number.isSafeInteger(data.revision) || data.revision < 0) return reply({ error: "invalid_sync" }, 400);
  if (data.rotationProof !== undefined && !isRecoveryKeyId(data.rotationProof)) return reply({ error: "invalid_sync" }, 400);
  const incremental = Object.hasOwn(data, "changes");
  let records;
  try {
    if (incremental) {
      if (data.rotationProof !== undefined || Object.hasOwn(data, "records")) return reply({ error: "invalid_sync" }, 400);
      const base = await client.readCareForSession(token, owner);
      if (!base) return reply({ error: "sign_in" }, 401);
      if (base.epoch !== (scope[2] ?? "") || base.revision !== data.revision || !base.records)
        return reply({ error: "conflict" }, 409);
      records = applyCareDelta(base.records, data.changes);
      validateCareRecords(records);
    } else records = portable(validateCareRecords(data.records));
  } catch {
    return reply({ error: "invalid_sync" }, 400);
  }
  let zone;
  if (typeof data.zone === "string" && data.zone.length <= 64) {
    try { timezone(data.zone); zone = data.zone; } catch {}
  }
  const saved = await client.saveCareSnapshot(data.revision, records, scope[2] ?? "", token, zone, owner, data.rotationProof);
  if (saved?.signedOut) return reply({ error: "sign_in" }, 401);
  if (saved?.privacyKey) return reply({ error: "private_key" }, 422);
  if (saved?.tooLarge) return reply({ error: "care_too_large" }, 413);
  return saved ? reply(incremental ? { owner: data.owner, revision: saved.revision, applied: true } : { owner: data.owner, ...saved }) : reply({ error: "conflict" }, 409);
}
