import { adminAccounts } from "./admin-accounts";
import { promotionService } from "./promotions";
import { operationService } from "./operations";
import { reminderService } from "./reminders";
import { writerConnectionOptions } from "./writer-settings";
import { householdService } from "./household";
import { careService } from "./care";
import { familyService } from "./family";
import { serve } from "@hono/node-server";
import { Pool } from "pg";
import { createApp } from "./app";
import { verifier } from "./password";
import { repository } from "./repository";
import { passwordKeys } from "./settings";

import { identityService } from "./identity";
import { mailConfiguration } from "./mail";
import { s3Storage } from "./objects";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 8,
  ...writerConnectionOptions(process.env.MEDORA_LEGACY_WRITES_FENCED),
});
const storage = process.env.S3_ENDPOINT
  ? s3Storage(
      process.env.S3_ENDPOINT,
      process.env.S3_BUCKET!,
      process.env.S3_ACCESS_KEY_ID!,
      process.env.S3_SECRET_ACCESS_KEY!,
      process.env.S3_REGION ?? "us-east-1",
    )
  : undefined;
await storage?.initialize();
const store = repository(pool),
  mail = mailConfiguration(process.env);
const identity = mail
  ? identityService(pool, store, mail.settings, mail.deliver)
  : undefined;
const runner = identity
  ? setInterval(
      () =>
        void identity
          .drain()
          .catch(() => console.warn("mail_delivery_deferred")),
      5000,
    )
  : undefined;
runner?.unref();
const operations = operationService(pool, store, process.env);
const operationsRunner = setInterval(
  () =>
    void operations
      .maintenance()
      .catch(() => console.warn("operations_maintenance_deferred")),
  60_000,
);
operationsRunner.unref();
const reminders = reminderService(pool, store, process.env, operations);
let ticking = false;
const reminderRunner =
  reminders &&
  setInterval(async () => {
    if (ticking) return;
    ticking = true;
    try {
      await reminders.tick();
    } catch {
      console.warn("reminder_delivery_deferred");
    } finally {
      ticking = false;
    }
  }, 5000);
reminderRunner?.unref();
const app = createApp(
  store,
  verifier(passwordKeys(process.env.MEDORA_PASSWORD_KEYS)),
  storage,
  process.env.PUBLIC_ORIGIN || undefined,
  identity,
  familyService(pool),
  careService(pool),
  householdService(pool),
  mail?.invite,
  process.env.MEDORA_LEGACY_WRITES_FENCED === "true"
    ? process.env.EMAIL_SESSION_KEY
    : undefined,
  reminders,
  operations,
  promotionService(pool, store, operations, process.env),
  adminAccounts(pool, operations, process.env.EMAIL_SESSION_KEY),
);
const server = serve({
  fetch: app.fetch,
  hostname: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 8802),
});
process.on("SIGTERM", () => server.close(() => void pool.end()));
