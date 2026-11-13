import { DurableObject } from "cloudflare:workers";
import { isAdminEmail, signedInEmail } from "../accounts/email-auth.mjs";
import { logOperation } from "../operations/routes.mjs";
import { smallJson } from "../http/validation.mjs";
import { mediaIdPattern, mediaResponse, readMedia } from "./media.mjs";

const publicPath = "/api/promotion";
const adminPath = "/api/admin/promotion";
const chunkSize = 128 * 1024;
const activeAt = (row, now) => row?.enabled && !row.archived &&
  (row.startsAt == null || now >= row.startsAt) && (row.endsAt == null || now < row.endsAt);

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
  if (!title || title.length > 80 || description.length > 240 || url.length > 512 || (url && !httpsUrl(url))) return null;
  const { mediaType = "", mediaUrl = "", mediaId = "", linkLabel = "", startsAt = null, endsAt = null } = value;
  if (!["", "image", "video"].includes(mediaType) || typeof mediaUrl !== "string" ||
      typeof mediaId !== "string" || (mediaId && !mediaIdPattern.test(mediaId)) || (mediaId && mediaUrl) ||
      mediaUrl.length > 512 || Boolean(mediaType) !== Boolean(mediaUrl || mediaId) ||
      (mediaUrl && !httpsUrl(mediaUrl)) || typeof linkLabel !== "string" || linkLabel.length > 40 ||
      ![startsAt, endsAt].every(time => time === null || (Number.isSafeInteger(time) && time >= 0 && time <= 8.64e15)) ||
      (startsAt !== null && endsAt !== null && endsAt <= startsAt)) return null;
  return { title, description, url, enabled: value.enabled, mediaType, mediaUrl, mediaId, linkLabel: linkLabel.trim(), startsAt, endsAt };
}

function creative(row, prefix) {
  if (!row?.mediaId) return row;
  const { mediaId, ...copy } = row;
  return { ...copy, mediaUrl: `${prefix}/media/${mediaId}` };
}

