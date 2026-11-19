import { DurableObject } from "cloudflare:workers";
import { signedInEmail } from "../accounts/email-auth.mjs";
import { logOperation } from "../operations/audit.mjs";
import { routePromotions } from "../../../../packages/server-shared/src/promotions/http.mjs";
import { CampaignStore, chunkSize } from "../../../../packages/server-shared/src/promotions/campaigns.mjs";
export { validatedPromotion } from "../../../../packages/server-shared/src/promotions/http.mjs";

export function handlePromotions(request, env, ctx, url) {
  return routePromotions(request, env, url, {
    promotions: env.PROMOTIONS.getByName("home"),
    cache: caches.default,
    waitUntil: (task) => {
      if (task) ctx.waitUntil(task);
    },
    audit: (email, action) => logOperation(env, email, action),
    signedIn: (input) => signedInEmail(input, env),
    eventBudget: async (input) =>
      !env.PROMOTION_EVENT_LIMIT ||
      (
        await env.PROMOTION_EVENT_LIMIT.limit({
          key: input.headers.get("CF-Connecting-IP") ?? "unknown",
        })
      ).success,
    mediaPath: (path) => path,
  });
}
export class Promotions extends DurableObject {
  #store() {
    return new CampaignStore(this.ctx.storage);
  }
  getStorageSize() {
    return this.ctx.storage.sql.databaseSize;
  }
  campaigns(...args) {
    return this.#store().campaigns(...args);
  }
  current(...args) {
    return this.#store().current(...args);
  }
  dashboard(...args) {
    return this.#store().dashboard(...args);
  }
  save(...args) {
    return this.#store().save(...args);
  }
  count(...args) {
    return this.#store().count(...args);
  }
  removeArchived(...args) {
    return this.#store().removeArchived(...args);
  }
  preview(...args) {
    return this.#store().preview(...args);
  }
  savePreview(...args) {
    return this.#store().savePreview(...args);
  }
  library(...args) {
    return this.#store().library(...args);
  }
  removeMedia(...args) {
    return this.#store().removeMedia(...args);
  }
  exportData(...args) {
    return this.#store().exportData(...args);
  }
  mediaMeta(...args) {
    return this.#store().mediaMeta(...args);
  }
  validMedia(...args) {
    return this.#store().validMedia(...args);
  }
  storeMedia(...args) {
    return this.#store().storeMedia(...args);
  }
  mediaBytes(...args) {
    return this.#store().mediaBytes(...args);
  }
  async migrationTargetEmpty() {
    const storage = this.ctx.storage;
    return (
      !(await this.campaigns()).length &&
      !(await storage.get("assets"))?.length &&
      !(await this.preview()) &&
      !(await storage.list({ prefix: "meta:", limit: 1 })).size &&
      !(await storage.list({ prefix: "count:", limit: 1 })).size
    );
  }
  async restoreMedia(asset, bytes) {
    await this.ctx.storage.transaction(async (storage) => {
      if (await storage.get("meta:" + asset.id)) return;
      const assets = (await storage.get("assets")) ?? [];
      const { id, size, type, name, createdAt } = asset;
      const entries = {
        ["meta:" + id]: { type, size },
        assets: [...assets, { id, size, name, createdAt }],
      };
      for (let offset = 0; offset < size; offset += chunkSize)
        entries[`media:${id}:${offset / chunkSize}`] = bytes.slice(
          offset,
          offset + chunkSize,
        );
      await storage.put(entries);
    });
  }

  async restoreCampaigns(data) {
    await this.ctx.storage.transaction(async (storage) => {
      if ((await this.campaigns(storage)).length) return;
      const entries = {
        campaigns: data.campaigns.map(({ stats, ...campaign }) => campaign),
      };
      if (data.preview) entries.preview = data.preview;
      for (const campaign of data.campaigns)
        if (campaign.stats) entries["count:" + campaign.id] = campaign.stats;
      await storage.put(entries);
    });
  }
}
