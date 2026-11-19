import { change, type Change } from "@medora/contracts";
import { guest, type Journal } from "./journal";

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch("/api/v2/" + path, {
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
    ...options,
  });
  if (!response.ok) {
    const code = await response.json().then(
      (x) => x.error,
      () => "network",
    );
    throw new Error(
      response.status === 409 && code === "stale_revision"
        ? "stale"
        : response.status === 409
          ? "conflict"
          : response.status === 401
            ? "session"
            : "network",
    );
  }
  return response;
}
export async function signIn(username: string, password: string) {
  await request("session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const { owner } = await (await request("session")).json();
  if (typeof owner !== "string" || owner === guest) throw new Error("session");
  return owner;
}
export async function signOut() {
  await request("session", { method: "DELETE" });
}
export async function synchronize(db: Journal, owner: string) {
  if (owner === guest) return;
  const headers = {
    "X-Medora-Owner": owner,
    "Content-Type": "application/json",
  };
  for (const entry of await db.queue
    .where("[owner+created]")
    .between([owner, 0], [owner, Number.MAX_SAFE_INTEGER], true, true)
    .toArray()) {
    const { operation, kind, id, baseRevision, body } = entry;
    if (await db.conflicts.get([owner, id])) continue;
    try {
      const reply = await request("changes", {
        method: "POST",
        headers,
        body: JSON.stringify({ operation, kind, id, baseRevision, body }),
      });
      change.parse(await reply.json());
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "stale") throw error;
    }
  }
  let rows: Change[];
  do {
    const after = (await db.cursors.get(owner))?.value ?? 0;
    const response = await request("changes?after=" + after, { headers });
    rows = change.array().parse((await response.json()).changes);
    await db.apply(owner, rows, after);
  } while (rows.length === 100);
}
