import { encryptNotification, vapidHeaders } from "@block65/webcrypto-web-push";

const encoder = new TextEncoder();

export async function pushTopic(tag) {
  // APNs rejects some otherwise URL-safe topics. A 32-character hex value is valid unpadded Base64URL.
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(tag));
  return Array.from(new Uint8Array(digest, 0, 16), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function portablePush(config, paused) {
  return (subscription, data, ttl, stillCurrent) =>
    deliver(
      paused,
      async (origin) =>
        (await vapidHeaders({ endpoint: origin }, config)).headers
          .authorization,
      subscription,
      data,
      ttl,
      stillCurrent,
    );
}

export function sendPush(env, subscription, data, ttl, stillCurrent) {
  return deliver(
    env.MEDORA_PAUSE_PUSH === "true",
    (origin) => env.PILOT.getByName("medora-vapid").authorization(origin),
    subscription,
    data,
    ttl,
    stillCurrent,
  );
}

async function deliver(
  paused,
  authorizationFor,
  subscription,
  data,
  ttl,
  stillCurrent = async () => true,
) {
  if (paused) return { status: "paused" };
  try {
    const endpoint = new URL(subscription.endpoint);
    const [authorization, body, topic] = await Promise.all([
      authorizationFor(endpoint.origin),
      encryptNotification(subscription, encoder.encode(JSON.stringify(data))),
      pushTopic(data.tag),
    ]);
    if (!(await stillCurrent())) return { status: "superseded" };
    const response = await fetch(endpoint, {
      method: "POST",
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: {
        authorization,
        ttl: String(ttl),
        urgency: "high",
        topic,
        "content-encoding": "aes128gcm",
        "content-type": "application/octet-stream",
      },
    });
    const providerStatus = response.status;
    void response.body?.cancel().catch(() => {});
    if (response.ok) {
      return { status: "accepted", providerStatus };
    }
    if (providerStatus === 404 || providerStatus === 410)
      return { status: "gone", providerStatus };
    return { status: "rejected", providerStatus };
  } catch {
    return { status: "failed" };
  }
}
