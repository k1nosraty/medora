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
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET" || !r.url.startsWith(self.registration.scope)) return;
  if (
    r.mode === "navigate" &&
    new URL(r.url).pathname === new URL(self.registration.scope).pathname
  ) {
    e.respondWith(
      caches
        .open(version)
        .then(
          async (c) => (await c.match(shell, { ignoreVary: true })) ?? fetch(r),
        ),
    );
  } else if (urls.includes(r.url))
    e.respondWith(
      caches
        .open(version)
        .then(
          async (c) => (await c.match(r, { ignoreVary: true })) ?? fetch(r),
        ),
    );
});
