import { Hono } from "hono";
import { familyAction } from "@medora/contracts";
import type { FamilyService } from "./family";
export function familyRoutes(service: FamilyService) {
  const app = new Hono<{ Variables: { owner: string } }>();
  app.get("/", async (c) => c.json(await service.home(c.get("owner"))));
  app.post("/", async (c) => {
    if (c.req.header("Content-Type")?.split(";")[0] !== "application/json")
      return c.json({ error: "media_type" }, 415);
    const result = familyAction.safeParse(await c.req.json().catch(() => null));
    if (!result.success) return c.json({ error: "invalid" }, 400);
    const d = result.data,
      person = c.get("owner");
    let response;
    switch (d.action) {
      case "create":
        response = await service.create(person, d.label);
        break;
      case "invite":
        response = await service.invite(person, d.family, d.email);
        break;
      case "accept":
        response = await service.accept(person, d.invite);
        break;
      case "grant":
        response = await service.grant(person, d.family, d.viewer, d.allow);
        break;
      case "water":
        response = await service.water(person, d.family, d.owner, d.day);
        break;
    }
    return response
      ? c.json({ result: response })
      : c.json({ error: "unavailable" }, 404);
  });
  return app;
}