export async function handlePromotions(request, env, ctx, url) {
  const path = url.pathname;
  const method = request.method;
  const promotions = env.PROMOTIONS.getByName("home");
  const cacheKey = new Request(new URL(publicPath, url.origin));
  if (path === publicPath && method === "GET") {
    if (!env.ADMIN_EMAIL?.trim()) return reply({ promotion: null });
    const cached = await caches.default.match(cacheKey);
    if (cached) return cached;
    const { current, ttl } = await promotions.current();
    const response = reply({ promotion: creative(current, publicPath) }, 200, `public, max-age=${ttl}`);
    if (ttl > 0) ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
    return response;
  }
  if (path === publicPath + "/events" && method === "POST") {
    if (request.headers.get("Origin") !== url.origin) return reply({ error: "forbidden" }, 403);
    const { id, event } = await smallJson(request, 256) ?? {};
    if (typeof id !== "string" || !mediaIdPattern.test(id) || !["impression", "click"].includes(event)) return reply({ error: "bad_request" }, 400);
    if (env.PROMOTION_EVENT_LIMIT && !(await env.PROMOTION_EVENT_LIMIT.limit({ key: request.headers.get("CF-Connecting-IP") ?? "unknown" })).success) {
      return reply({ error: "rate_limit" }, 429);
    }
    ctx.waitUntil(promotions.count(id, event));
    return new Response(null, { status: 204 });
  }

  const admin = path.startsWith(adminPath);
  let email;
  if (admin) {
    email = await signedInEmail(request, env);
    if (!email) return reply({ error: "sign_in" }, 401);
    if (!isAdminEmail(email, env)) return reply({ error: "forbidden" }, 403);
    if (!["GET", "HEAD"].includes(method) && request.headers.get("Origin") !== url.origin) return reply({ error: "forbidden" }, 403);
  }
  const prefix = admin ? adminPath : publicPath;
  if (path.startsWith(prefix + "/media/") && ["GET", "HEAD"].includes(method)) {
    const id = path.slice((prefix + "/media/").length);
    if (!mediaIdPattern.test(id)) return reply({ error: "not_found" }, 404);
    if (!admin && (!env.ADMIN_EMAIL?.trim() || (await promotions.current()).current?.mediaId !== id)) {
      return reply({ error: "not_found" }, 404);
    }
    return mediaResponse(await promotions.mediaMeta(id), request, (first, last) => promotions.mediaBytes(id, first, last), !admin);
  }
  if (!admin) return reply({ error: "method" }, 405);
  if (path === adminPath + "/media" && method === "POST") {
    const media = await readMedia(request).catch(() => null);
    if (!media) return reply({ error: "invalid_media" }, 400);
    const result = await promotions.storeMedia(media.bytes, media.type);
    return result ? reply(result, 201) : reply({ error: "media_limit" }, 409);
  }
  if (path === adminPath + "/preview") {
    if (method === "GET") return reply({ promotion: creative(await promotions.preview(), adminPath) });
    if (method === "PUT") {
      const row = validatedPromotion(await smallJson(request, 4096));
      if (!row || !await promotions.validMedia(row)) return reply({ error: "invalid_promotion" }, 400);
      await promotions.savePreview(row);
      return reply({});
    }
  }
  if (path !== adminPath) return reply({ error: "not_found" }, 404);
  if (method === "GET") return reply(await promotions.dashboard());
  if (method === "DELETE") {
    const { id } = await smallJson(request, 256) ?? {};
    if (typeof id !== "string" || !mediaIdPattern.test(id)) return reply({ error: "bad_request" }, 400);
    if (!await promotions.removeArchived(id)) return reply({ error: "campaign_missing_or_active" }, 409);
    const audit = logOperation(env, email, "campaign_removed");
    if (audit) ctx.waitUntil(audit);
    return reply(await promotions.dashboard());
  }
  if (method !== "PUT") return reply({ error: "method" }, 405);
  const body = await smallJson(request, 4096);
  const row = validatedPromotion(body);
  if (!row || !await promotions.validMedia(row) || (body.id != null && (typeof body.id !== "string" || !mediaIdPattern.test(body.id)))) {
    return reply({ error: "invalid_promotion" }, 400);
  }
  const current = await promotions.save(row, body.id, body.archived === true, body.create === true);
  if (!current) return reply({ error: "campaign_limit_or_missing" }, 409);
  ctx.waitUntil(caches.default.delete(cacheKey));
  const audit = logOperation(env, email, body.archived ? "campaign_archived" : "campaign_updated");
  if (audit) ctx.waitUntil(audit);
  return reply(await promotions.dashboard(current.id));
}

export class Promotions extends DurableObject {
  async campaigns(storage = this.ctx.storage) {
    const campaigns = await storage.get("campaigns");
    if (campaigns) return campaigns;
    const legacy = await storage.get("promotion");
    return legacy ? [legacy] : [];
  }

  async current() {
    const rows = await this.campaigns();
    const now = Date.now();
    const current = rows.find(row => activeAt(row, now)) ?? null;
    const times = rows.filter(row => row.enabled && !row.archived)
      .flatMap(row => [row.startsAt, row.endsAt]).filter(time => time > now);
    return { current, ttl: Math.min(60, Math.floor((Math.min(...times) - now) / 1000)) };
  }

  async dashboard(id) {
    const campaigns = await this.campaigns();
    const counters = campaigns.length ? await this.ctx.storage.get(campaigns.map(row => "count:" + row.id)) : new Map();
    const rows = campaigns.map(row => ({ ...row, stats: counters.get("count:" + row.id) ?? { impression: 0, click: 0 } }));
    return { promotion: (id ? rows.find(row => row.id === id) : rows[0]) ?? null, campaigns: rows };
  }

