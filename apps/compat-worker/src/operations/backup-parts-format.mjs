const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
export const partsMagic = encoder.encode("MEDSRV02");
export const maxPartBytes = 12 * 1024 * 1024;
export const emptyHash = "0".repeat(64);
export const isHash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export const isIndex = value => Number.isSafeInteger(value) && value >= 0;

export async function sha256(bytes) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function advanceHash(previous, frame) {
  return sha256(encoder.encode(previous + await sha256(frame)));
}

function parameters(iv, id, index) {
  return { name: "AES-GCM", iv, additionalData: encoder.encode(`Medora archive v2:${id}:${index}`), tagLength: 128 };
}

async function useKey(key, usage) {
  if (!isHash(key)) throw new Error("invalid_key");
  return crypto.subtle.importKey("raw", Uint8Array.from(key.match(/../g), byte => Number.parseInt(byte, 16)),
    "AES-GCM", false, [usage]);
}

export async function sealPart(value, key, id, index) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = encoder.encode(JSON.stringify(value));
  try {
    if (plain.length + 28 > maxPartBytes) throw new Error("part_too_large");
    const encrypted = new Uint8Array(await crypto.subtle.encrypt(parameters(iv, id, index), await useKey(key, "encrypt"), plain));
    const part = new Uint8Array(12 + encrypted.length);
    part.set(iv);
    part.set(encrypted, 12);
    return part;
  } finally {
    plain.fill(0);
  }
}

export async function openPart(bytes, key, id, index) {
  if (bytes.length < 28 || bytes.length > maxPartBytes) throw new Error("invalid_part");
  const plain = new Uint8Array(await crypto.subtle.decrypt(parameters(bytes.subarray(0, 12), id, index),
    await useKey(key, "decrypt"), bytes.subarray(12)));
  try { return JSON.parse(decoder.decode(plain)); }
  finally { plain.fill(0); }
}
