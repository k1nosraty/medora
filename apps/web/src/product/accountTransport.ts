import { careDelta } from "../../../../web/public/medication/domain/care-delta.js";

// Only the candidate negotiates the new writer. An installed legacy client has
// no route to PostgreSQL. A transition away from a writer requires a fresh page.
type Writer = {
  writer: "postgres" | "legacy" | "frozen";
  registrationAvailable?: boolean;
};
type Profile = { email: string; username: string; scope: string };
const json = (value: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(value, { status, ...(headers && { headers }) });
const unavailable = () => json({ error: "unavailable" }, 503);
const endpoint = (name: string) => "/api/v2/" + name;
let selection: Promise<Writer> | undefined;
async function selectWriter(): Promise<Writer> {
  const res = await fetch(endpoint("product-writer"), {
    cache: "no-store",
    signal: AbortSignal.timeout(4000),
  });
  // Older product servers can only route the unversioned protocol. A frozen
  // legacy runtime rejects it at both the Worker and object boundaries.
  if (!res.ok) {
    // Older versions report either their unknown route or their missing pilot
    // configuration here. Confirm the original API before choosing it.
    const error = await res.json().catch(() => null);
    if (
      res.status === 404 ||
      (res.status === 503 && error?.error === "unconfigured")
    ) {
      const session = await fetch("/api/auth/session", {
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });
      if (session.ok && typeof (await session.json()).available === "boolean")
        return { writer: "legacy" };
    }
    throw Error("Writer unavailable");
  }
  const mode = await res.json();
  if (mode.writer === "frozen" || mode.writer === "postgres") return mode;
  if (mode.writer === "legacy") return mode;
  throw Error("Unknown writer");
}
const request = (path: string, body: unknown, options: RequestInit = {}) =>
  fetch(endpoint(path), {
    ...options,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...Object.fromEntries(new Headers(options.headers)),
    },
    body: JSON.stringify(body),
  });
async function auth(route: string, options: RequestInit, mode: Writer) {
  async function session() {
    const res = await fetch(endpoint("profile"), { cache: "no-store" });
    if (res.status === 401)
      return json({
        available: true,
        registrationAvailable: mode.registrationAvailable,
        email: null,
      });
    if (!res.ok) return res;
    return json({
      available: true,
      registrationAvailable: mode.registrationAvailable,
      ...(await res.json()),
    });
  }
  if (route === "session") return session();
  const data = JSON.parse(String(options.body ?? "{}"));
  switch (route) {
    case "register-code":
    case "reset-code":
      return request("identity/challenges", {
        email: data.email,
        purpose: route === "reset-code" ? "reset" : "register",
      });
    case "confirm-email":
      return request("identity/confirm-email", {
        email: data.email,
        challenge: data.challenge,
        code: data.code,
      });
    case "reset-password":
      return request("identity/verify", {
        challenge: data.challenge,
        code: data.code,
        password: data.password,
      });
    case "register": {
      const [challenge, grant] = String(data.grant).split(".");
      const made = await request("identity/register", {
        challenge,
        grant,
        username: data.username,
        password: data.password,
      });
      if (!made.ok) return made;
      break;
    }
    case "login":
      break;
    case "logout": {
      const cleared = await fetch(endpoint("session"), { method: "DELETE" });
      return cleared.ok ? json({}) : cleared;
    }
    default:
      return unavailable();
  }
  const result = await request("session", {
    username: data.username,
    password: data.password,
  });
  return result.ok ? session() : result;
}
async function care(path: string, opts: RequestInit) {
  const who = await fetch(endpoint("profile"), {
    cache: "no-store",
    ...(opts.signal && { signal: opts.signal }),
  });
  if (!who.ok) return who;
  const profile: Profile = await who.json();
  const scope = profile.scope,
    owner = scope.split(".")[0]!;
  const headers = { "X-Medora-Owner": owner };
  const signal = opts.signal ? { signal: opts.signal } : {};
  if (!opts.method || opts.method === "GET") {
    const known = new Headers(opts.headers).get("If-None-Match");
    const version = known?.startsWith('"' + scope + ":")
      ? known.slice(scope.length + 2, -1)
      : undefined;
    const state = await fetch(endpoint("care"), {
      headers: {
        ...headers,
        ...(version && { "If-None-Match": '"' + owner + ":" + version + '"' }),
      },
      cache: "no-store",
      ...signal,
    });
    const responseHeaders = { "X-Medora-Care-Delta": "1" };
    if (state.status === 304 && known)
      return new Response(null, {
        status: 304,
        headers: { ...responseHeaders, ETag: known },
      });
    if (!state.ok) return state;
    const current = await state.json();
    if (current.owner !== owner) return json({ error: "conflict" }, 409);
    return json(
      {
        owner: scope,
        revision: current.revision,
        ...(path.endsWith("?zone")
          ? { zone: current.zone }
          : { records: current.revision === 0 ? null : current.records }),
      },
      200,
      { ...responseHeaders, ETag: '"' + scope + ":" + current.revision + '"' },
    );
  }
  const input = JSON.parse(String(opts.body));
  if (input.owner !== scope) return json({ error: "conflict" }, 409);
  let changes = opts.method === "PATCH" ? [] : input.changes;
  if (!changes) {
    const state = await fetch(endpoint("care"), {
      headers,
      cache: "no-store",
      ...signal,
    });
    if (!state.ok) return state;
    const current = await state.json();
    if (current.owner !== owner || current.revision !== input.revision)
      return json({ error: "conflict" }, 409);
    changes = careDelta(current.records, input.records);
    if (!changes) return json({ error: "invalid_sync" }, 400);
  }
  const result = await request(
    "care",
    {
      operation: crypto.randomUUID(),
      baseRevision: input.revision,
      changes,
      ...(input.zone && { zone: input.zone }),
      ...(input.rotationProof && { rotationProof: input.rotationProof }),
    },
    { ...opts, headers },
  );
  if (!result.ok) return result;
  const receipt = await result.json();
  return json({
    owner: scope,
    revision: receipt.revision,
    ...(opts.method === "PATCH"
      ? { zone: input.zone }
      : input.changes
        ? { applied: true }
        : { records: input.records }),
  });
}
export async function accountTransport(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  let mode: Writer;
  try {
    mode = await (selection ??= selectWriter());
  } catch {
    selection = undefined;
    return unavailable();
  }
  if (mode.writer === "legacy") return fetch(path, options);
  if (mode.writer === "frozen") return unavailable();
  if (path.startsWith("/api/auth/"))
    return auth(path.slice("/api/auth/".length), options, mode);
  if (path.startsWith("/api/family")) {
    const profile = await fetch(endpoint("profile"), {
      cache: "no-store",
      ...(options.signal && { signal: options.signal }),
    });
    if (!profile.ok) return profile;
    const { scope } = await profile.json();
    const headers = new Headers(options.headers);
    headers.set("X-Medora-Owner", scope.split(".")[0]);
    return fetch(
      endpoint("household") + (path.endsWith("?inbox=1") ? "?inbox=1" : ""),
      { ...options, headers },
    );
  }
  return care(path, options);
}
