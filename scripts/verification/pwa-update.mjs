import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";

const root = resolve("apps/web/dist");
const bundled = await readFile(resolve(root, "sw.js"), "utf8");
const types = {
  ".js": "application/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
};
let release = 1,
  serveAll = true;
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    res.setHeader("Cache-Control", "no-store");
    if (path === "/fixture-upgrade") {
      res.writeHead(serveAll ? 200 : 503);
      res.end("fixture");
      return;
    }
    if (path === "/sw.js") {
      const changed = bundled
        .replace(
          /const version = prefix \+ "[0-9a-f]+";/,
          'const version = prefix + "update-fixture-' + release + '";',
        )
        .replace("const files = [", 'const files = ["fixture-upgrade",');
      if (changed === bundled || !changed.includes("update-fixture-"))
        throw Error("Cannot identify built worker");
      res.setHeader("Content-Type", types[".js"]);
      res.end(changed);
      return;
    }
    const file = resolve(root, "." + (path === "/" ? "/index.html" : path));
    if (!file.startsWith(root + sep)) throw Error();
    const bytes = await readFile(file);
    res.setHeader(
      "Content-Type",
      types[extname(file)] ?? "application/octet-stream",
    );
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const origin = "http://127.0.0.1:" + server.address().port,
  browser = await chromium.launch({
    executablePath: process.env.MEDORA_CHROMIUM,
  });
try {
  const context = await browser.newContext(),
    page = await context.newPage();
  await page.goto(origin);
  await page.getByRole("button", { name: "English" }).click();
  await page.getByRole("link", { name: "Log water" }).click();
  await page.getByRole("button", { name: "Log water" }).click();
  await expect(page.getByRole("listitem")).toContainText("250");
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  async function update() {
    return page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      const changed = new Promise((resolve) =>
        reg.addEventListener(
          "updatefound",
          () => {
            const installing = reg.installing;
            const state = () => {
              if (["installed", "redundant"].includes(installing.state))
                resolve(installing.state);
            };
            installing.addEventListener("statechange", state);
            state();
          },
          { once: true },
        ),
      );
      await reg.update();
      let timer;
      try {
        return await Promise.race([
          changed,
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(Error("Worker update timed out")),
              20000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    });
  }
  release = 2;
  serveAll = false;
  assert.equal(
    await update(),
    "redundant",
    "An incomplete candidate shell must fail installation",
  );
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("listitem")).toContainText("250");
  await context.setOffline(false);
  serveAll = true;
  release = 3;
  assert.equal(
    await update(),
    "installed",
    "The replacement must wait for existing clients",
  );
  await page.close();
  const upgraded = await context.newPage();
  await upgraded.goto(origin + "/#/water");
  await expect(upgraded.getByRole("listitem")).toContainText("250");
  await upgraded.waitForFunction(async () => {
    const keys = await caches.keys();
    return (
      keys.some((k) => k.endsWith("update-fixture-3")) &&
      !keys.some((k) => k.endsWith("update-fixture-1"))
    );
  });
  await context.setOffline(true);
  await upgraded.reload();
  await expect(upgraded.getByRole("listitem")).toContainText("250");
  console.log(
    "Passed interrupted shell update, old-version offline recovery, upgrade retry and persistent journal checks.",
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  server.close();
}
