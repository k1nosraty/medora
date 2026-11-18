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
);
const server = serve({
  fetch: app.fetch,
  hostname: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 8802),
});
process.on("SIGTERM", () => server.close(() => void pool.end()));
