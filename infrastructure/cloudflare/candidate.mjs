import product from "../../web/src/worker.mjs";
import journal from "../../apps/api/src/adapters/worker.ts";

export {
  Credentials,
  EmailAccount,
  Families,
  MedicationReminders,
  Operations,
  Promotions,
  PushPilot,
} from "../../web/src/worker.mjs";

export default {
  fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    return path.startsWith("/api/v2/")
      ? journal.fetch(request, env, ctx)
      : product.fetch(request, env, ctx);
  },
  async scheduled(event, env, ctx) {
    const minute = Math.floor(event.scheduledTime / 60_000);
    await Promise.all([
      journal.scheduled(event, env, ctx),
      ...(minute % 5 === 0 ? [product.scheduled(event, env, ctx)] : []),
    ]);
  },
};
