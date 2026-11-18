import type { releaseNotifications } from "./release-notifications";
import type { adminAccounts } from "./admin-accounts";
import { smallJson } from "../../../web/src/http/validation.mjs";
import type { promotionService } from "./promotions";
import { authenticatedOperations, publicOperations } from "./operations-routes";
import type { operationService } from "./operations";
import type { reminderService } from "./reminders";
import { legacyCookie, legacySession } from "./legacy-session";
import type { householdService } from "./household";
import { householdRoutes, type InviteDelivery } from "./household-routes";
import { careRoutes } from "./care-routes";
import type { CareService } from "./care";
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
interface AppServices {
  storage?: ObjectStorage | undefined;
  publicOrigin?: string | undefined;
  identity?: IdentityService | undefined;
  family?: FamilyService;
  care?: CareService;
  household?: ReturnType<typeof householdService>;
  inviteDelivery?: InviteDelivery | undefined;
  legacySessionKey?: string | undefined;
  reminders?: ReturnType<typeof reminderService>;
  operations?: ReturnType<typeof operationService>;
  promotions?: ReturnType<typeof promotionService>;
  accounts?: ReturnType<typeof adminAccounts>;
  exportOperations?: (actor: string) => Promise<Response>;
  release?: ReturnType<typeof releaseNotifications>;
}

