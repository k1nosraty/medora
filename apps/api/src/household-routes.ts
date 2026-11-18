import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { householdCommand } from "@medora/contracts";
import { boundedCarePayload } from "../../../web/public/medication/domain/care-contract.js";
import { householdService } from "./household";
export type InviteDelivery = (
  email: string,
  link: URL,
  english: boolean,
  id: string,
) => Promise<void>;
export function householdRoutes(
  service: ReturnType<typeof householdService>,
  invite?: InviteDelivery,
  publicOrigin?: string,
) {
  const app = new Hono<{ Variables: { owner: string } }>();
  app.get("/", async (c) =>
    c.json(await service.home(c.get("owner"), c.req.query("inbox") === "1")),
  );
  app.use(
    "/",
    bodyLimit({
      maxSize: 65536,
      onError: (c) => c.json({ error: "too_large" }, 413),
    }),
  );
  app.post("/", async (c) => {
    if (c.req.header("Content-Type")?.split(";")[0] !== "application/json")
      return c.json({ error: "media_type" }, 415);
    const data = await c.req.json().catch(() => null);
    if (!boundedCarePayload(data)) return c.json({ error: "invalid" }, 400);
    const input = householdCommand.safeParse(data);
    if (!input.success) return c.json({ error: "invalid" }, 400);
    const result = await service.command(c.get("owner"), input.data);
    if ("error" in result) {
      const statuses = {
        invalid: 400,
        forbidden: 403,
        missing: 404,
        expired: 410,
        limit: 429,
        conflict: 409,
        sync_required: 409,
        already_recorded: 409,
        care_too_large: 413,
      } as const;
      return c.json(result, statuses[result.error!]);
    }
    if (invite && input.data.email && "invite" in result && result.invite) {
      // Origin has already been checked at ingress. The Node adapter can pin the public origin.
      const link = new URL(
        "/medication/#family-invite=" + result.invite,
        publicOrigin ?? new URL(c.req.url).origin,
      );
      const delivered = await invite(
        input.data.email,
        link,
        input.data.language === "en",
        result.invite,
      ).then(
        () => true,
        () => false,
      );
      return c.json({ ...result, delivered });
    }
    return c.json(result);
  });
  return app;
}
