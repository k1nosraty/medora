import { serve } from "@hono/node-server";
import { Pool } from "pg";
import { s3Storage } from "./objects";
import { createRuntime } from "./runtime";
import { writerConnectionOptions } from "./writer-settings";

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
const { app, tick } = createRuntime(pool, process.env, storage);
let running = false;
const runner = setInterval(async () => {
  if (running) return;
  running = true;
  try {
    await tick();
  } catch {
    console.warn("background_job_deferred");
  } finally {
    running = false;
  }
}, 5000);
runner.unref();
const server = serve({
  fetch: app.fetch,
  hostname: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 8802),
});
process.on("SIGTERM", () => {
  clearInterval(runner);
  server.close(() => void pool.end());
});
