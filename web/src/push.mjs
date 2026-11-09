import { encryptNotification } from "@block65/webcrypto-web-push";

const encoder = new TextEncoder();

export async function sendPush(env, subscription, data, ttl, stillCurrent = async () => true) {
  try {
    const endpoint = new URL(subscription.endpoint);
    const signer = env.PILOT.getByName("medora-vapid");
    const [authorization, body] = await Promise.all([
      signer.authorization(endpoint.origin),
      encryptNotification(subscription, encoder.encode(JSON.stringify(data)))
    ]);
    if (!await stillCurrent()) return { status: "superseded" };
    const response = await fetch(endpoint, {
      method: "POST", body, redirect: "manual", signal: AbortSignal.timeout(10_000),
      headers: {
        authorization, ttl: String(ttl), urgency: "high", topic: data.tag,
        "content-encoding": "aes128gcm", "content-type": "application/octet-stream"
      }
    });
    const providerStatus = response.status;
    await response.body?.cancel();
    if (response.ok) return { status: "accepted", providerStatus };
    if (providerStatus === 404 || providerStatus === 410) return { status: "gone", providerStatus };
    return { status: "rejected", providerStatus };
  } catch {
    return { status: "failed" };
  }
}
