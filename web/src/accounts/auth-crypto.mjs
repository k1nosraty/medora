import { scryptSync } from "node:crypto";

const encoder = new TextEncoder();

export function hex(bytes) {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}
export async function hmac(secret, purpose, value) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(`${purpose}:${value}`)));
}
export async function sessionHash(token) {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(token)));
}
export const equal = (left, right) => crypto.subtle.timingSafeEqual(encoder.encode(left), encoder.encode(right));
export function randomCode() {
  const value = new Uint32Array(1);
  do crypto.getRandomValues(value); while (value[0] >= 4_294_000_000);
  return String(value[0] % 1_000_000).padStart(6, "0");
}
export async function passwordProof(secret, password, salt) {
  const peppered = await hmac(secret, "password-v1", password);
  return hex(scryptSync(peppered, salt, 32, { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 }));
}
