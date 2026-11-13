import { DurableObject } from "cloudflare:workers";
import { isAdminEmail, signedInEmail } from "../accounts/email-auth.mjs";
import { smallJson } from "../http/validation.mjs";

const publicPath = "/api/promotion";

function reply(data, status = 200, cacheControl = "no-store") {
  return Response.json(data, { status, headers: { "Cache-Control": cacheControl } });
}

function httpsUrl(value) {
  const target = URL.parse(value);
  return target?.protocol === "https:" && !target.username && !target.password;
}

function validatedPromotion(value) {
  if (typeof value?.enabled !== "boolean" || typeof value.title !== "string" ||
      typeof value.description !== "string" || typeof value.url !== "string") return null;
  const title = value.title.trim();
  const description = value.description.trim();
  const url = value.url.trim();
  if (!title || title.length > 80 || description.length > 240 || url.length > 512) return null;
  if (url && !httpsUrl(url)) return null;
  const { mediaType = "", mediaUrl = "", linkLabel = "", startsAt = null, endsAt = null } = value;
  if (!["", "image", "video"].includes(mediaType) || typeof mediaUrl !== "string" ||
      mediaUrl.length > 512 || Boolean(mediaType) !== Boolean(mediaUrl) ||
      (mediaUrl && !httpsUrl(mediaUrl)) || typeof linkLabel !== "string" || linkLabel.length > 40 ||
      ![startsAt, endsAt].every(time => time === null || (Number.isSafeInteger(time) && time >= 0 && time <= 8.64e15)) ||
      (startsAt !== null && endsAt !== null && endsAt <= startsAt)) return null;
  return { title, description, url, enabled: value.enabled, mediaType, mediaUrl, linkLabel: linkLabel.trim(), startsAt, endsAt };
}

export async function handlePromotions(request, env, ctx, url) {
  const publicRequest = url.pathname === publicPath;
  if (publicRequest && request.method !== "GET") return reply({ error: "method" }, 405);
  if (publicRequest && !env.ADMIN_EMAIL?.trim()) return reply({ promotion: null });
  const cacheKey = new Request(new URL(publicPath, url.origin));
  const promotions = env.PROMOTIONS.getByName("home");
  if (publicRequest) {
    const cached = await caches.default.match(cacheKey);
    if (cached) return cached;
    const current = await promotions.get();
    const now = Date.now();
    const active = current?.enabled && (current.startsAt == null || now >= current.startsAt) &&
      (current.endsAt == null || now < current.endsAt);
    const nextChange = [current?.startsAt, current?.endsAt].filter(time => time > now);
    const ttl = Math.min(60, Math.floor((Math.min(...nextChange) - now) / 1000));
    const response = reply({ promotion: active ? current : null }, 200, `public, max-age=${ttl}`);
    if (ttl > 0) ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
    return response;
  }

  if (!["GET", "PUT"].includes(request.method)) return reply({ error: "method" }, 405);
  const email = await signedInEmail(request, env);
  if (!email) return reply({ error: "sign_in" }, 401);
  if (!isAdminEmail(email, env)) return reply({ error: "forbidden" }, 403);
  if (request.method === "GET") return reply({ promotion: await promotions.get() });
  if (request.headers.get("Origin") !== url.origin) return reply({ error: "forbidden" }, 403);
  const promotion = validatedPromotion(await smallJson(request, 4096));
  if (!promotion) return reply({ error: "invalid_promotion" }, 400);
  const current = await promotions.save(promotion);
  ctx.waitUntil(caches.default.delete(cacheKey));
  return reply({ promotion: current });
}

export class Promotions extends DurableObject {
  async get() {
    return (await this.ctx.storage.get("promotion")) ?? null;
  }

  async save(promotion) {
    return this.ctx.storage.transaction(async storage => {
      const previous = await storage.get("promotion");
      const sameCreative = previous?.title === promotion.title &&
        previous.description === promotion.description && previous.url === promotion.url &&
        (previous.mediaType ?? "") === promotion.mediaType && (previous.mediaUrl ?? "") === promotion.mediaUrl &&
        (previous.linkLabel ?? "") === promotion.linkLabel;
      const current = { ...promotion, id: sameCreative ? previous.id : crypto.randomUUID() };
      await storage.put("promotion", current);
      return current;
    });
  }
}
