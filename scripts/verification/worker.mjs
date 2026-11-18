import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

const db = new URL(process.env.MEDORA_TEST_DATABASE_URL ?? "invalid");
const mail = new URL(process.argv[2] ?? "invalid");
if (
  !["localhost", "127.0.0.1"].includes(db.hostname) ||
  mail.hostname !== "127.0.0.1" ||
  mail.protocol !== "http:"
)
  throw Error("Dedicated loopback fixture database and Mailpit are required");
const port = Number(process.env.MEDORA_WORKER_TEST_PORT ?? 48829);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw Error("Invalid fixture port");
const origin = "http://127.0.0.1:" + port,
  dir = await mkdtemp(join(tmpdir(), "medora-workerd-"));
const secret = () => randomBytes(32).toString("hex");
const passwordKeys = JSON.stringify({ legacy: secret() });
const workerEnv = join(dir, "worker.env");
await writeFile(
  workerEnv,
  [
    "MEDORA_PASSWORD_KEYS='" + passwordKeys + "'",
    "MEDORA_CODE_KEY=" + secret(),
    "MEDORA_MAIL_KEY=" + secret(),
    "MEDORA_FROM=fixture@example.test",
    "MEDORA_MAILPIT=" + mail.origin,
  ].join("\n"),
  { mode: 0o600 },
);
const env = {
  ...process.env,
  WRANGLER_SEND_METRICS: "false",
  DATABASE_URL: db.href,
  MEDORA_PASSWORD_KEYS: passwordKeys,
  CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: db.href,
};
async function run(args) {
  const child = spawn(process.execPath, args, {
    stdio: ["ignore", "ignore", "ignore"],
    env: { ...env, MEDORA_WORKER_FIXTURE_CRON: "1" },
  });
  const [code] = await once(child, "exit");
  if (code !== 0) throw Error("Fixture check failed in " + args[0]);
}
const worker = spawn(
  "web/node_modules/.bin/wrangler",
  [
    "dev",
    "--local",
    "--config",
    "infrastructure/cloudflare/local.json",
    "--env-file",
    workerEnv,
    "--persist-to",
    join(dir, "state"),
    "--ip",
    "127.0.0.1",
    "--port",
    String(port),
    "--test-scheduled",
  ],
  { env, stdio: "ignore", detached: true },
);
const exited = once(worker, "exit");
try {
  let ready = false;
  for (let n = 0; n < 100; n++) {
    if (worker.exitCode !== null) break;
    try {
      const r = await fetch(origin + "/api/v2/health", {
        signal: AbortSignal.timeout(1000),
      });
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(200);
  }
  if (!ready) throw Error("Workerd fixture did not start");
  await run(["scripts/verification/runtime.mjs", origin]);
  await run(["scripts/verification/accounts.mjs", origin, mail.origin]);
  const headers = (await fetch(origin)).headers;
  if (
    !headers
      .get("Content-Security-Policy")
      ?.includes("frame-ancestors 'none'") ||
    headers.get("X-Content-Type-Options") !== "nosniff"
  )
    throw Error("Static security headers missing");
  console.log(
    "Workerd passed real database sync, R2, browser identity, scheduled mail, family access, offline recovery and static headers.",
  );
} finally {
  if (worker.exitCode === null) {
    try {
      process.kill(-worker.pid, "SIGTERM");
    } catch {}
  }
  await exited;
  await rm(dir, { recursive: true, force: true });
}
