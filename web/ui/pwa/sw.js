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
  if (url.origin !== self.location.origin || event.request.method !== "GET" || !shell.includes(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await openShell();
    return await cache.match(url.pathname) ?? fetch(event.request);
  })());
});
