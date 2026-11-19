import { smallJson } from "../http/validation.mjs";
import { mediaIdPattern, mediaResponse, readMedia } from "./media.mjs";
const publicPath = "/api/promotion";
const adminPath = "/api/admin/promotion";
export const activeAt = (row, now) =>
  row?.enabled &&
  !row.archived &&
  (row.startsAt == null || now >= row.startsAt) &&
  (row.endsAt == null || now < row.endsAt);

function reply(data, status = 200, cacheControl = "no-store") {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": cacheControl },
  });
}

function httpsUrl(value) {
  const target = URL.parse(value);
  return target?.protocol === "https:" && !target.username && !target.password;
}

export function validatedPromotion(value) {
  if (
    typeof value?.enabled !== "boolean" ||
    typeof value.title !== "string" ||
    typeof value.description !== "string" ||
    typeof value.url !== "string"
  )
    return null;
  const title = value.title.trim();
  const description = value.description.trim();
  const url = value.url.trim();
  if (
    !title ||
    title.length > 80 ||
    description.length > 240 ||
    url.length > 512 ||
    (url && !httpsUrl(url))
  )
    return null;
  const {
    mediaType = "",
    mediaUrl = "",
    mediaId = "",
    linkLabel = "",
    startsAt = null,
    endsAt = null,
    frequency = 1,
  } = value;
  if (
    !["", "image", "video"].includes(mediaType) ||
    typeof mediaUrl !== "string" ||
    typeof mediaId !== "string" ||
    (mediaId && !mediaIdPattern.test(mediaId)) ||
    (mediaId && mediaUrl) ||
    mediaUrl.length > 512 ||
    Boolean(mediaType) !== Boolean(mediaUrl || mediaId) ||
    (mediaUrl && !httpsUrl(mediaUrl)) ||
    typeof linkLabel !== "string" ||
    linkLabel.length > 40 ||
    ![startsAt, endsAt].every(
      (time) =>
        time === null ||
        (Number.isSafeInteger(time) && time >= 0 && time <= 8.64e15),
    ) ||
    (startsAt !== null && endsAt !== null && endsAt <= startsAt) ||
    !Number.isInteger(frequency) ||
    frequency < 1 ||
    frequency > 10
  )
    return null;
  return {
    title,
    description,
    url,
    enabled: value.enabled,
    mediaType,
    mediaUrl,
    mediaId,
    linkLabel: linkLabel.trim(),
    startsAt,
    endsAt,
    frequency,
  };
}

function permittedMedia(row, env) {
  if (!row?.mediaUrl) return true;
  const host = URL.parse(row.mediaUrl)?.hostname;
  return Boolean(
    host &&
    (env.PROMOTION_MEDIA_HOSTS ?? "")
      .toLowerCase()
      .split(",")
      .some((value) => value.trim() === host),
  );
}

function creative(row, prefix, env) {
  if (!permittedMedia(row, env)) return { ...row, mediaType: "", mediaUrl: "" };
  if (!row?.mediaId) return row;
  const { mediaId, ...copy } = row;
  return { ...copy, mediaUrl: `${prefix}/media/${mediaId}` };
}

