import type { Pool } from "pg";
import { releaseNotifications, type ReleaseEnv } from "./release-notifications";
import { removeBackupObjects } from "./account-deletion";
import { administrativeExport } from "./admin-export";
import { adminAccounts } from "./admin-accounts";
import { promotionService, type PromotionEnv } from "./promotions";
import { operationService } from "./operations";
import { reminderService } from "./reminders";
import { householdService } from "./household";
import { careService } from "./care";
import { familyService } from "./family";
import { createApp } from "./app";
import { verifier } from "./password";
import { repository } from "./repository";
import { passwordKeys } from "./settings";
import { identityService } from "./identity";
import { mailConfiguration, type MailEnv } from "./mail";
import type { ObjectStorage } from "./objects";

export interface RuntimeEnv extends MailEnv, PromotionEnv, ReleaseEnv {
  MEDORA_LEGACY_WRITES_FENCED?: string;
  EMAIL_SESSION_KEY?: string;
  PUBLIC_ORIGIN?: string;
}

export function createRuntime(
  pool: Pool,
  env: RuntimeEnv,
  storage?: ObjectStorage,
) {
  const store = repository(pool);
  const mail = mailConfiguration(env);
  const identity =
    mail && identityService(pool, store, mail.settings, mail.deliver);
  const operations = operationService(pool, store, env);
  const reminders = reminderService(pool, store, env, operations);
  const release = releaseNotifications(pool, store, operations, env);
  const app = createApp(store, verifier(passwordKeys(env.MEDORA_PASSWORD_KEYS)), {
    storage,
    publicOrigin: env.PUBLIC_ORIGIN || undefined,
    identity,
    family: familyService(pool),
    care: careService(pool),
    household: householdService(pool),
    inviteDelivery: mail?.invite,
    legacySessionKey:
      env.MEDORA_LEGACY_WRITES_FENCED === "true"
        ? env.EMAIL_SESSION_KEY
        : undefined,
    reminders,
    operations,
    promotions: promotionService(pool, store, operations, env),
    accounts: adminAccounts(pool, operations, env.EMAIL_SESSION_KEY, storage),
    exportOperations: administrativeExport(pool, operations),
    release,
  });
  return {
    app,
    async tick() {
      if ((await store.productWriter()) === "frozen") return;
      const jobs = {
        identity_mail: identity?.drain(),
        operations_maintenance: operations.maintenance(),
        backup_cleanup: removeBackupObjects(pool, storage),
        reminders: reminders?.tick(),
        release_notifications: release?.tick(),
      };
      await Promise.all(Object.entries(jobs).map(async ([job, running]) => {
        try { await running; }
        catch { console.warn("background_job_deferred", job); }
      }));
    },
  };
}
