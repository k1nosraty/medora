const prefix = "medora-medication-shell-";
const cacheName = prefix + "{{version}}";
const artPrefix = "medora-medication-art-";
const artworkCache = artPrefix + "{{version}}";
const shell = {{assets}};
const versioned = /^\/medication\/bundles\/(?:bootstrap|medora|chunk|style)-[a-z0-9]+\.(?:css|js)$/i;
const legacyModule = /^\/medication\/(?!bundles\/|sw\.js$).+\.(?:css|js)$/i;
const optionalArt = /^\/design\/(?:optical-glass|matte-3d)\/[a-z0-9-]+\.webp$/;
const openShell = () => caches.open(cacheName);

self.addEventListener("install", event => {
  const requests = shell.map(path => new Request(path, { cache: "reload" }));
  event.waitUntil(openShell().then(cache => cache.addAll(requests)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    const previous = names.filter(name => name.startsWith(prefix) && name !== cacheName);
    // Old tabs may still import chunks from the preceding release.
    await Promise.all(previous.slice(0, -1).map(name => caches.delete(name)));
    await Promise.all(names.filter(name => name.startsWith(artPrefix) && name !== artworkCache).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET") return;
  if (optionalArt.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(artworkCache);
      const saved = await cache.match(url.pathname);
      if (saved) return saved;
      const response = await fetch(event.request);
      if (response.ok) await cache.put(url.pathname, response.clone()).catch(() => {});
      return response;
    })());
    return;
  }
  const bundled = versioned.test(url.pathname);
  const legacy = legacyModule.test(url.pathname);
  if (!shell.includes(url.pathname) && !bundled && !legacy) return;
  event.respondWith((async () => {
    const current = await openShell();
    const saved = await current.match(url.pathname);
    if (saved) return saved;
    // The content-addressed path identifies the exact bytes, even across releases.
    if (bundled || legacy) {
      const previous = await caches.match(url.pathname);
      if (previous) return previous;
    }
    return fetch(event.request);
  })());
});
