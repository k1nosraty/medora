// Same-origin product assets and real PostgreSQL HTTP API for the cutover test.
// Gen1 has already been fenced in this rehearsal.
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium, expect } from "@playwright/test";
const mime = {
  ".js": "application/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".webp": "image/webp",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
};
export async function verifyProductBrowser(api, username, password) {
  const root = resolve("apps/web/dist"),
    gateway = createServer(async (req, res) => {
      try {
        const path = new URL(req.url, "http://localhost").pathname;
        if (path.startsWith("/api/v2/")) {
          const parts = [];
          for await (const part of req) parts.push(part);
          const upstream = await fetch(new URL(req.url, api), {
            method: req.method,
            headers: {
              "Content-Type": req.headers["content-type"] ?? "application/json",
              Origin: api,
              ...(req.headers.cookie && { Cookie: req.headers.cookie }),
              ...(req.headers["x-medora-owner"] && {
                "X-Medora-Owner": req.headers["x-medora-owner"],
              }),
              ...(req.headers["if-none-match"] && {
                "If-None-Match": req.headers["if-none-match"],
              }),
            },
            ...(parts.length && { body: Buffer.concat(parts) }),
          });
          const headers = Object.fromEntries(upstream.headers);
          delete headers["content-encoding"];
          delete headers["content-length"];
          res
            .writeHead(upstream.status, headers)
            .end(Buffer.from(await upstream.arrayBuffer()));
          return;
        }
        if (path.startsWith("/api/")) {
          res.writeHead(503).end();
          return;
        }
        const file = resolve(
          root,
          "." + path + (path.endsWith("/") ? "index.html" : ""),
        );
        if (!file.startsWith(root + sep)) {
          res.writeHead(404).end();
          return;
        }
        const bytes = await readFile(file);
        res
          .writeHead(200, {
            "Content-Type": mime[extname(file)] ?? "application/octet-stream",
          })
          .end(bytes);
      } catch {
        res.writeHead(404).end();
      }
    });
  gateway.listen(0, "127.0.0.1");
  await once(gateway, "listening");
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.MEDORA_CHROMIUM,
    });
    const context = await browser.newContext({
      serviceWorkers: "block",
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage(),
      origin = "http://127.0.0.1:" + gateway.address().port;
    await page.addInitScript(() =>
      localStorage.setItem("medora-language", "en"),
    );
    await page.goto(origin + "/medication/");
    await page.locator("#welcome-start").click();
    await page.locator(".header-tools [data-destination=settings]").click();
    await page.locator("#settings-dialog [data-open-account]").click();
    await page.locator("#login-username").fill(username);
    await page.locator("#login-password").fill(password);
    await page.locator("#password-login button[type=submit]").click();
    await expect(page.locator("#account-session")).toBeVisible();
    // Wait for restored cloud state to be committed to the original device database.
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const { accessCare } =
              await import("/medication/shared/storage.js");
            return (await accessCare()).accountCare?.enabled ?? false;
          }),
        { timeout: 20000 },
      )
      .toBe(true);
    await page.goto(origin + "/medication/?view=water");
    const remote = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/v2/care" &&
        r.request().method() === "POST" &&
        r.ok(),
    );
    await page.locator("#water-entry [data-water-add='250']").click();
    await remote;
    await expect(page.locator("#water-entries .entry-row")).toHaveCount(1);
    await page.reload();
    await expect(page.locator("#water-entries .entry-row")).toHaveCount(1);
  } finally {
    await browser?.close();
    await new Promise((resolve) => gateway.close(resolve));
  }
}