  async save(row, id, archived, create) {
    return this.ctx.storage.transaction(async storage => {
      const rows = await this.campaigns(storage);
      const previous = create ? null : id ? rows.find(entry => entry.id === id) : rows[0];
      if ((id && !previous) || (!previous && rows.length >= 40)) return null;
      const same = previous && ["title", "description", "url", "mediaType", "mediaUrl", "mediaId", "linkLabel"]
        .every(key => (previous[key] ?? "") === row[key]);
      const current = { ...row, enabled: row.enabled && !archived, archived, id: same ? previous.id : crypto.randomUUID() };
      const next = [current, ...rows.filter(entry => entry.id !== previous?.id)];
      await storage.put("campaigns", next);
      if (previous && !same) await storage.delete("count:" + previous.id);
      return current;
    });
  }

  async count(id, event) {
    await this.ctx.storage.transaction(async storage => {
      if (!(await this.campaigns(storage)).some(row => row.id === id && activeAt(row, Date.now()))) return;
      const key = "count:" + id;
      const stats = await storage.get(key) ?? { impression: 0, click: 0 };
      stats[event]++;
      await storage.put(key, stats);
    });
  }

  async removeArchived(id) {
    return this.ctx.storage.transaction(async storage => {
      const rows = await this.campaigns(storage);
      if (!rows.some(row => row.id === id && row.archived)) return false;
      await storage.put("campaigns", rows.filter(row => row.id !== id));
      await storage.delete("count:" + id);
      return true;
    });
  }

  preview() { return this.ctx.storage.get("preview"); }
  savePreview(row) { return this.ctx.storage.put("preview", { ...row, enabled: false }); }
  mediaMeta(id) { return this.ctx.storage.get("meta:" + id); }

  async validMedia(row) {
    if (!row.mediaId) return true;
    const meta = await this.mediaMeta(row.mediaId);
    return meta?.type.startsWith(row.mediaType + "/") ?? false;
  }

  async storeMedia(bytes, type) {
    const id = crypto.randomUUID();
    const size = bytes.byteLength;
    return this.ctx.storage.transaction(async storage => {
      let assets = await storage.get("assets") ?? [];
      const now = Date.now();
      const [rows, preview] = await Promise.all([this.campaigns(storage), storage.get("preview")]);
      const used = new Set([...rows.map(row => row.mediaId), preview?.mediaId]);
      const expired = assets.filter(asset => !used.has(asset.id) && asset.createdAt < now - 24 * 60 * 60_000);
      if (expired.length) {
        const expiredIds = new Set(expired.map(asset => asset.id));
        assets = assets.filter(asset => !expiredIds.has(asset.id));
        for (const asset of expired) {
          const keys = Array.from({ length: Math.ceil(asset.size / chunkSize) }, (_, index) => `media:${asset.id}:${index}`);
          await storage.delete(["meta:" + asset.id, ...keys]);
        }
        await storage.put("assets", assets);
      }
      if (assets.length >= 50 || assets.reduce((total, asset) => total + asset.size, size) > 96 * 1024 * 1024) return null;
      const entries = { ["meta:" + id]: { type, size }, assets: [...assets, { id, size, createdAt: now }] };
      for (let offset = 0; offset < size; offset += chunkSize) {
        entries[`media:${id}:${offset / chunkSize}`] = bytes.slice(offset, offset + chunkSize);
      }
      await storage.put(entries);
      return { id, mediaType: type.split("/")[0], size };
    });
  }

  async mediaBytes(id, first, last) {
    const start = Math.floor(first / chunkSize);
    const end = Math.floor(last / chunkSize);
    const keys = Array.from({ length: end - start + 1 }, (_, index) => `media:${id}:${index + start}`);
    const chunks = await this.ctx.storage.get(keys);
    const bytes = new Uint8Array(last - first + 1);
    let offset = 0;
    for (const [index, key] of keys.entries()) {
      const chunk = chunks.get(key).subarray(index === 0 ? first % chunkSize : 0);
      const section = chunk.subarray(0, bytes.length - offset);
      bytes.set(section, offset);
      offset += section.byteLength;
    }
    return bytes;
  }
}
