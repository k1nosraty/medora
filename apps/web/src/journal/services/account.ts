export async function submitIdentity(
  path: "challenges" | "verify",
  data: unknown,
) {
  const response = await fetch("/api/v2/identity/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(data),
  });
  if (!response.ok) throw Error("identity_failed");
  return response.json();
}
interface Group {
  id: string;
  label: string;
  manager: boolean;
  members: {
    id: string;
    name: string;
    self: boolean;
    shared: boolean;
    canRead: boolean;
  }[];
}
export const familyRequest = async (owner: string, body?: unknown) => {
  const r = await fetch("/api/v2/families", {
    method: body ? "POST" : "GET",
    cache: "no-store",
    headers: { "X-Medora-Owner": owner, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!r.ok) throw Error("unavailable");
  return r.json();
};

export const readFamily = (
  owner: string,
): Promise<{ groups: Group[]; invitations: { id: string; label: string }[] }> =>
  familyRequest(owner);
