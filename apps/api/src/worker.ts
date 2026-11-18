import { familyService } from "./family";
import { Pool } from "pg";
import { createApp } from "./app";
import { verifier } from "./password";
import { repository } from "./repository";
import { passwordKeys } from "./settings";

import { r2Storage, type R2Bucket } from "./objects";
import { mailConfiguration, type MailEnv } from "./mail";
import { identityService } from "./identity";
interface Env extends MailEnv {
  BACKUPS: R2Bucket;
  HYPERDRIVE: { connectionString: string };
  ASSETS: { fetch(request: Request): Promise<Response> };
  MEDORA_PASSWORD_KEYS: string;
}
export default {
  async scheduled(_event: unknown, env: Env) {
    const mail = mailConfiguration(env);
    if (!mail) return;
    const pool = new Pool({
      connectionString: env.HYPERDRIVE.connectionString,
      max: 2,
    });
    try {
      await identityService(
        pool,
        repository(pool),
        mail.settings,
        mail.deliver,
      ).drain();
    } finally {
      await pool.end();
    }
  },
  async fetch(
    request: Request,
    env: Env,
    ctx: { waitUntil(task: Promise<unknown>): void },
  ) {
    if (!new URL(request.url).pathname.startsWith("/api/"))
      return env.ASSETS.fetch(request);
    const pool = new Pool({
      connectionString: env.HYPERDRIVE.connectionString,
      max: 2,
    });
    try {
      const store = repository(pool),
        mail = mailConfiguration(env);
      return await createApp(
        store,
        verifier(passwordKeys(env.MEDORA_PASSWORD_KEYS)),
        r2Storage(env.BACKUPS),
        undefined,
        mail
          ? identityService(pool, store, mail.settings, mail.deliver)
          : undefined,
        familyService(pool),
      ).fetch(request);
    } finally {
      ctx.waitUntil(pool.end());
    }
  },
};
