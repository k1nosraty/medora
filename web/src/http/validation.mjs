const base64url = /^[A-Za-z0-9_-]+$/;

export function validSubject(value) {
  if (typeof value !== "string" || value.length > 256 || /[\s"\\]/.test(value)) return false;
  if (/^mailto:[^:@]+@[^:@]+\.[^:@]+$/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.includes(".") && !url.username && !url.password;
  } catch {
    return false;
  }
}

function decodedKey(value, length) {
  if (typeof value !== "string" || value.length !== Math.ceil(length * 4 / 3) || !base64url.test(value)) return null;
  const bytes = Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0));
  return bytes.length === length ? bytes : null;
}

export function pilotConfig(env) {
  if (decodedKey(env.VAPID_PUBLIC_KEY, 65)?.[0] !== 4 ||
      !decodedKey(env.VAPID_PRIVATE_KEY, 32) || !validSubject(env.VAPID_SUBJECT)) return null;
  return { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
}

export function validSubscription(value) {
  if (!value || typeof value.endpoint !== "string" || value.endpoint.length > 1800 ||
      decodedKey(value.keys?.p256dh, 65)?.[0] !== 4 || !decodedKey(value.keys?.auth, 16)) return null;

  let endpoint;
  try {
    endpoint = new URL(value.endpoint);
  } catch {
    return null;
  }
  if (endpoint.protocol !== "https:" || endpoint.port || endpoint.username || endpoint.password ||
      endpoint.search || endpoint.hash || !/^\/[A-Za-z0-9_./:-]{16,}$/.test(endpoint.pathname)) return null;

  const apple = /^[a-z0-9-]+\.push\.apple\.com$/.test(endpoint.hostname);
  const google = endpoint.hostname === "fcm.googleapis.com" && endpoint.pathname.startsWith("/fcm/send/");
  const mozilla = endpoint.hostname === "updates.push.services.mozilla.com" && endpoint.pathname.startsWith("/wpush/v2/");
  if (!apple && !google && !mozilla) return null;

  return { endpoint: endpoint.href, expirationTime: null, keys: { p256dh: value.keys.p256dh, auth: value.keys.auth } };
}

export async function validSubscriptionKey(subscription) {
  try {
    await crypto.subtle.importKey("raw", decodedKey(subscription.keys.p256dh, 65),
      { name: "ECDH", namedCurve: "P-256" }, false, []);
    return true;
  } catch {
    return false;
  }
}

export async function smallJson(request, limit = 4096) {
  if (!request.headers.get("content-type")?.startsWith("application/json") || !request.body) return null;
  const reader = request.body.getReader();
  const buffer = new Uint8Array(limit);
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (size + value.length > buffer.length) {
        await reader.cancel();
        return null;
      }
      buffer.set(value, size);
      size += value.length;
    }
    return JSON.parse(new TextDecoder().decode(buffer.subarray(0, size)));
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}
