import { Hono } from "hono";
import { boundedCarePayload } from "@medora/domain/browser/care-contract";
import { bodyLimit } from "hono/body-limit";
import { careCommit } from "@medora/contracts";
import { type CareService, InvalidCare } from "./care";
export function careRoutes(service: CareService) {
  const routes = new Hono<{ Variables: { owner: string } }>();
  routes.get("/", async (c) => {
    const state = await service.read(c.get("owner"));
    const tag = '"' + state.owner + ":" + state.revision + '"';
    c.header("ETag", tag);
    if (c.req.header("If-None-Match") === tag) return c.body(null, 304);
    return c.json(state);
  });
  routes.use(
    "/",
    bodyLimit({
      maxSize: 4 * 1024 * 1024,
      onError: (c) => c.json({ error: "too_large" }, 413),
    }),
  );
  routes.post("/", async (c) => {
    if (c.req.header("Content-Type")?.split(";")[0] !== "application/json")
      return c.json({ error: "media_type" }, 415);
    const data: unknown = await c.req.json().catch(() => null);
    if (!boundedCarePayload(data))
      return c.json({ error: "invalid_sync" }, 400);
    const input = careCommit.safeParse(data);
    if (!input.success) return c.json({ error: "invalid_sync" }, 400);
    try {
      return c.json(await service.write(c.get("owner"), input.data));
    } catch (error) {
      if (error instanceof InvalidCare)
        return c.json({ error: "invalid_sync" }, 400);
      throw error;
    }
  });
  return routes;
}
