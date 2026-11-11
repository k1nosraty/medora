export const maxBackupBytes = 16 * 1024 * 1024;
const headerSize = 36;
const tagSize = 16;
const encoder = new TextEncoder();

async function backupKey(password, salt, usage) {
  if (!password.length || password.length > 128) throw new Error("invalid_backup");
  const encoded = encoder.encode(password);
  let passwordKey;
  try {
    passwordKey = await crypto.subtle.importKey("raw", encoded, "PBKDF2", false, ["deriveKey"]);
  } finally {
    encoded.fill(0);
  }
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 600_000, hash: "SHA-256" },
    passwordKey, { name: "AES-GCM", length: 256 }, false, [usage]);
}

const parameters = header => ({
  name: "AES-GCM", iv: header.subarray(24), additionalData: header, tagLength: 128
});

export const hasBackupMagic = (bytes, magic) => magic.every((byte, index) => bytes[index] === byte);

export async function decryptBackup(bytes, password, magic) {
  if (bytes.length < headerSize + tagSize || bytes.length > maxBackupBytes || !hasBackupMagic(bytes, magic)) {
    throw new Error("invalid_backup");
  }
  const header = bytes.subarray(0, headerSize);
  const key = await backupKey(password, header.subarray(8, 24), "decrypt");
  const plain = new Uint8Array(await crypto.subtle.decrypt(parameters(header), key, bytes.subarray(headerSize)));
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plain));
  } finally {
    plain.fill(0);
  }
}

export async function encryptBackup(data, password, magic) {
  const header = crypto.getRandomValues(new Uint8Array(headerSize));
  header.set(magic);
  const plain = encoder.encode(JSON.stringify(data));
  try {
    if (plain.length + headerSize + tagSize > maxBackupBytes) throw new Error("backup_too_large");
    const key = await backupKey(password, header.subarray(8, 24), "encrypt");
    const encrypted = await crypto.subtle.encrypt(parameters(header), key, plain);
    const result = new Uint8Array(headerSize + encrypted.byteLength);
    result.set(header);
    result.set(new Uint8Array(encrypted), headerSize);
    return result;
  } finally {
    plain.fill(0);
  }
}
