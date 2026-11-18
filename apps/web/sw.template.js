importScripts("./workbox.js");

const prefix = "medora-v2-shell-" + self.registration.scope + "-";
const version = prefix + "__VERSION__";
const files = "__FILES__";
const shell = new URL("./", self.registration.scope).href;
const urls = files.map((file) =>
  file === "index.html" ? shell : new URL(file, self.registration.scope).href,
);
self.addEventListener("install", (e) =>
  e.waitUntil(caches.open(version).then((cache) => cache.addAll(urls))),
);
self.addEventListener("activate", (e) =>
  e.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith(prefix) && key !== version) await caches.delete(key);
      await self.clients.claim();
    })(),
  ),
);
MedoraWorkbox.registerRoute(
  ({ request, url }) =>
    request.url.startsWith(self.registration.scope) &&
    request.mode === "navigate" &&
    url.pathname === new URL(self.registration.scope).pathname,
  async ({ request }) => {
    const cache = await caches.open(version);
    return (await cache.match(shell, { ignoreVary: true })) ?? fetch(request);
  },
);

MedoraWorkbox.registerRoute(
  ({ request }) => urls.includes(request.url),
  async ({ request }) => {
    const cache = await caches.open(version);
    return (await cache.match(request, { ignoreVary: true })) ?? fetch(request);
  },
);
