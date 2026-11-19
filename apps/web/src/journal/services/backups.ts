async function request(owner: string, path: string, options: RequestInit = {}) {
  const response = await fetch("/api/v2/backups" + path, {
    ...options,
    cache: "no-store",
    headers: { ...options.headers, "X-Medora-Owner": owner },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw Error("backup_unavailable");
  return response;
}
export async function listBackups(
  owner: string,
): Promise<Array<{ id: string; bytes: number; created_at: string }>> {
  return (await (await request(owner, "")).json()).backups;
}
export async function putBackup(owner: string, file: Blob) {
  await request(owner, "", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: file,
  });
}
export async function getBackup(owner: string, id: string) {
  return (await request(owner, "/" + encodeURIComponent(id))).blob();
}
