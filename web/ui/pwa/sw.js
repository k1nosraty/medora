const cacheName = "medora-medication-shell-{{version}}";
const shell = {{assets}};
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
  const artwork = /^\/design\/(?:optical-glass|matte-3d)\/[a-z0-9-]+\.webp$/.test(url.pathname);
  if (url.origin !== self.location.origin || event.request.method !== "GET" || (!shell.includes(url.pathname) && !artwork)) return;
  event.respondWith((async () => {
    const cache = await openShell();
    const saved = await cache.match(url.pathname);
    if (saved) return saved;
    const response = await fetch(event.request);
    if (artwork && response.ok) await cache.put(url.pathname, response.clone()).catch(() => {});
    return response;
  })());
});
