import { timingSafeEqual } from "node:crypto";
import { validSchedule, reminderRequestLimit } from "./medication-schedule.mjs";
import {
  smallJson,
  validSubscription,
  validSubscriptionKey,
} from "../http/validation.mjs";
import {
  matchesSubscriptionId,
  subscriptionId,
} from "../../public/medication/domain/subscription-id.js";

const encoder = new TextEncoder();
const reply = (data, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

async function deviceSignature(secret, id) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const hash = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`medora-install-v1:${id}`),
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function routeReminders(
  request,
  url,
  service,
  origin = url.origin,
) {
  if (!/^[a-f0-9]{64}$/.test(service.signingKey))
    return reply({ error: "unconfigured" }, 503);
  if (request.method !== "GET" && request.headers.get("Origin") !== origin)
    return reply({ error: "unauthorized" }, 401);
  const authorization = request.headers.get("Authorization") ?? "";

  if (url.pathname === "/api/reminders/enroll" && request.method === "POST") {
    if (!(await service.enrollBudget(request)))
      return reply({ error: "rate_limit" }, 429);
    const body = await smallJson(request);
    const subscription = validSubscription(body?.subscription);
    if (!subscription || !(await validSubscriptionKey(subscription)))
      return reply({ error: "bad_subscription" }, 400);
    const id = await subscriptionId(subscription);
    return reply({
      token: `${id}.${await deviceSignature(service.signingKey, id)}`,
    });
  }

  const testing =
    url.pathname === "/api/reminders/test" && request.method === "POST";
  if (
    !testing &&
    (url.pathname !== "/api/reminders" ||
      !["PUT", "GET"].includes(request.method))
  )
    return reply({ error: "not_found" }, 404);
  const match = /^Bearer ([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(authorization);
  if (
    !match ||
    !timingSafeEqual(
      encoder.encode(match[2]),
      encoder.encode(await deviceSignature(service.signingKey, match[1])),
    )
  ) {
    return reply({ error: "unauthorized" }, 401);
  }
  if (!(await service.deviceBudget(match[1])))
    return reply({ error: "rate_limit" }, 429);
  const device = service.device(match[1]);
  if (testing) {
    const result = await device.test();
    return result.status === "revoked"
      ? reply({ error: "unauthorized" }, 401)
      : reply(result);
  }
  if (request.method === "GET") {
    const result = await device.status();
    return result.revoked
      ? reply({ error: "unauthorized" }, 401)
      : reply(result);
  }

  const body = await smallJson(request, reminderRequestLimit);
  if (
    !Number.isSafeInteger(body?.revision) ||
    body.revision < 1 ||
    typeof body.enabled !== "boolean" ||
    (body.revoke !== undefined && (body.revoke !== true || body.enabled))
  ) {
    return reply({ error: "bad_request" }, 400);
  }
  let plan = null;
  let link = null;
  let account;
  if (body.enabled) {
    const schedule = validSchedule(body);
    const subscription = validSubscription(body.subscription);
    if (
      !schedule ||
      !subscription ||
      !(await matchesSubscriptionId(match[1], subscription))
    ) {
      return reply({ error: "bad_schedule" }, 400);
    }
    plan = {
      ...schedule,
      subscription,
      language: body.language === "en" ? "en" : "fa",
    };
    if (body.account != null) {
      const { owner, revision, details } = body.account;
      if (
        typeof owner !== "string" ||
        !/^[a-f0-9]{64}(?:\.[a-f0-9]{32})?$/.test(owner) ||
        !Number.isSafeInteger(revision) ||
        revision < 0 ||
        typeof details !== "boolean"
      )
        return reply({ error: "bad_request" }, 400);
      account = await service.account(request, owner, revision);
      if (!account) return reply({ error: "sign_in" }, 401);
      link = { owner, revision, details };
    }
    // A registered device must be discoverable by backup even if this request is interrupted.
    await service.register(match[1]);
  }
  const saved = await device.replace(body.revision, plan, link, body.revoke);
  if (saved.linkRejected) return reply({ error: "sign_in" }, 401);
  if (saved.revoked && !body.revoke)
    return reply({ error: "unauthorized" }, 401);
  if (
    account &&
    saved.revision === body.revision &&
    !(await account.link(match[1]))
  ) {
    await device.detachAccountPlan(link.owner, body.revision);
    return reply({ error: "sign_in" }, 401);
  }
  return reply(
    saved.revoked
      ? { revision: saved.revision, enabled: false, revoked: true }
      : saved,
  );
}
