import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const types = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json"
};

const actions = [];
const delayedAcknowledgements = new Set();
const group = "32100000-0000-4000-8000-000000000001";
const target = "32100000-0000-4000-8000-000000000002";

function json(response, data, status = 200) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(data));
}

export function browserServer(intercept) {
  const root = resolve(process.env.MEDORA_PUBLIC_DIR ?? fileURLToPath(new URL("../../apps/web/dist/", import.meta.url)));
  return createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    const { pathname } = url;
    if (await intercept?.(request, response, url)) return;
    const cookie = request.headers.cookie ?? "";
    if (pathname === "/api/v2/product-writer") { json(response, { writer: "legacy" }); return; }
    if (pathname === "/__browser-test/actions") { json(response, actions); return; }
    const pushKey = /(?:^|;\s*)test-push-key=([\w-]{87})(?:;|$)/.exec(cookie)?.[1];
    if (pathname === "/api/config" && pushKey) { json(response, { publicKey: pushKey }); return; }
    const familyMode = /test-family-policy=(read|write|revoked)/.exec(cookie)?.[1];
    if (pathname === "/api/family" && familyMode) {
      const allowed = familyMode === "write";
      const policy = { sections: ["water", "medicines", "doses"], record: allowed, add: allowed };
      if (request.method === "GET") {
        json(response, { label: "Me", invitations: [], groups: [{
          id: group, name: "Care circle", icon: "group", manager: true, pending: [],
          members: [{ id: target, label: "Alex", received: policy }]
        }] });
        return;
      }
      let body = "";
      for await (const part of request) body += part;
      const data = JSON.parse(body);
      if (familyMode === "revoked") json(response, { error: "forbidden" }, 403);
      else if (data.action === "view") {
        json(response, { label: "Alex", synced: true, zone: "UTC", revision: 1, policy,
          records: { profile: { firstName: "Alex" }, medicines: {}, doses: {}, water: [], waterGoal: 2000 } });
      } else {
        actions.push(data);
        const delay = /test-family-delay=([a-f0-9-]{36})/.exec(cookie)?.[1];
        if (delay && !delayedAcknowledgements.has(delay)) {
          delayedAcknowledgements.add(delay);
          json(response, { error: "unavailable" }, 503);
        } else json(response, { ok: true });
      }
      return;
    }
    if (pathname.startsWith("/api/")) {
      const account = request.headers.cookie?.includes("test-family=1");
      const data = pathname === "/api/auth/session" ? { available: true, email: account ? "care@example.test" : null } :
        pathname === "/api/operations" ? { flags: { promotions: 0, support: 100 }, notice: null } :
        pathname === "/api/family" ? account ? { groups: [], invitations: [{ id: "invite", name: "Sample", inviter: "Sample sender" }] } : { error: "sign_in" } : {};
      response.writeHead(data.error ? 401 : pathname === "/api/config" ? 503 : 200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(data));
      return;
    }
    if (pathname === "/") { response.end("Medora browser tests"); return; }
    const file = resolve(root, "." + pathname, pathname.endsWith("/") ? "index.html" : "");
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(404).end(); return; }
    try {
      const body = await readFile(file);
      response.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream",
        "Cache-Control": "no-cache", ...(pathname === "/sw.js" && { "Service-Worker-Allowed": "/" }),
        // Match the product's inline-style restriction in browser and visual tests.
        ...(pathname === "/medication/" && { "Content-Security-Policy": "style-src 'self'" }) });
      response.end(body);
    } catch { response.writeHead(404).end(); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  browserServer().listen(Number(process.env.MEDORA_TEST_PORT ?? 8872), "127.0.0.1");
