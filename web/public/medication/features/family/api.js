import { accountTransport } from "../../shared/account-transport.js";
export async function familyRequest(action, fields) {
  const inbox = action === "inbox";
  let response;
  try {
    response = await accountTransport(inbox ? "/api/family?inbox=1" : "/api/family", action && !inbox ? {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...fields }), cache: "no-store", signal: AbortSignal.timeout(12000)
    } : { cache: "no-store", signal: AbortSignal.timeout(12000) });
  } catch { throw new Error("offline"); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "unavailable");
  return data;
}
