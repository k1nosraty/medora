import { DurableObject } from "cloudflare:workers";
import { isAdminEmail, signedInEmail } from "./email-auth.mjs";
import { smallJson } from "./validation.mjs";

const publicPath = "/api/promotion";

function reply(data, status = 200, cacheControl = "no-store") {
  return Response.json(data, { status, headers: { "Cache-Control": cacheControl } });
}

function validatedPromotion(value) {
  if (typeof value?.enabled !== "boolean" || typeof value.title !== "string" ||
      typeof value.description !== "string" || typeof value.url !== "string") return null;
  const title = value.title.trim();
  const description = value.description.trim();
  const url = value.url.trim();
  if (!title || title.length > 80 || description.length > 240 || url.length > 512) return null;
  if (url) {
    const target = URL.parse(url);
    if (target?.protocol !== "https:" || target.username || target.password) return null;
  }
  return { title, description, url, enabled: value.enabled };
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
    const response = reply({ promotion: current?.enabled ? current : null }, 200, "public, max-age=60");
    ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
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
        previous.description === promotion.description && previous.url === promotion.url;
      const current = { ...promotion, id: sameCreative ? previous.id : crypto.randomUUID() };
      await storage.put("promotion", current);
      return current;
    });
  }
}
