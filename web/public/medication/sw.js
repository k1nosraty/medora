const cacheName = "medora-medication-shell-v3";
const shell = [
  "/medication/",
  "/medication/medication.js",
  "/medication/reminders.js",
  "/medication/medication.css",
  "/medication/storage.js",
  "/care-engine/care-core.mjs",
  "/icon-192.png",
  "/style.css",
  "/vazirmatn.ttf"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(shell)).then(() => self.skipWaiting()));
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
      const response = await fetch(event.request);
      if (response.ok) await cache.put(url.pathname, response.clone());
      return response;
    } catch {
      return await cache.match(url.pathname) ?? Response.error();
    }
  })());
});
