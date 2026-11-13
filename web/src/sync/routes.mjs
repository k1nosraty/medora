import { signedInEmail, registeredIdentity } from "../accounts/email-auth.mjs";
import { smallJson } from "../http/validation.mjs";
import { validatePortable } from "../../public/medication/features/backups/web-format.js";
import { compilePhases } from "../../public/medication/domain/care-index.js";
import * as engine from "../../public/medication/domain/medication-rules.js";

export const syncLimit = 4 * 1024 * 1024;
const reply = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function handleCareSync(request, env, url) {
  const method = request.method;
  if (!["GET", "PUT"].includes(method)) return reply({ error: "method" }, 405);
  if (method === "PUT" && request.headers.get("Origin") !== url.origin) return reply({ error: "forbidden" }, 403);
  const email = await signedInEmail(request, env);
  const owner = email && await registeredIdentity(env, email);
  if (!owner) return reply({ error: "sign_in" }, 401);
  const client = env.EMAIL_ACCOUNTS.getByName(owner);
  const generation = await client.epoch();
  const scope = generation ? owner + "." + generation : owner;
  if (method === "GET") return reply({ owner: scope, ...await client.careSnapshot() });
  const data = await smallJson(request, syncLimit);
  if (!data || data.owner !== scope || !Number.isSafeInteger(data.revision) || data.revision < 0) return reply({ error: "invalid_sync" }, 400);
  try {
    validatePortable(data.records, phases => engine.validMedicationPhases(compilePhases(engine, phases)));
  } catch {
    return reply({ error: "invalid_sync" }, 400);
  }
  const saved = await client.saveCareSnapshot(data.revision, data.records, generation);
  return saved ? reply({ owner: scope, ...saved }) : reply({ error: "conflict" }, 409);
}
