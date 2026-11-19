import { initialCare } from "./initialCare";
import { hasStarted, showWelcome } from "./Onboarding";
import { isScreen } from "./routes";

let loading: Promise<typeof import("./product")> | undefined;
function loadProduct() {
  return (loading ??= import("./product").catch((error: unknown) => {
    loading = undefined;
    throw error;
  }));
}

const initial = await initialCare;
const params = new URLSearchParams(location.search);
const plainScreenLink = params.size === 1 && isScreen(params.get("view"));
if ("state" in initial && (!location.search || plainScreenLink) && !hasStarted(initial.state)) {
  showWelcome(async () => (await loadProduct()).finishOnboarding());
  // Let the welcome controls paint before spending bandwidth on the dashboard.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => void loadProduct().catch(() => {}));
  });
} else {
  await loadProduct();
}
