export async function familyRequest(action, fields) {
  let response;
  try {
    response = await fetch("/api/family", action ? {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...fields }), cache: "no-store", signal: AbortSignal.timeout(12000)
    } : { cache: "no-store", signal: AbortSignal.timeout(12000) });
  } catch { throw new Error("offline"); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "unavailable");
  return data;
}
