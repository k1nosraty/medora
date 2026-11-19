// Local compatibility service used by Compose. The only external integration
// here is a synthetic mailbox on the fixture network.
import { createHmac, createECDH } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile } from "node:fs/promises";

const seed = process.env.MEDORA_COMPAT_FIXTURE_KEY;
const origin = new URL(process.env.MEDORA_FIXTURE_MAILPIT);
if (
  !seed ||
  seed.length < 32 ||
  origin.protocol !== "http:" ||
  !["127.0.0.1", "localhost", "mailpit"].includes(origin.hostname) ||
  origin.username ||
  origin.password
)
  throw Error("Isolated fixture configuration required");
const state = process.env.MEDORA_FIXTURE_STATE;
if (!state) throw Error("A dedicated fixture storage directory is required");
const derive = (context) =>
  createHmac("sha256", seed)
    .update("medora-fixture/" + context)
    .digest("hex");
const ecdh = createECDH("prime256v1");
ecdh.setPrivateKey(Buffer.from(derive("push"), "hex"));
const config = JSON.parse(
  await readFile(
    new URL("../../../infrastructure/cloudflare/local.json", import.meta.url),
    "utf8",
  ),
);
const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL("../src/worker.mjs", import.meta.url))],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  external: ["cloudflare:workers", "node:crypto", "node:buffer"],
});
const runtime = new Miniflare(
  convertV4MiniflareOptions({
    name: "medora-compat-fixture",
    cf: false,
    modules: true,
    script: outputFiles[0].text,
    compatibilityDate: config.compatibility_date,
    compatibilityFlags: ["nodejs_compat"],
    host: process.env.MEDORA_FIXTURE_HOST ?? "127.0.0.1",
    port: Number(process.env.MEDORA_FIXTURE_PORT ?? 8803),
    resourcePersistencePath: resolve(state),
    durableObjects: Object.fromEntries(
      config.durable_objects.bindings.map(({ name, class_name }) => [
        name,
        { className: class_name, useSQLite: true },
      ]),
    ),
    ratelimits: Object.fromEntries(
      config.ratelimits.map(({ name, ...options }) => [name, options]),
    ),
    bindings: {
      EMAIL_ACCOUNT_ID_KEY: derive("identity"),
      EMAIL_SESSION_KEY: derive("session"),
      EMAIL_CODE_KEY: derive("challenge"),
      EMAIL_PASSWORD_KEY: derive("password"),
      EMAIL_PASSWORD_KEY_ID: "fixture",
      EMAIL_FROM: "fixture@example.test",
      RESEND_API_KEY: "fixture-mailpit-only",
      REMINDER_SIGNING_KEY: derive("reminders"),
      VAPID_PUBLIC_KEY: ecdh.getPublicKey().toString("base64url"),
      VAPID_PRIVATE_KEY: ecdh.getPrivateKey().toString("base64url"),
      VAPID_SUBJECT: "mailto:fixture@example.test",
      MEDORA_PAUSE_PUSH: "true",
      MEDORA_LEGACY_WRITES_FENCED:
        process.env.MEDORA_LEGACY_WRITES_FENCED ?? "false",
    },
    outboundService: async (request) => {
      if (
        request.method !== "POST" ||
        request.url !== "https://api.resend.com/emails"
      )
        return new Response(null, { status: 503 });
      const message = await request.json();
      return fetch(new URL("/api/v1/send", origin), {
        method: "POST",
        redirect: "error",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          From: { Email: message.from },
          To: message.to.map((Email) => ({ Email })),
          Subject: message.subject,
          Text: message.text,
        }),
      });
    },
  }),
);
await runtime.ready;
const worker = await runtime.getWorker();
const cron = setInterval(
  () =>
    void worker
      .scheduled({ scheduledTime: Date.now(), cron: "*/5 * * * *" })
      .catch(() => console.warn("fixture_cron_deferred")),
  300_000,
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    clearInterval(cron);
    await runtime.dispose();
  });
