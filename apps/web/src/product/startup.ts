import { initialCare } from "./initialCare";
import { hasStarted, showWelcome } from "./Onboarding";

let loading: Promise<typeof import("./product")> | undefined;
function loadProduct() {
  return (loading ??= import("./product").catch((error: unknown) => {
    loading = undefined;
    throw error;
  }));
}

const initial = await initialCare;
if ("state" in initial && !location.search && !hasStarted(initial.state)) {
  showWelcome(async () => (await loadProduct()).finishOnboarding());
  // Let the welcome controls paint before spending bandwidth on the dashboard.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => void loadProduct().catch(() => {}));
  });
} else {
  await loadProduct();
}
