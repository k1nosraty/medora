import { adminAccounts } from "./admin-accounts";
import { promotionService, type PromotionEnv } from "./promotions";
import { operationService } from "./operations";
import { reminderService, type PushEnv } from "./reminders";
import { writerConnectionOptions } from "./writer-settings";
import { householdService } from "./household";
import { careService } from "./care";
import { familyService } from "./family";
import { Pool } from "pg";
import { createApp } from "./app";
import { verifier } from "./password";
import { repository } from "./repository";
import { passwordKeys } from "./settings";

import { r2Storage, type R2Bucket } from "./objects";
import { mailConfiguration, type MailEnv } from "./mail";
import { identityService } from "./identity";
interface Env extends MailEnv, PushEnv, PromotionEnv {
  MEDORA_LEGACY_WRITES_FENCED?: string;
  EMAIL_SESSION_KEY?: string;
  BACKUPS: R2Bucket;
  HYPERDRIVE: { connectionString: string };
  ASSETS: { fetch(request: Request): Promise<Response> };
  MEDORA_PASSWORD_KEYS: string;
}
export default {
  async scheduled(_event: unknown, env: Env) {
    const mail = mailConfiguration(env);
    const pool = new Pool({
      connectionString: env.HYPERDRIVE.connectionString,
      ...writerConnectionOptions(env.MEDORA_LEGACY_WRITES_FENCED),
      max: 2,
    });
    try {
      const store = repository(pool);
      if (mail)
        await identityService(pool, store, mail.settings, mail.deliver).drain();
      const operations = operationService(pool, store, env);
      await operations.maintenance();
      await reminderService(pool, store, env, operations)?.tick();
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
      ...writerConnectionOptions(env.MEDORA_LEGACY_WRITES_FENCED),
      max: 2,
    });
    try {
      const store = repository(pool),
        mail = mailConfiguration(env);
      const operations = operationService(pool, store, env);
      return await createApp(
        store,
        verifier(passwordKeys(env.MEDORA_PASSWORD_KEYS)),
        r2Storage(env.BACKUPS),
        undefined,
        mail
          ? identityService(pool, store, mail.settings, mail.deliver)
          : undefined,
        familyService(pool),
        careService(pool),
        householdService(pool),
        mail?.invite,
        env.MEDORA_LEGACY_WRITES_FENCED === "true"
          ? env.EMAIL_SESSION_KEY
          : undefined,
        reminderService(pool, store, env, operations),
        operations,
        promotionService(pool, store, operations, env),
        adminAccounts(pool, operations, env.EMAIL_SESSION_KEY),
      ).fetch(request);
    } finally {
      ctx.waitUntil(pool.end());
    }
  },
};
