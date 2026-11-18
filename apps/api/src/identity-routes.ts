import { Hono } from "hono";
import {
  identityBegin,
  identityFinish,
  emailConfirmation,
  grantedRegistration,
} from "@medora/contracts";
import type { IdentityService } from "./identity";
export function identityRoutes(service: IdentityService) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    if (c.req.header("Content-Type")?.split(";")[0] !== "application/json")
      return c.json({ error: "media_type" }, 415);
    await next();
  });
  app.post("/challenges", async (c) => {
    const parsed = identityBegin.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return c.json({ error: "invalid" }, 400);
    const id = await service.begin(
      parsed.data.email,
      parsed.data.purpose,
      parsed.data.language,
    );
    return id
      ? c.json({ challenge: id }, 202)
      : c.json({ error: "rate_limit" }, 429);
  });
  app.post("/confirm-email", async (c) => {
    const input = emailConfirmation.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!input.success) return c.json({ error: "invalid_code" }, 400);
    const grant = await service.confirmRegistration(
      input.data.challenge,
      input.data.email,
      input.data.code,
    );
    return grant
      ? c.json({ grant: input.data.challenge + "." + grant })
      : c.json({ error: "invalid_code" }, 400);
  });
  app.post("/register", async (c) => {
    const input = grantedRegistration.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!input.success) return c.json({ error: "invalid" }, 400);
    const { challenge, grant, password, username } = input.data;
    return (await service.finish(challenge, grant, password, username))
      ? c.json({ ok: true })
      : c.json({ error: "setup_expired" }, 401);
  });
  app.post("/verify", async (c) => {
    const parsed = identityFinish.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return c.json({ error: "invalid" }, 400);
    const { challenge, code, password, username } = parsed.data;
    return (await service.finish(challenge, code, password, username))
      ? c.json({ ok: true })
      : c.json({ error: "invalid_code" }, 400);
  });
  return app;
}
