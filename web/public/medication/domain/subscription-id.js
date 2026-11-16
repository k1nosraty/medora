const encoder = new TextEncoder();

async function fingerprint(value) {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(hash, 0, 16), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function subscriptionId({ endpoint, keys }) {
  return fingerprint(JSON.stringify(["medora-public-push", new URL(endpoint).href, keys.p256dh, keys.auth]));
}

export async function matchesSubscriptionId(id, subscription) {
  const endpoint = new URL(subscription.endpoint).href;
  // Pilot installations use an endpoint-only ID. Public enrollment never issues that ID.
  return id === await fingerprint(endpoint) || id === await subscriptionId(subscription);
}
