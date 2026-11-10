const cacheName = "medora-medication-shell-v44";
const shell = [
  "/medication/",
  "/medication/bootstrap.js",
  "/medication/medication.js",
  "/medication/locale.js",
  "/medication/english.js",
  "/medication/orely.css",
  "/medication/routines.css",
  "/medication/routine-icons.svg",
  "/medication/routine-plan.js",
  "/medication/routine-catalog.js",
  "/medication/routines-view.js",
  "/medication/care-illustration.svg",
  "/manifest.webmanifest",
  "/manifest.en.webmanifest",
  "/medication/account.js",
  "/medication/promotion.js",
  "/medication/reminders.js",
  "/medication/subscription-id.js",
  "/medication/wellness.js",
  "/medication/dom.js",
  "/medication/care-index.js",
  "/medication/daily-view.js",
  "/medication/appointments-view.js",
  "/medication/insights-view.js",
  "/medication/care-plan.js",
  "/medication/wall-clock.js",
  "/medication/android-backup.js",
  "/medication/backup-restore-view.js",
  "/medication/medication-art.js",
  "/medication/pickers.js",
  "/medication/medication.css",
  "/medication/storage.js",
  "/care-engine/care-core.mjs",
  "/icon-192.png",
  "/apple-touch-icon.png",
  "/medora-icon-192.png",
  "/medora-icon-512.png",
  "/style.css",
  "/vazirmatn.woff2"
];
let shellCache;
const openShell = () => shellCache ??= caches.open(cacheName);

self.addEventListener("install", event => {
  const requests = shell.map(path => new Request(path, { cache: "reload" }));
  // An update waits for old windows to close so one page always uses one shell.
  event.waitUntil(openShell().then(cache => cache.addAll(requests)));
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith("medora-medication-shell-") && name !== cacheName)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET" || !shell.includes(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await openShell();
    return await cache.match(url.pathname) ?? fetch(event.request);
  })());
});
