const cacheName = "medora-medication-shell-v33";
const shell = [
  "/medication/",
  "/medication/bootstrap.js",
  "/medication/medication.js",
  "/medication/locale.js",
  "/medication/english.js",
  "/medication/orely.css",
  "/medication/care-illustration.svg",
  "/manifest.webmanifest",
  "/manifest.en.webmanifest",
  "/medication/account.js",
  "/medication/reminders.js",
  "/medication/subscription-id.js",
  "/medication/wellness.js",
  "/medication/care-plan.js",
  "/medication/wall-clock.js",
  "/medication/android-backup.js",
  "/medication/medication-art.js",
  "/medication/pickers.js",
  "/medication/medication.css",
  "/medication/storage.js",
  "/care-engine/care-core.mjs",
  "/icon-192.png",
  "/style.css",
  "/vazirmatn.ttf"
];

self.addEventListener("install", event => {
  const requests = shell.map(path => new Request(path, { cache: "reload" }));
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(requests)).then(() => self.skipWaiting()));
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
  if (url.origin !== self.location.origin || event.request.method !== "GET" ||
      (!shell.includes(url.pathname) && !url.pathname.startsWith("/care-engine/"))) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    try {
      const response = await fetch(event.request, { cache: "no-store" });
      if (response.ok) {
        await cache.put(url.pathname, response.clone());
        return response;
      }
      return await cache.match(url.pathname) ?? response;
    } catch {
      return await cache.match(url.pathname) ?? Response.error();
    }
  })());
});
