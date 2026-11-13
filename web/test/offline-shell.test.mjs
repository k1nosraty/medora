import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

test("the installed shell serves a coherent offline page and does not intercept APIs", async () => {
  const publicDir = new URL("../public/", import.meta.url);
  const source = await readFile(new URL("medication/sw.js", publicDir), "utf8");
  const origin = "https://medora.example";
  const listeners = new Map();
  const stored = new Map();
  const network = [];
  const cache = {
    async addAll(requests) {
      for (const request of requests) stored.set(new URL(request.url).pathname, new Response("installed"));
    },
    async match(path) { return stored.get(path)?.clone(); },
    async put(path, response) { stored.set(path, response); }
  };
  vm.runInNewContext(source, {
    URL,
    Request: class extends Request {
      constructor(path, options) { super(new URL(path, origin), options); }
    },
    caches: { open: async () => cache },
    fetch: async request => { network.push(request.url); return new Response("network"); },
    self: { location: { origin }, addEventListener: (type, listener) => listeners.set(type, listener) }
  });
  let installed;
  listeners.get("install")({ waitUntil: promise => { installed = promise; } });
  await installed;
  const html = await readFile(new URL("medication/index.html", publicDir), "utf8");
  for (const [, asset] of html.matchAll(/(?:src|href)="(\/[^"#]+\.(?:css|js|svg|png|webmanifest))"/g)) {
    assert.ok(stored.has(asset), `The shell page links to uncached asset ${asset}`);
  }
  for (const path of stored.keys()) {
    if (!path.startsWith("/medication/") || !path.endsWith(".js")) continue;
    const module = await readFile(new URL(path.slice(1), publicDir), "utf8");
    for (const match of module.matchAll(/(?:from\s+|import\(\s*)["'](\.{1,2}\/[^"']+|\/medication\/[^"']+)["']/g)) {
      assert.ok(stored.has(new URL(match[1], origin + path).pathname), `${path} loads an uncached module`);
    }
  }
  function fetchThroughWorker(path) {
    let response;
    listeners.get("fetch")({
      request: new Request(origin + path),
      respondWith: promise => { response = promise; }
    });
    return response;
  }
  assert.equal(await (await fetchThroughWorker("/medication/?day=2026-11-09&view=water")).text(), "installed");
  assert.equal(await (await fetchThroughWorker("/medication/shared/i18n/english.js")).text(), "installed");
  assert.equal(fetchThroughWorker("/api/reminders"), undefined);
  assert.equal(fetchThroughWorker("/api/promotion"), undefined);
  assert.equal(fetchThroughWorker("/admin/"), undefined);
  assert.equal(fetchThroughWorker("/design/"), undefined);
  for (const folder of ["optical-glass", "matte-3d"]) {
    assert.equal(await (await fetchThroughWorker(`/design/${folder}/water.webp`)).text(), "installed");
  }
  const dental = "/design/matte-3d/visit-dental.webp";
  assert.equal(await (await fetchThroughWorker(dental)).text(), "network");
  assert.equal(await (await fetchThroughWorker(dental)).text(), "network");
  assert.deepEqual(network, [origin + dental]);
});
