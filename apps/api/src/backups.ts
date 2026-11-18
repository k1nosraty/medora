import type { ObjectStorage } from "./objects";
import type { Repository } from "./repository";
const magic = ["MEDORAW\x01", "MEDORA\x00\x01", "MDORCYC1"];
const checksum = async (bytes: ArrayBuffer) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
const key = (owner: string, id: string) =>
  "backups/" + encodeURIComponent(owner) + "/" + id;
export async function saveBackup(
  repo: Repository,
  storage: ObjectStorage,
  owner: string,
  bytes: ArrayBuffer,
) {
  if (
    bytes.byteLength < 52 ||
    bytes.byteLength > 16 * 1024 * 1024 ||
    !magic.includes(String.fromCharCode(...new Uint8Array(bytes, 0, 8)))
  )
    return null;
  const id = await checksum(bytes);
  await repo.reserveBackup(owner, id, bytes.byteLength);
  await storage.put(key(owner, id), new Uint8Array(bytes));
  const stored = await storage.get(key(owner, id));
  if (!stored || (await checksum(stored)) !== id)
    throw new Error("storage_mismatch");
  await repo.finishBackup(owner, id);
  return { id, bytes: bytes.byteLength };
}
export async function readBackup(
  repo: Repository,
  storage: ObjectStorage,
  owner: string,
  id: string,
) {
  if (!/^[0-9a-f]{64}$/.test(id) || !(await repo.hasBackup(owner, id)))
    return null;
  const bytes = await storage.get(key(owner, id));
  if (!bytes || (await checksum(bytes)) !== id)
    throw new Error("storage_mismatch");
  return bytes;
}
