import { encryptNotification } from "@block65/webcrypto-web-push";

const encoder = new TextEncoder();

export async function pushTopic(tag) {
  // APNs rejects some otherwise URL-safe topics. A 32-character hex value is valid unpadded Base64URL.
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(tag));
  return Array.from(new Uint8Array(digest, 0, 16), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function sendPush(env, subscription, data, ttl, stillCurrent = async () => true) {
  if (env.MEDORA_PAUSE_PUSH === "true") return { status: "paused" };
  try {
    const endpoint = new URL(subscription.endpoint);
    const signer = env.PILOT.getByName("medora-vapid");
    const [authorization, body, topic] = await Promise.all([
      signer.authorization(endpoint.origin),
      encryptNotification(subscription, encoder.encode(JSON.stringify(data))),
      pushTopic(data.tag)
    ]);
    if (!await stillCurrent()) return { status: "superseded" };
    const response = await fetch(endpoint, {
      method: "POST", body, redirect: "manual", signal: AbortSignal.timeout(10_000),
      headers: {
        authorization, ttl: String(ttl), urgency: "high", topic,
        "content-encoding": "aes128gcm", "content-type": "application/octet-stream"
      }
    });
    const providerStatus = response.status;
    if (response.ok) {
      await response.body?.cancel().catch(() => {});
      return { status: "accepted", providerStatus };
    }
    const { reason } = await response.json().catch(() => ({}));
    const safeReason = typeof reason === "string" && /^[A-Za-z][A-Za-z0-9_]{1,47}$/.test(reason) ? reason : undefined;
    if (providerStatus === 404 || providerStatus === 410) return { status: "gone", providerStatus };
    return { status: "rejected", providerStatus, reason: safeReason };
  } catch {
    return { status: "failed" };
  }
}
