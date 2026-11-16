import { expect, test } from "@playwright/test";
import { createHmac, scryptSync } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { writeWebBackup } from "../public/medication/features/backups/web-format.js";
import { emptyCareRecords } from "../public/medication/domain/family.js";

const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = require("miniflare");
const { build } = require("esbuild");
const secret = "8".repeat(64);
const email = "restore-test@example.test";
const password = "synthetic restore password";
const recoveryKey = "b".repeat(64);
const origin = "https://restore.test";
const hmac = (purpose, value) => createHmac("sha256", secret).update(purpose + ":" + value).digest("hex");
const owner = hmac("account-v1", email);
const old = { id: "old", day: 20000, time: "10:00", amount: 250 };
const fresh = { id: "fresh", day: 20001, time: "10:00", amount: 300 };
const visit = { id: "v", name: "Synthetic visit", day: 20000, time: "15:00", note: "Synthetic private note" };

test.use({ serviceWorkers: "block" });
test("browser restore honors intent against the Worker and transfers private notes only with the recovery key", async ({ page, browser }) => {
  const { outputFiles } = await build({
    absWorkingDir: fileURLToPath(new URL("../", import.meta.url)), entryPoints: ["src/worker.mjs"],
    bundle: true, platform: "browser", format: "esm", external: ["cloudflare:workers", "node:crypto", "node:buffer"], write: false
  });
  const worker = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: outputFiles[0].text, compatibilityDate: "2026-10-29", compatibilityFlags: ["nodejs_compat"],
    durableObjects: { EMAIL_ACCOUNTS: { className: "EmailAccount", useSQLite: true },
      CREDENTIALS: { className: "Credentials", useSQLite: true } },
    ratelimits: { EMAIL_AUTH_LIMIT: { namespace_id: "750503", simple: { limit: 8, period: 60 } } },
    bindings: { EMAIL_AUTH_SECRET: secret }
  }));
  let secondContext;
  try {
    const index = await worker.getDurableObjectNamespace("CREDENTIALS");
    const salt = "9".repeat(32);
    const proof = scryptSync(hmac("password-v1", password), salt, 32,
      { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 }).toString("hex");
    await index.get(index.idFromName("medora-credentials-v1")).register("restore_test", owner, email, salt, proof);
    const login = await worker.dispatchFetch(origin + "/api/auth/login", { method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ username: "restore_test", password }) });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("Set-Cookie").split(";")[0];
    const dispatch = (path, method = "GET", body) => worker.dispatchFetch(origin + path, {
      method, headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" }, body
    });
    const care = "/api/account/care";
    const seed = await dispatch(care, "PUT", JSON.stringify({ owner, revision: 0, zone: "UTC",
      records: { ...emptyCareRecords(), water: [fresh], visits: { v: visit } } }));
    expect(seed.status).toBe(200);
    const latest = async () => (await dispatch(care)).json();
    const connect = page => page.route("**/api/**", async route => {
      const request = route.request();
      const { pathname, search } = new URL(request.url());
      const response = await dispatch(pathname + search, request.method(), request.postDataBuffer() ?? undefined);
      await route.fulfill({ status: response.status, contentType: response.headers.get("Content-Type") ?? "application/json",
        body: Buffer.from(await response.arrayBuffer()) });
    });
    const state = page => page.evaluate(async () => (await import("/medication/shared/storage.js")).accessCare());
    const file = await writeWebBackup({ ...emptyCareRecords(), water: [old] }, password, () => true);
    await connect(page);
    await page.goto("/medication/?view=account");
    await expect(page.locator("#account-session")).toBeVisible();
    await expect.poll(async () => (await state(page)).water.map(row => row.id)).toEqual(["fresh"]);
    await page.locator("#account-care-key").locator("..").locator("..").locator("summary").click();
    await page.locator("#account-care-key").fill(recoveryKey);
    await page.locator("#account-care-key-unlock").click();
    await expect.poll(async () => (await latest()).records.privacyVersion).toBe(1);
    expect(JSON.stringify(await latest())).not.toContain(visit.note);

    secondContext = await browser.newContext({ serviceWorkers: "block" });
    const second = await secondContext.newPage();
    await connect(second);
    await second.goto(new URL("/medication/?view=account", page.url()).href);
    await expect(second.locator("#account-session")).toBeVisible();
    await expect(second.locator("#account-sync-status")).not.toBeEmpty();
    expect((await state(second)).visits?.v).toBeUndefined();
    await second.locator("#account-care-key").locator("..").locator("..").locator("summary").click();
    await second.locator("#account-care-key").fill(recoveryKey);
    await second.locator("#account-care-key-unlock").click();
    await expect.poll(async () => (await state(second)).visits?.v?.note).toBe(visit.note);
    await secondContext.close();
    secondContext = null;

    await page.locator('[data-account-shortcut="backup-settings"]').click();
    const form = page.locator("#android-restore");
    const restore = async (mode, handleConfirmation = () => {}) => {
      await form.locator('input[type=file]').setInputFiles({ name: "synthetic.medora", mimeType: "application/octet-stream", buffer: Buffer.from(file) });
      await page.locator("#backup-restore-mode").selectOption(mode);
      await page.locator("#android-backup-password").fill(password);
      await page.locator("#android-backup-confirm").check();
      handleConfirmation();
      await page.locator("#android-restore-submit").click();
      await expect(page.locator("#android-restore-status")).toHaveAttribute("data-state", "success");
    };
    await restore("device");
    expect((await state(page)).restoreRecovery.water).toEqual([fresh]);
    expect((await latest()).records.water).toEqual([fresh]);
    await restore("merge");
    await expect.poll(async () => (await latest()).records.water.map(row => row.id)).toEqual(["fresh", "old"]);
    await restore("replace", () => page.once("dialog", async dialog => {
      const snapshot = await latest();
      const changed = { id: "newer-concurrent", day: 20002, time: "10:00", amount: 300 };
      const result = await dispatch(care, "PUT", JSON.stringify({ ...snapshot,
        records: { ...snapshot.records, water: [...snapshot.records.water, changed] } }));
      expect(result.status).toBe(200);
      await dialog.accept();
    }));
    await expect.poll(async () => (await state(page)).accountCare?.restore?.mode).toBe("replace");
    await page.locator("#settings-dialog [data-close]").first().click();
    await page.locator(".app-bar [data-open-account]").click();
    await expect(page.locator("#account-sync-status")).toHaveText(/پس از تأیید/);
    expect((await latest()).records.water.map(row => row.id)).toEqual(["fresh", "old", "newer-concurrent"]);
    await page.locator('[data-account-shortcut="backup-settings"]').click();
    await restore("replace", () => page.once("dialog", dialog => dialog.accept()));
    await expect.poll(async () => (await latest()).records.water).toEqual([old]);
    page.once("dialog", dialog => dialog.dismiss());
    await page.locator("#clear-device-records").click();
    expect((await state(page)).water).toEqual([old]);
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#clear-device-records").click();
    await expect.poll(async () => (await state(page)).water).toEqual([]);
    expect((await latest()).records.water).toEqual([old]);
  } finally {
    await secondContext?.close();
    await worker.dispose();
  }
});
