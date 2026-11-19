import type { operationService } from "./operations";
import type { Pool, PoolClient } from "pg";
import { ReminderDevice } from "@medora/server-shared/reminders/device";
import { routeReminders } from "@medora/server-shared/reminders/routes";
import { portablePush } from "@medora/server-shared/reminders/push";
import { reminderCareProjection } from "@medora/domain/browser/care-plan";
import { pilotConfig } from "@medora/server-shared/http/validation";
import type { Repository } from "./repository";
import { withReminder } from "./reminder-storage";

export interface PushEnv {
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  MEDORA_PAUSE_PUSH?: string;
  REMINDER_SIGNING_KEY?: string;
}

type RequestOwner = (request: Request) => Promise<string | undefined>;
type Device = InstanceType<typeof ReminderDevice>;
type Storage = Parameters<Parameters<typeof withReminder>[3]>[0];

async function accountCare(c: Pool | PoolClient, scope: string, lock = false) {
  const [id, epoch = ""] = scope.split(".");
  const result = await c.query<{
    revision: string;
    records: Record<string, unknown>;
  }>(
    `SELECT s.revision,s.records
    FROM medora.care_state s JOIN medora.accounts a ON a.id=s.owner AND a.sync_generation=2
    CROSS JOIN medora.writer_transition t
    LEFT JOIN medora.legacy_people p ON p.owner=s.owner AND p.snapshot=t.snapshot
    WHERE s.owner=$1 AND coalesce(p.epoch,'')=$2${lock ? " FOR SHARE OF s" : ""}`,
    [id, epoch],
  );
  return result.rows[0];
}

export function reminderService(
  pool: Pool,
  repo: Repository,
  env: PushEnv,
  operations: ReturnType<typeof operationService>,
) {
  const config = pilotConfig(env);
  if (!config || !/^[a-f0-9]{64}$/.test(env.REMINDER_SIGNING_KEY ?? "")) return;

  const send = portablePush(config, env.MEDORA_PAUSE_PUSH === "true");
  function device(storage: Storage, connection: PoolClient, metrics: string[]) {
    return new ReminderDevice(storage, {
      paused: () => env.MEDORA_PAUSE_PUSH === "true",
      send,
      checkAccount: true,
      accountRevision: async (link: { owner: string }) => {
        const care = await accountCare(connection, link.owner, true);
        return care ? Number(care.revision) : null;
      },
      count: (events: string[]) => {
        metrics.push(...events);
      },
    });
  }
  const operate = (
    id: string,
    mode: "read" | "write" | "scheduled",
    work: (
      device: Device,
      storage: Storage,
      connection: PoolClient,
    ) => Promise<unknown>,
  ) =>
    withReminder(pool, id, mode, async (storage, c) => {
      const metrics: string[] = [];
      const result = await work(device(storage, c, metrics), storage, c);
      if (metrics.length) await operations.count(metrics, c);
      return result;
    });

  return {
    publicKey: config.publicKey,
    route(request: Request, owner: RequestOwner, origin?: string) {
      const route = new URL(request.url);
      route.pathname = route.pathname.replace(/^\/api\/v2\//, "/api/");
      return routeReminders(
        request,
        route,
        {
          signingKey: env.REMINDER_SIGNING_KEY,
          enrollBudget: () => repo.loginBudget("reminder-enrollment", 300),
          deviceBudget: (id: string) => repo.loginBudget("reminder:" + id, 80),
          register: () => {},
          account: async (input: Request, scope: string, revision: number) => {
            if ((await owner(input)) !== scope.split(".")[0]) return null;
            if (
              revision >
              Number((await accountCare(pool, scope))?.revision ?? -1)
            )
              return null;
            return { link: async () => true };
          },
          device: (id: string) => ({
            status: () => operate(id, "read", (d) => d.status()),
            test: () => operate(id, "write", (d) => d.test()),
            replace: (
              revision: number,
              plan: unknown,
              link: {
                owner: string;
                revision: number;
                details: boolean;
              } | null,
              revoke: boolean,
            ) =>
              operate(id, "write", async (d, _storage, c) => {
                if (
                  link &&
                  link.revision >
                    Number(
                      (await accountCare(c, link.owner, true))?.revision ?? -1,
                    )
                )
                  return { revision: 0, enabled: false, linkRejected: true };
                return d.replace(revision, plan, link, revoke);
              }),
            detachAccountPlan: (scope: string, revision: number) =>
              operate(id, "write", (d) => d.detachAccountPlan(scope, revision)),
          }),
        },
        origin,
      );
    },
    async tick() {
      if ((await repo.productWriter()) !== "postgres") return;
      const { rows } = await pool.query<{ id: string }>(
        `SELECT id FROM medora.reminder_devices
        WHERE wake <= $1 OR (values->'state'->'link'->>'owner' IS NOT NULL AND EXISTS (
          SELECT 1 FROM medora.care_state c WHERE c.owner=split_part(values->'state'->'link'->>'owner','.',1)
          AND c.revision>coalesce((values->'state'->>'rejectedAccountRevision')::bigint,(values->'state'->'link'->>'revision')::bigint)))
        ORDER BY wake NULLS LAST,id LIMIT 12`,
        [Date.now()],
      );
      for (let start = 0; start < rows.length; start += 2)
        await Promise.all(
          rows.slice(start, start + 2).map(({ id }) =>
            operate(id, "scheduled", async (d, storage, c) => {
              const state = storage.get("state") as
                | {
                    link?: { owner: string; revision: number };
                    rejectedAccountRevision?: number;
                  }
                | undefined;
              if (state?.link) {
                const current = await accountCare(c, state.link.owner, true);
                if (!current)
                  await d.detachAccountPlan(state.link.owner, undefined);
                else if (
                  Number(current.revision) >
                  (state.rejectedAccountRevision ?? state.link.revision)
                )
                  await d.replaceAccountPlan(
                    state.link.owner,
                    Number(current.revision),
                    reminderCareProjection(current.records),
                  );
              }
              const due = storage.getAlarm();
              if (due !== null && due <= Date.now()) await d.alarm();
            }),
          ),
        );
    },
  };
}
