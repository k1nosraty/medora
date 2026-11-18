importScripts("/medication/workbox.js");

const prefix = "medora-medication-shell-";
const cacheName = prefix + "{{version}}";
const artPrefix = "medora-medication-art-";
const artworkCache = artPrefix + "{{version}}";
const shell = {{assets}};
const versioned = /^\/medication\/bundles\/(?:bootstrap|medora|chunk|style)-[a-z0-9]+\.(?:css|js)$/i;
const legacyModule = /^\/medication\/(?!bundles\/|sw\.js$).+\.(?:css|js)$/i;
const optionalArt = /^\/design\/(?:optical-glass|matte-3d)\/(?:colors\/(?:gold|peach|coral|rose|purple|indigo|blue|green|pistachio|slate)\/)?[a-z0-9-]+\.webp$/;
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

MedoraWorkbox.registerRoute(
  ({ sameOrigin, url }) => sameOrigin && optionalArt.test(url.pathname),
  async ({ request, url }) => {
    const cache = await caches.open(artworkCache);
    const saved = await cache.match(url.pathname);
    if (saved) return saved;
    const response = await fetch(request);
    if (response.ok) await cache.put(url.pathname, response.clone()).catch(() => {});
    return response;
  },
);

MedoraWorkbox.registerRoute(
  ({ sameOrigin, url }) => sameOrigin &&
    (shell.includes(url.pathname) || versioned.test(url.pathname) || legacyModule.test(url.pathname)),
  async ({ request, url }) => {
    const current = await openShell();
    const saved = await current.match(url.pathname);
    if (saved) return saved;
    // Old tabs can still use the preceding release's chunks.
    if (versioned.test(url.pathname) || legacyModule.test(url.pathname)) {
      const previous = await caches.match(url.pathname);
      if (previous) return previous;
    }
    return fetch(request);
  },
);
