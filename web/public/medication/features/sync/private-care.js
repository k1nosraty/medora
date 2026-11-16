import { hasPrivateText, isRecoveryKeyId, privateFields, privateRows, validPrivateText, withoutPrivateFields } from "../../domain/private-fields.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
const digest = async bytes => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
const unhex = value => Uint8Array.from(value.match(/../g), byte => Number.parseInt(byte, 16));

function base64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  }
  return btoa(chunks.join(""));
}

export const generateRecoveryKey = () => hex(crypto.getRandomValues(new Uint8Array(32)));

export async function importRecoveryKey(value) {
  if (!isRecoveryKeyId(value)) throw new Error("private_key");
  const raw = unhex(value);
  try {
    const id = await digest(raw);
    const signer = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const rotationProof = hex(new Uint8Array(await crypto.subtle.sign("HMAC", signer, encoder.encode("Medora recovery rotation v1"))));
    const rotationVerifier = await digest(encoder.encode(rotationProof));
    return { id, rotationProof, rotationVerifier, key: await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]) };
  } finally {
    raw.fill(0);
  }
}

function parameters(path, iv) {
  return { name: "AES-GCM", iv, additionalData: encoder.encode(JSON.stringify(["Medora private care", 1, ...path])), tagLength: 128 };
}

async function transform(records, work) {
  const result = structuredClone(records);
  for (const { kind, path, rows, key } of privateRows(result)) rows[key] = await work(kind, path, rows[key]);
  return result;
}

export function normalizePrivateCare(records) {
  if (!records) return records;
  const result = structuredClone(records);
  for (const { kind, rows, key } of privateRows(result)) {
    for (const field of privateFields[kind]) {
      if (rows[key][field] === "" || rows[key][field] === null) delete rows[key][field];
    }
  }
  return result;
}

export async function sealPrivateCare(records, recovery, withRotation = false) {
  if (!recovery) {
    if (hasPrivateText(records)) throw new Error("private_key");
    return records;
  }
  const result = await transform(records, async (kind, path, row) => {
    const fields = Object.fromEntries(privateFields[kind].filter(field => typeof row[field] === "string" && row[field])
      .map(field => [field, row[field]]));
    if (row.privateText || privateFields[kind].some(field => row[field] != null && typeof row[field] !== "string")) {
      throw new Error("private_corrupt");
    }
    const clean = withoutPrivateFields(kind, row);
    if (!Object.keys(fields).length) return clean;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plain = encoder.encode(JSON.stringify(fields));
    try {
      const data = await crypto.subtle.encrypt(parameters(path, iv), recovery.key, plain);
      return { ...clean, privateText: { iv: hex(iv), data: base64(data) } };
    } finally {
      plain.fill(0);
    }
  });
  return { ...result, privacyVersion: 1, privacyKey: recovery.id,
    ...(withRotation && { privacyRotation: recovery.rotationVerifier }) };
}

export async function openPrivateCare(records, recovery) {
  if (!records || records.privacyVersion === undefined) return records;
  if (!recovery || recovery.id !== records.privacyKey ||
      (records.privacyRotation && recovery.rotationVerifier !== records.privacyRotation)) throw new Error("private_key");
  try {
    const result = await transform(records, async (kind, path, row) => {
      const clean = withoutPrivateFields(kind, row);
      if (!row.privateText) return clean;
      if (!validPrivateText(row.privateText)) throw new Error("invalid_envelope");
      const { iv, data } = row.privateText;
      const plain = new Uint8Array(await crypto.subtle.decrypt(parameters(path, unhex(iv)), recovery.key,
        Uint8Array.from(atob(data), char => char.charCodeAt(0))));
      try {
        const fields = JSON.parse(decoder.decode(plain));
        if (!Object.entries(fields).every(([field, value]) => privateFields[kind].includes(field) && typeof value === "string")) {
          throw new Error("invalid_private_fields");
        }
        return { ...clean, ...fields };
      } finally {
        plain.fill(0);
      }
    });
    delete result.privacyVersion;
    delete result.privacyKey;
    delete result.privacyRotation;
    return result;
  } catch {
    throw new Error("private_corrupt");
  }
}
