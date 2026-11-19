import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { withLocalWorker } from "./local-worker.mjs";
import { fixtureDatabase } from "./fixture-database.mjs";
const db = fixtureDatabase(process.env.MEDORA_TEST_DATABASE_URL);
const mail = new URL(process.argv[2] ?? "invalid");
if (
  !db ||
  mail.hostname !== "127.0.0.1" ||
  mail.protocol !== "http:"
)
  throw Error("Dedicated loopback fixture database and Mailpit are required");
const port = Number(process.env.MEDORA_WORKER_TEST_PORT ?? 48829);
const secret = () => randomBytes(32).toString("hex");
const passwordKeys = JSON.stringify({ legacy: secret() });
async function run(args) {
  const child = spawn(process.execPath, args, {
    stdio: ["ignore", "ignore", "ignore"],
    env: {
      ...process.env,
      MEDORA_PASSWORD_KEYS: passwordKeys,
      MEDORA_WORKER_FIXTURE_CRON: "1",
    },
  });
  const [code] = await once(child, "exit");
  if (code !== 0) throw Error("Fixture check failed in " + args[0]);
}
await withLocalWorker(
  db,
  port,
  {
    MEDORA_PASSWORD_KEYS: passwordKeys,
    MEDORA_CODE_KEY: secret(),
    MEDORA_MAIL_KEY: secret(),
    MEDORA_FROM: "fixture@example.test",
    MEDORA_MAILPIT: mail.origin,
  },
  async (origin) => {
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
  },
);
