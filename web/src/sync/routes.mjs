import { careSession } from "../accounts/email-auth.mjs";
import { smallJson } from "../http/validation.mjs";
import { portable, validatePortable } from "../../public/medication/features/backups/web-format.js";
import { compilePhases } from "../../public/medication/domain/care-index.js";
import * as engine from "../../public/medication/domain/medication-rules.js";

export const syncLimit = 4 * 1024 * 1024;
const reply = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export function validateCareRecords(records) {
  return validatePortable(records, phases => engine.validMedicationPhases(compilePhases(engine, phases)));
}

export async function handleCareSync(request, env, url) {
  const method = request.method;
  if (!["GET", "PUT"].includes(method)) return reply({ error: "method" }, 405);
  if (method === "PUT" && request.headers.get("Origin") !== url.origin) return reply({ error: "forbidden" }, 403);
  const session = await careSession(request, env);
  if (!session) return reply({ error: "sign_in" }, 401);
  const { id: owner, token } = session;
  const client = env.EMAIL_ACCOUNTS.getByName(owner);
  if (method === "GET") {
    const snapshot = await client.readCareForSession(token);
    if (!snapshot) return reply({ error: "sign_in" }, 401);
    const { epoch, ...current } = snapshot;
    return reply({ owner: epoch ? owner + "." + epoch : owner, ...current });
  }
  const data = await smallJson(request, syncLimit);
  const scope = typeof data?.owner === "string" && /^([a-f0-9]{64})(?:\.([a-f0-9]{32}))?$/.exec(data.owner);
  if (!scope || scope[1] !== owner || !Number.isSafeInteger(data.revision) || data.revision < 0) return reply({ error: "invalid_sync" }, 400);
  let records;
  try {
    records = portable(validateCareRecords(data.records));
  } catch {
    return reply({ error: "invalid_sync" }, 400);
  }
  const saved = await client.saveCareSnapshot(data.revision, records, scope[2] ?? "", token);
  if (saved?.signedOut) return reply({ error: "sign_in" }, 401);
  return saved ? reply({ owner: data.owner, ...saved }) : reply({ error: "conflict" }, 409);
}