export function createApp(
  store: Repository,
  verify: VerifyPassword,
  {
    storage,
    publicOrigin,
    identity,
    family,
    care,
    household,
    inviteDelivery,
    legacySessionKey,
    reminders,
    operations,
    promotions,
    accounts,
    exportOperations,
    release,
  }: AppServices = {},
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
    [error, error.cause].some(
      (e) =>
        typeof e === "object" &&
        e !== null &&
        "code" in e &&
        e.code === "22001",
    )
      ? c.json({ error: "care_too_large" }, 413)
      : error instanceof Conflict
        ? c.json({ error: error.message }, 409)
        : c.json({ error: "unavailable" }, 503),
  );
  app.get("/api/v2/health", async (c) => {
    await store.ready();
    return c.json({ status: "ok" });
  });
  app.get("/api/v2/product-writer", async (c) =>
    c.json({
      writer: await store.productWriter(),
      registrationAvailable: Boolean(identity),
    }),
  );
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
  if (operations) app.route("/api/v2", publicOperations(operations));
  app.get("/api/v2/operations/release", async (c) => {
    if (
      !release ||
      c.req.query("version") !== release.version ||
      (await store.productWriter()) !== "postgres"
    )
      return c.json({ error: "not_found" }, 404);
    return c.json({
      version: release.version,
      status: await release.publish(),
    });
  });
  async function requestOwner(c: Parameters<typeof getCookie>[0]) {
    const raw = getCookie(c, cookie);
    const owner =
      raw && /^[a-f0-9]{64}$/.test(raw)
        ? await store.session(await digest(raw))
        : undefined;
    if (owner || raw) return owner;
    const previous = await legacySession(
      getCookie(c, legacyCookie),
      legacySessionKey,
    );
    if (
      previous &&
      (await store.legacySession(previous.owner, previous.digest))
    )
      return previous.owner;
  }
  app.get("/api/v2/config", async (c) =>
    reminders && (await store.productWriter()) === "postgres"
      ? c.json({ publicKey: reminders.publicKey })
      : c.json({ error: "unconfigured" }, 503),
  );
  app.on(
    ["GET", "PUT", "POST"],
    ["/api/v2/reminders", "/api/v2/reminders/enroll", "/api/v2/reminders/test"],
    async (c) =>
      reminders && (await store.productWriter()) === "postgres"
        ? reminders.route(c.req.raw, () => requestOwner(c), publicOrigin)
        : c.json({ error: "unavailable" }, 503),
  );
  if (promotions)
    app.on(
      ["GET", "HEAD", "POST", "PUT", "DELETE"],
      [
        "/api/v2/promotion",
        "/api/v2/promotion/*",
        "/api/v2/admin/promotion",
        "/api/v2/admin/promotion/*",
      ],
      async (c) =>
        promotions.route(
          c.req.raw,
          async () => {
            const owner = await requestOwner(c);
            return owner ? (await store.profile(owner))?.email : undefined;
          },
          publicOrigin,
        ),
    );
  app.use("/api/v2/*", async (c, next) => {
    const owner = await requestOwner(c);
    if (!owner) return c.json({ error: "session" }, 401);
    if (
      (c.req.path === "/api/v2/household" ||
        c.req.path === "/api/v2/care" ||
        c.req.path === "/api/v2/changes" ||
        c.req.path === "/api/v2/families" ||
        c.req.path.startsWith("/api/v2/backups")) &&
      c.req.header("X-Medora-Owner") !== owner
    )
      return c.json({ error: "account_changed" }, 409);
    if (
      c.req.method === "POST" &&
      [
        "/api/v2/household",
        "/api/v2/care",
        "/api/v2/changes",
        "/api/v2/backups",
        "/api/v2/families",
      ].includes(c.req.path)
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
  if (operations)
    app.route(
      "/api/v2",
      authenticatedOperations(
        operations,
        async (owner) => (await store.profile(owner))?.email,
        { push: Boolean(reminders), email: Boolean(identity) },
      ),
    );
  if (operations && exportOperations)
    app.get("/api/v2/admin/operations/export", async (c) => {
      const profile = await store.profile(c.get("owner"));
      if (!profile || operations.role(profile.email) !== "admin")
        return c.json({ error: "forbidden" }, 403);
      return exportOperations(profile.email);
    });
  app.get("/api/v2/profile", async (c) => {
    const profile = await store.profile(c.get("owner"));
    return c.json(
      profile
        ? {
            ...profile,
            ...(operations?.role(profile.email) === "admin"
              ? { admin: true }
              : {}),
          }
        : null,
    );
  });
  if (accounts && operations) {
    const path = "/api/v2/admin/accounts";
    app.use(path, async (c, next) => {
      const account = await store.profile(c.get("owner"));
      if (!account || operations.role(account.email) !== "admin")
        return c.json({ error: "forbidden" }, 403);
      await next();
    });
    const usernamePattern = /^[a-z0-9_]{3,32}$/;
    app.get(path, async (c) => {
      const after = c.req.query("after") ?? "",
        query = (c.req.query("q") ?? "").trim().toLowerCase();
      return (after && !usernamePattern.test(after)) || query.length > 254
        ? c.json({ error: "bad_request" }, 400)
        : c.json(await accounts.list(after, query));
    });
    app.on(["PATCH", "DELETE"], path, async (c) => {
      const body = (await smallJson(c.req.raw)) as {
        username?: unknown;
        tag?: unknown;
      } | null;
      if (
        typeof body?.username !== "string" ||
        !usernamePattern.test(body.username) ||
        typeof body.tag !== "string" ||
        !/^[a-f0-9]{64}$/.test(body.tag)
      )
        return c.json({ error: "bad_request" }, 400);
      const raw = getCookie(c, cookie);
      const previous = raw
        ? undefined
        : await legacySession(getCookie(c, legacyCookie), legacySessionKey);
      const session = raw
        ? { digest: await digest(raw), legacy: false }
        : previous && { digest: previous.digest, legacy: true };
      if (!session) return c.json({ error: "reauthenticate" }, 403);
      const result = await accounts.change(
        c.get("owner"),
        session,
        body.username,
        body.tag,
        c.req.method === "DELETE",
      );
      return result.error
        ? c.json(
            { error: result.error },
            result.error === "reauthenticate" ? 403 : 409,
          )
        : c.json(result);
    });
  }
  if (household)
    app.route(
      "/api/v2/household",
      householdRoutes(household, inviteDelivery, publicOrigin),
    );
  if (care) app.route("/api/v2/care", careRoutes(care));
  app.get("/api/v2/session", (c) => c.json({ owner: c.get("owner") }));
  app.delete("/api/v2/session", async (c) => {
    const raw = getCookie(c, cookie);
    const previous = await legacySession(
      getCookie(c, legacyCookie),
      legacySessionKey,
    );
    const owner = c.get("owner");
    await store.endSessions(
      owner,
      raw && (await digest(raw)),
      previous?.owner === owner ? previous.digest : undefined,
    );
    deleteCookie(c, cookie, { path: "/", secure: true });
    if (previous) deleteCookie(c, legacyCookie, { path: "/", secure: true });
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
