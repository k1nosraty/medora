import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
export async function withLocalWorker(
  database,
  port,
  bindings,
  verify,
  { config = "infrastructure/cloudflare/local.json" } = {},
) {
  const db = new URL(database);
  if (
    !["127.0.0.1", "localhost"].includes(db.hostname) ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535
  )
    throw Error("Loopback fixture required");
  const origin = "http://127.0.0.1:" + port,
    dir = await mkdtemp(join(tmpdir(), "medora-workerd-")),
    workerEnv = join(dir, "worker.env");
  await writeFile(
    workerEnv,
    Object.entries(bindings)
      .map(([name, value]) => {
        if (!/^[A-Z_]+$/.test(name) || /['\r\n]/.test(value))
          throw Error("Invalid synthetic binding");
        return name + "='" + value + "'";
      })
      .join("\n"),
    { mode: 0o600 },
  );
  const env = {
    PATH: process.env.PATH,
    WRANGLER_SEND_METRICS: "false",
    CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: db.href,
  };
  const worker = spawn(
    "web/node_modules/.bin/wrangler",
    [
      "dev",
      "--local",
      "--config",
      config,
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
    await verify(origin);
  } finally {
    if (worker.exitCode === null) {
      try {
        process.kill(-worker.pid, "SIGTERM");
      } catch {}
    }
    await exited;
    await rm(dir, { recursive: true, force: true });
  }
}