export async function routePromotions(
  request,
  env,
  url,
  services,
  origin = url.origin,
) {
  const { promotions, cache, waitUntil, audit, signedIn, eventBudget } =
    services;
  const path = url.pathname;
  const method = request.method;
  const cacheKey = new Request(new URL(publicPath, url.origin));
  if (path === publicPath && method === "GET") {
    if (!env.ADMIN_EMAIL?.trim()) return reply({ promotion: null });
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    const { current, ttl } = await promotions.current();
    const response = reply(
      { promotion: creative(current, services.mediaPath(publicPath), env) },
      200,
      `public, max-age=${ttl}`,
    );
    if (ttl > 0) waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  }
  if (path === publicPath + "/events" && method === "POST") {
    if (request.headers.get("Origin") !== origin)
      return reply({ error: "forbidden" }, 403);
    const { id, event } = (await smallJson(request, 256)) ?? {};
    if (
      typeof id !== "string" ||
      !mediaIdPattern.test(id) ||
      !["impression", "click"].includes(event)
    )
      return reply({ error: "bad_request" }, 400);
    if (!(await eventBudget(request))) {
      return reply({ error: "rate_limit" }, 429);
    }
    waitUntil(promotions.count(id, event));
    return new Response(null, { status: 204 });
  }

  const admin = path.startsWith(adminPath);
  let email;
  if (admin) {
    email = await signedIn(request);
    if (!email) return reply({ error: "sign_in" }, 401);
    if (email !== env.ADMIN_EMAIL?.trim().toLowerCase())
      return reply({ error: "forbidden" }, 403);
    if (
      !["GET", "HEAD"].includes(method) &&
      request.headers.get("Origin") !== origin
    )
      return reply({ error: "forbidden" }, 403);
  }
  const prefix = admin ? adminPath : publicPath;
  if (path.startsWith(prefix + "/media/") && ["GET", "HEAD"].includes(method)) {
    const id = path.slice((prefix + "/media/").length);
    if (!mediaIdPattern.test(id)) return reply({ error: "not_found" }, 404);
    if (
      !admin &&
      (!env.ADMIN_EMAIL?.trim() ||
        (await promotions.current()).current?.mediaId !== id)
    ) {
      return reply({ error: "not_found" }, 404);
    }
    return mediaResponse(
      await promotions.mediaMeta(id),
      request,
      (first, last) => promotions.mediaBytes(id, first, last),
      !admin,
    );
  }
  if (!admin) return reply({ error: "method" }, 405);
  if (path === adminPath + "/media" && method === "POST") {
    const media = await readMedia(request).catch(() => null);
    if (!media) return reply({ error: "invalid_media" }, 400);
    const result = await promotions.storeMedia(
      media.bytes,
      media.type,
      request.headers.get("X-Medora-Filename"),
    );
    return result ? reply(result, 201) : reply({ error: "media_limit" }, 409);
  }
  if (path === adminPath + "/media") {
    if (method === "GET") return reply({ assets: await promotions.library() });
    if (method === "DELETE") {
      const { id } = (await smallJson(request, 256)) ?? {};
      if (typeof id !== "string" || !mediaIdPattern.test(id))
        return reply({ error: "bad_request" }, 400);
      const deleted = await promotions.removeMedia(id);
      if (!deleted) return reply({ error: "media_in_use_or_missing" }, 409);
      waitUntil(audit(email, "media_removed"));
      return reply({ assets: await promotions.library() });
    }
  }
  if (path === adminPath + "/preview") {
    if (method === "GET")
      return reply({
        promotion: creative(
          await promotions.preview(),
          services.mediaPath(adminPath),
          env,
        ),
      });
    if (method === "PUT") {
      const row = validatedPromotion(await smallJson(request, 4096));
      if (
        !row ||
        !permittedMedia(row, env) ||
        !(await promotions.savePreview(row))
      )
        return reply({ error: "invalid_promotion" }, 400);
      return reply({});
    }
  }
  if (path !== adminPath) return reply({ error: "not_found" }, 404);
  if (method === "GET") return reply(await promotions.dashboard());
  if (method === "DELETE") {
    const { id } = (await smallJson(request, 256)) ?? {};
    if (typeof id !== "string" || !mediaIdPattern.test(id))
      return reply({ error: "bad_request" }, 400);
    if (!(await promotions.removeArchived(id)))
      return reply({ error: "campaign_missing_or_active" }, 409);
    waitUntil(audit(email, "campaign_removed"));
    return reply(await promotions.dashboard());
  }
  if (method !== "PUT") return reply({ error: "method" }, 405);
  const body = await smallJson(request, 4096);
  const row = validatedPromotion(body);
  if (
    !row ||
    !permittedMedia(row, env) ||
    !(await promotions.validMedia(row)) ||
    (body.id != null &&
      (typeof body.id !== "string" || !mediaIdPattern.test(body.id)))
  ) {
    return reply({ error: "invalid_promotion" }, 400);
  }
  const current = await promotions.save(
    row,
    body.id,
    body.archived === true,
    body.create === true,
  );
  if (!current) return reply({ error: "campaign_limit_or_missing" }, 409);
  waitUntil(cache.delete(cacheKey));
  waitUntil(
    audit(email, body.archived ? "campaign_archived" : "campaign_updated"),
  );
  return reply(await promotions.dashboard(current.id));
}
