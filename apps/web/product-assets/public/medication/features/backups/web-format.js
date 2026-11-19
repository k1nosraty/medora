import { decryptBackup, encryptBackup, hasBackupMagic } from "../../shared/crypto/backup.js";
import { portable, validatePortable } from "../../domain/care-records.js";
export { portable, validatePortable, webBackupSettings } from "../../domain/care-records.js";

const magic = new Uint8Array([77, 69, 68, 79, 82, 65, 87, 1]);
export const isWebBackup = bytes => hasBackupMagic(bytes, magic);
export const validBackupPassword = password => [...password].length >= 15 && password.length <= 128;

export async function writeWebBackup(state, password, validatePhases) {
  if (!validBackupPassword(password)) throw new Error("backup_password");
  const data = portable(state);
  validatePortable(data, validatePhases);
  return encryptBackup(data, password, magic);
}

export async function readWebBackup(bytes, password, validatePhases) {
  return validatePortable(await decryptBackup(bytes, password, magic), validatePhases);
}
