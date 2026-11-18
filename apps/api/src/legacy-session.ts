import { createHmac, timingSafeEqual } from "node:crypto";
import { digest } from "./auth";

export const legacyCookie = "__Host-medora_session";

export async function legacySession(
  raw: string | undefined,
  key: string | undefined,
) {
  const match = raw?.match(/^([a-f0-9]{64})\.([a-f0-9]{64})\.([a-f0-9]{64})$/);
  if (!key || !match) return;
  const [, owner, token, signature] = match as [string, string, string, string];
  const expected = createHmac("sha256", key)
    .update("session-v1:" + owner + "." + token)
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) return;
  return { owner, digest: await digest(token) };
}
