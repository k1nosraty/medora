const workerPath = "/medication/sw.js";
const workerURL = new URL(workerPath, location.origin).href;
const serviceWorkers = navigator.serviceWorker;
let registration;
let applied = false;
let observed = serviceWorkers?.controller?.scriptURL === workerURL ? serviceWorkers.controller : null;

serviceWorkers?.addEventListener("controllerchange", () => {
  const controller = serviceWorkers.controller;
  if (controller?.scriptURL !== workerURL || controller === observed) return;
  if (observed) {
    applied = true;
    document.getElementById("update-app")?.setAttribute("data-update-ready", "");
  }
  observed = controller;
});

function register() {
  return registration ??= serviceWorkers.register(workerPath, { updateViaCache: "none" }).catch(error => {
    registration = undefined;
    throw error;
  });
}

export function monitorUpdates() {
  if (!serviceWorkers) return;
  void register().catch(() => {});
  let lastCheck = Date.now();
  function check() {
    if (document.hidden || !navigator.onLine || Date.now() - lastCheck < 60_000) return;
    lastCheck = Date.now();
    void register().then(worker => worker.update()).catch(() => {});
  }
  document.addEventListener("visibilitychange", check);
  window.addEventListener("focus", check);
  window.addEventListener("online", check);
}

export async function refreshApp({ reload = false, canReload = () => true } = {}) {
  if (serviceWorkers) {
    const worker = await register();
    const previous = worker.active;
    await worker.update();
    const candidate = worker.installing ?? worker.waiting ?? (worker.active !== previous ? worker.active : null);
    if (candidate && candidate.state !== "activated") {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => finish(new Error("update_timeout")), 20_000);
        function finish(error) {
          clearTimeout(timer);
          candidate.removeEventListener("statechange", changed);
          if (error) reject(error);
          else resolve();
        }
        function changed() {
          if (candidate.state === "activated") finish();
          if (candidate.state === "redundant") finish(new Error("update_failed"));
        }
        candidate.addEventListener("statechange", changed);
        changed();
      });
    }
    if (!candidate && !applied && !reload) return false;
  }
  if (!canReload()) throw new Error("update_busy");
  location.reload();
}
