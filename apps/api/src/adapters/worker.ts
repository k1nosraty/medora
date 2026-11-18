import { Pool } from "pg";
import { writerConnectionOptions } from "./writer-settings";
import { r2Storage, type R2Bucket } from "../objects";
import { createRuntime, type RuntimeEnv } from "../runtime";

interface Env extends RuntimeEnv {
  BACKUPS: R2Bucket;
  HYPERDRIVE: { connectionString: string };
  ASSETS: { fetch(request: Request): Promise<Response> };
}

function database(env: Env) {
  return new Pool({
    connectionString: env.HYPERDRIVE.connectionString,
    ...writerConnectionOptions(env.MEDORA_LEGACY_WRITES_FENCED),
    max: 2,
  });
}

export default {
  async scheduled(_event: unknown, env: Env) {
    const pool = database(env);
    try {
      await createRuntime(pool, env, r2Storage(env.BACKUPS)).tick();
    } finally {
      await pool.end();
    }
  },
  async fetch(
    request: Request,
    env: Env,
    ctx: { waitUntil(task: Promise<unknown>): void },
  ) {
    const path = new URL(request.url).pathname;
    if (!path.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (!path.startsWith("/api/v2/"))
      return Response.json(
        { error: "legacy_writer_fenced" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    const pool = database(env);
    try {
      return await createRuntime(pool, env, r2Storage(env.BACKUPS)).app.fetch(
        request,
      );
    } finally {
      ctx.waitUntil(pool.end());
    }
  },
};
