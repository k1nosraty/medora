import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const { build } = require("esbuild");
const { Miniflare, convertV4MiniflareOptions } = require("miniflare");

test("migration access requires a valid short-lived grant", async () => {
  const { outputFiles } = await build({
    absWorkingDir: fileURLToPath(new URL("../", import.meta.url)),
    stdin: { resolveDir: fileURLToPath(new URL("../", import.meta.url)), contents: `
      import { authorizeMigration } from "./src/operations/migration.mjs";
      export default { fetch(request, env) {
        return authorizeMigration(request, env, new URL(request.url)) ?? new Response(null, { status: 204 });
      } };
    ` },
    write: false, bundle: true, format: "esm", platform: "browser",
    external: ["cloudflare:workers", "node:crypto", "node:buffer"]
  });
  const secret = "a".repeat(64);
  const options = expires => convertV4MiniflareOptions({
    modules: true, script: outputFiles[0].text, compatibilityDate: "2026-10-29", compatibilityFlags: ["nodejs_compat"],
    bindings: { MIGRATION_TOKEN: secret, ...(expires !== undefined && { MIGRATION_TOKEN_EXPIRES_AT: String(expires) }) }
  });
  const runtime = new Miniflare(options());
  const probe = (token, method = "POST") => runtime.dispatchFetch("https://medora.test/api/migration/backup",
    { method, headers: { Authorization: "Bearer " + token } });
  try {
    assert.equal((await probe(secret)).status, 404);
    await runtime.setOptions(options(Date.now() - 1_000));
    assert.equal((await probe(secret)).status, 404);
    await runtime.setOptions(options(Date.now() + 25 * 3_600_000));
    assert.equal((await probe(secret)).status, 404);
    await runtime.setOptions(options(Date.now() + 60_000));
    assert.equal((await probe("b".repeat(64))).status, 401);
    assert.equal((await probe(secret, "GET")).status, 405);
    assert.equal((await probe(secret)).status, 204);
  } finally { await runtime.dispose(); }
});
