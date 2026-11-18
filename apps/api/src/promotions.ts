import type { Pool } from "pg";
import { CampaignStore } from "../../../web/src/promotions/campaigns.mjs";
import { routePromotions } from "../../../web/src/promotions/http.mjs";
import type { operationService, OperationsEnv } from "./operations";
import type { Repository } from "./repository";
import { PromotionStorage } from "./promotion-storage";

export interface PromotionEnv extends OperationsEnv {
  PROMOTION_MEDIA_HOSTS?: string;
}
const noCache = { match: () => null, put: () => {}, delete: () => {} };

export function promotionService(
  pool: Pool,
  repo: Repository,
  ops: ReturnType<typeof operationService>,
  env: PromotionEnv,
) {
  const campaigns = new CampaignStore(new PromotionStorage(pool));
  return {
    campaigns,
    async route(
      request: Request,
      email: () => Promise<string | undefined>,
      origin?: string,
    ) {
      const url = new URL(request.url);
      url.pathname = url.pathname.replace(/^\/api\/v2\//, "/api/");
      const tasks: Promise<unknown>[] = [];
      const result = await routePromotions(
        request,
        env,
        url,
        {
          promotions: campaigns,
          cache: noCache,
          signedIn: email,
          audit: (actor: string, action: string) => ops.log(actor, action),
          eventBudget: () => repo.loginBudget("campaign-event", 900),
          waitUntil: (task: Promise<unknown> | undefined) => {
            if (task) tasks.push(task);
          },
          mediaPath: (path: string) => "/api/v2" + path.slice(4),
        },
        origin,
      );
      await Promise.all(tasks);
      return result;
    },
  };
}
