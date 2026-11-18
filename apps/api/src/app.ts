import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { secureHeaders } from "hono/secure-headers";
import { credentials, operation } from "@medora/contracts";
import { digest, login, type VerifyPassword } from "./auth";
import { Conflict, type Repository } from "./repository";

import type { ObjectStorage } from "./objects";
import { saveBackup, readBackup } from "./backups";

import { contract } from "./openapi";
import { identityRoutes } from "./identity-routes";
import type { IdentityService } from "./identity";
import type { FamilyService } from "./family";
import { familyRoutes } from "./family-routes";
const cookie = "__Host-medora_v2";
export function createApp(
  store: Repository,
  verify: VerifyPassword,
  storage?: ObjectStorage,
  publicOrigin?: string,
  identity?: IdentityService,
  family?: FamilyService,
) {
  const app = new Hono<{ Variables: { owner: string } }>();
  app.use("*", secureHeaders());
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    if (
      !["GET", "HEAD"].includes(c.req.method) &&
      c.req.header("Origin") !== (publicOrigin ?? new URL(c.req.url).origin)
    )
      return c.json({ error: "forbidden" }, 403);
    await next();
  });
  app.use(
    "/api/v2/session",
    bodyLimit({
      maxSize: 8192,
      onError: (c) => c.json({ error: "too_large" }, 413),
    }),
  );
  app.use(
    "/api/v2/changes",
    bodyLimit({
      maxSize: 8192,
      onError: (c) => c.json({ error: "too_large" }, 413),
    }),
  );
  app.onError((error, c) =>
    error instanceof Conflict
      ? c.json({ error: error.message }, 409)
      : c.json({ error: "unavailable" }, 503),
  );
  app.get("/api/v2/health", async (c) => {
    await store.ready();
    return c.json({ status: "ok" });
  });
  app.get("/api/v2/openapi.json", (c) => c.json(contract));
  app.post("/api/v2/session", async (c) => {
    if (c.req.header("Content-Type")?.split(";")[0] !== "application/json")
      return c.json({ error: "media_type" }, 415);
    const input = credentials.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ error: "invalid" }, 400);
    const result = await login(
      store,
      verify,
      input.data.username,
      input.data.password,
    );
    if (result.status !== 200)
      return c.json(
        { error: result.status === 429 ? "rate_limit" : "credentials" },
        result.status,
      );
    setCookie(c, cookie, result.value, {
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
      path: "/",
      maxAge: 86400,
    });
    return c.json({ ok: true });
  });
  if (identity) {
    app.use(
      "/api/v2/identity/*",
      bodyLimit({
        maxSize: 8192,
        onError: (c) => c.json({ error: "too_large" }, 413),
      }),
    );
    app.route("/api/v2/identity", identityRoutes(identity));
  }
  app.use("/api/v2/*", async (c, next) => {
    const raw = getCookie(c, cookie);
    const owner =
      raw && /^[a-f0-9]{64}$/.test(raw)
        ? await store.session(await digest(raw))
        : undefined;
    if (!owner) return c.json({ error: "session" }, 401);
    if (
      (c.req.path === "/api/v2/changes" ||
        c.req.path === "/api/v2/families" ||
        c.req.path.startsWith("/api/v2/backups")) &&
      c.req.header("X-Medora-Owner") !== owner
    )
      return c.json({ error: "account_changed" }, 409);
    if (
      c.req.method === "POST" &&
      ["/api/v2/changes", "/api/v2/backups", "/api/v2/families"].includes(
        c.req.path,
      )
    ) {
      const limit = c.req.path === "/api/v2/changes" ? 1000 : 100;
      if (
        !(await store.loginBudget("write:" + c.req.path + ":" + owner, limit))
      ) {
        c.header("Retry-After", "900");
        return c.json({ error: "rate_limit" }, 429);
      }
    }
    c.set("owner", owner);
    await next();
  });
  app.get("/api/v2/session", (c) => c.json({ owner: c.get("owner") }));
  app.delete("/api/v2/session", async (c) => {
    await store.endSession(await digest(getCookie(c, cookie)!));
    deleteCookie(c, cookie, { path: "/", secure: true });
    return c.body(null, 204);
  });
  app.get("/api/v2/changes", async (c) => {
    const raw = c.req.query("after") ?? "0";
    if (!/^\d{1,16}$/.test(raw) || !Number.isSafeInteger(Number(raw)))
      return c.json({ error: "cursor" }, 400);
    return c.json({ changes: await store.pull(c.get("owner"), Number(raw)) });
  });
  app.post("/api/v2/changes", async (c) => {
    if (c.req.header("Content-Type")?.split(";")[0] !== "application/json")
      return c.json({ error: "media_type" }, 415);
    const op = operation.safeParse(await c.req.json().catch(() => null));
    if (!op.success) return c.json({ error: "invalid" }, 400);
    return c.json(await store.push(c.get("owner"), op.data));
  });
  app.use(
    "/api/v2/backups",
    bodyLimit({
      maxSize: 16777216,
      onError: (c) => c.json({ error: "too_large" }, 413),
    }),
  );
  app.get("/api/v2/backups", async (c) =>
    c.json({ backups: await store.backups(c.get("owner")) }),
  );
  app.post("/api/v2/backups", async (c) => {
    if (!storage) return c.json({ error: "storage_unavailable" }, 503);
    if (c.req.header("Content-Type") !== "application/octet-stream")
      return c.json({ error: "media_type" }, 415);
    const saved = await saveBackup(
      store,
      storage,
      c.get("owner"),
      await c.req.arrayBuffer(),
    );
    return saved ? c.json(saved) : c.json({ error: "invalid_archive" }, 400);
  });
  app.get("/api/v2/backups/:id", async (c) => {
    if (!storage) return c.json({ error: "storage_unavailable" }, 503);
    const bytes = await readBackup(
      store,
      storage,
      c.get("owner"),
      c.req.param("id"),
    );
    if (!bytes) return c.json({ error: "missing" }, 404);
    return c.body(bytes, 200, {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="backup.medora"',
    });
  });
  if (family) {
    app.use(
      "/api/v2/families",
      bodyLimit({
        maxSize: 4096,
        onError: (c) => c.json({ error: "too_large" }, 413),
      }),
    );
    app.route("/api/v2/families", familyRoutes(family));
  }
  return app;
}
