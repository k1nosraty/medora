import { Hono } from "hono";
import { smallJson } from "@medora/server-shared/http/validation";
import type { operationService } from "./operations";

const clean = (value: unknown, max: number) =>
  typeof value === "string" && value.trim().length <= max ? value.trim() : "";
type Settings = { owner: string };
type Service = ReturnType<typeof operationService>;
export function publicOperations(service: Service) {
  const routes = new Hono();
  routes.get("/operations", async (c) => {
    const { flags, notice } = await service.config();
    const now = Date.now();
    return c.json({
      flags,
      notice:
        notice?.enabled &&
        (notice.start === null || notice.start <= now) &&
        (notice.end === null || now < notice.end)
          ? notice
          : null,
    });
  });
  routes.post("/operations/activity", async (c) => {
    if (!(await service.budget())) return c.json({ error: "rate_limit" }, 429);
    await service.count(["activity:open"]);
    return c.body(null, 204);
  });
  return routes;
}
export function authenticatedOperations(
  service: Service,
  emailFor: (owner: string) => Promise<string | undefined>,
  capabilities: { push: boolean; email: boolean },
) {
  const routes = new Hono<{ Variables: Settings }>();
  routes.get("/support", async (c) => {
    const email = await emailFor(c.get("owner"));
    return email
      ? c.json({ tickets: await service.tickets(email) })
      : c.json({ error: "sign_in" }, 401);
  });
  routes.post("/support", async (c) => {
    const email = await emailFor(c.get("owner"));
    if (!email) return c.json({ error: "sign_in" }, 401);
    const body = (await smallJson(c.req.raw)) as {
      message?: unknown;
      diagnostics?: Record<string, unknown>;
    } | null;
    const message = clean(body?.message, 1000);
    if (!message) return c.json({ error: "bad_request" }, 400);
    const details = body?.diagnostics;
    const diagnostics = details
      ? {
          version: clean(details.version, 64),
          platform: ["iOS", "Android", "Other"].includes(
            String(details.platform),
          )
            ? String(details.platform)
            : "Other",
          permission: ["granted", "denied", "default", "unavailable"].includes(
            String(details.permission),
          )
            ? String(details.permission)
            : "unavailable",
        }
      : null;
    const result = await service.addTicket(
      c.get("owner"),
      email,
      message,
      diagnostics,
    );
    if (result.signedOut) return c.json({ error: "sign_in" }, 401);
    if (result.disabled) return c.json({ error: "unavailable" }, 503);
    return result.ticket
      ? c.json({ ticket: result.ticket }, 201)
      : c.json({ error: "ticket_limit" }, 409);
  });
  routes.use("/admin/operations/*", async (c, next) => {
    const email = await emailFor(c.get("owner"));
    if (!email || !service.role(email))
      return c.json({ error: "forbidden" }, 403);
    await next();
  });
  routes.get("/admin/operations", async (c) => {
    const email = await emailFor(c.get("owner"));
    if (!email || service.role(email) !== "admin")
      return c.json({ error: "forbidden" }, 403);
    return c.json({
      ...(await service.dashboard()),
      configured: {
        ...capabilities,
        analytics: true,
        supportAccounts: service.supportAccounts,
      },
    });
  });
  routes.put("/admin/operations", async (c) => {
    const email = await emailFor(c.get("owner"));
    if (!email || service.role(email) !== "admin")
      return c.json({ error: "forbidden" }, 403);
    const config = (await smallJson(c.req.raw)) as {
      flags?: { promotions?: number; support?: number };
      notice?: {
        title?: unknown;
        message?: unknown;
        enabled?: boolean;
        start?: number | null;
        end?: number | null;
      };
    } | null;
    const notice = config?.notice,
      { promotions, support } = config?.flags ?? {};
    const title = clean(notice?.title, 80),
      message = clean(notice?.message, 240);
    const validRate = (rate: unknown): rate is number =>
      typeof rate === "number" &&
      Number.isInteger(rate) &&
      rate >= 0 &&
      rate <= 100;
    const validTime = (time: unknown): time is number | null =>
      time === null ||
      (typeof time === "number" && Number.isSafeInteger(time) && time > 0);
    if (
      !notice ||
      typeof notice.enabled !== "boolean" ||
      (notice.enabled && (!title || !message)) ||
      !validRate(promotions) ||
      !validRate(support) ||
      !validTime(notice.start) ||
      !validTime(notice.end) ||
      (notice.start !== null &&
        notice.end !== null &&
        notice.start >= notice.end)
    )
      return c.json({ error: "bad_request" }, 400);
    await service.saveConfig(
      {
        flags: { promotions, support },
        notice: {
          title,
          message,
          enabled: notice.enabled,
          start: notice.start,
          end: notice.end,
        },
      },
      email,
    );
    return c.json({});
  });
  routes.get("/admin/operations/access", async (c) =>
    c.json({ role: service.role((await emailFor(c.get("owner"))) ?? "") }),
  );
  routes.get("/admin/operations/tickets", async (c) =>
    c.json({
      tickets: await service.tickets(),
      role: service.role((await emailFor(c.get("owner"))) ?? ""),
    }),
  );
  routes.put("/admin/operations/tickets", async (c) => {
    const body = (await smallJson(c.req.raw)) as {
      id?: unknown;
      reply?: unknown;
      status?: unknown;
    } | null;
    const reply = clean(body?.reply, 1000);
    if (
      typeof body?.id !== "string" ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(body.id) ||
      (body.status !== "open" && body.status !== "closed") ||
      (body.reply && !reply)
    )
      return c.json({ error: "bad_request" }, 400);
    const email = await emailFor(c.get("owner"));
    if (!email || !service.role(email))
      return c.json({ error: "forbidden" }, 403);
    return (await service.replyTicket(body.id, reply, body.status, email))
      ? c.json({})
      : c.json({ error: "ticket_missing" }, 409);
  });
  return routes;
}
