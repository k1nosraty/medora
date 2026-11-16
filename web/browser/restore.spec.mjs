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
    let loseRotationAcknowledgement = false;
    let rejectStaleRotation = false;
    let loseReplacementAcknowledgement = false;
    let disabledReminder;
    const connect = page => page.route("**/api/**", async route => {
      const request = route.request();
      const { pathname, search } = new URL(request.url());
      if (pathname === "/api/reminders" && request.method() === "PUT" &&
          request.headers().authorization === "Bearer synthetic-clearing-token") {
        disabledReminder = request.postDataJSON();
        await route.fulfill({ json: { enabled: false, revoked: true, revision: disabledReminder.revision } });
        return;
      }
      if (rejectStaleRotation && request.method() === "PUT" && pathname === care && request.postDataJSON()?.rotationProof) {
        rejectStaleRotation = false;
        const { owner, revision } = request.postDataJSON();
        const moved = await dispatch(care, "PATCH", JSON.stringify({ owner, revision, zone: "America/Toronto" }));
        expect(moved.status).toBe(200);
        await moved.arrayBuffer();
      }
      const response = await dispatch(pathname + search, request.method(), request.postDataBuffer() ?? undefined);
      if (loseReplacementAcknowledgement && request.method() === "PUT" && pathname === care && response.ok) {
        loseReplacementAcknowledgement = false;
        await response.arrayBuffer();
        await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"unavailable"}' });
        return;
      }
      if (loseRotationAcknowledgement && request.method() === "PUT" && pathname === care &&
          request.postDataJSON()?.rotationProof && response.ok) {
        loseRotationAcknowledgement = false;
        await response.arrayBuffer();
        await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"unavailable"}' });
        return;
      }
      await route.fulfill({ status: response.status, contentType: response.headers.get("Content-Type") ?? "application/json",
        body: Buffer.from(await response.arrayBuffer()) });
    });
    const state = page => page.evaluate(async () => (await import("/medication/shared/storage.js")).accessCare());
    const file = await writeWebBackup({ ...emptyCareRecords(), water: [old] }, password, () => true);
    await connect(page);
    await page.goto("/medication/?view=account");
    await expect(page.locator("#account-session")).toBeVisible();
    const recoveryPanel = page.locator("details:has(#account-care-key)");
    await recoveryPanel.locator("summary").click();
    await page.locator("#account-care-key-generate").click();
    await expect(page.locator("#account-care-key")).toHaveAttribute("type", "text");
    await page.keyboard.press("Escape");
    await page.locator("#open-account").click();
    await expect(page.locator("#account-care-key")).toHaveAttribute("type", "password");
    await page.locator("#account-care-key-reveal").click();
    await expect(page.locator("#account-care-key")).toHaveAttribute("type", "text");
    await page.locator("#account-care-key-reveal").click();
    await expect(page.locator("#account-care-key")).toHaveAttribute("type", "password");
    await recoveryPanel.locator("summary").click();
    await expect.poll(async () => (await state(page)).water.map(row => row.id)).toEqual(["fresh"]);
    const beforeZone = await latest();
    const legacyZone = await dispatch(care, "PATCH", JSON.stringify({
      owner, revision: beforeZone.revision, zone: "+05:30"
    }));
    expect(legacyZone.status).toBe(200);
    await legacyZone.arrayBuffer();
    const zonePanel = page.locator("#account-care-zone-open > summary");
    const zoneChoices = page.locator("#account-care-zone-options");
    const zoneSearch = page.locator("#account-care-zone-search");
    const zoneRows = zoneChoices.locator(".time-zone-option:visible");
    await zonePanel.click();
    await expect(zoneChoices.locator("input:checked")).toHaveValue("+05:30");
    await expect(zoneChoices.locator("input:checked + span + bdi")).toHaveText("UTC+05:30");
    await expect(zoneRows.first()).toContainText(/منطقهٔ زمانی این دستگاه/);
    await zoneSearch.fill("PARIS");
    await expect(zoneRows).toHaveCount(1);
    await expect(zoneRows.locator("input")).toHaveValue("Europe/Paris");
    await zoneSearch.fill("تورنتو");
    await expect(zoneRows).toHaveCount(1);
    await expect(zoneRows.locator(".time-zone-offset")).toHaveText(/^UTC-0[45]:00$/);
    await zoneSearch.fill("unmatched city");
    await expect(page.locator("#account-care-zone-empty")).toBeVisible();
    await expect(zoneRows).toHaveCount(0);
    await zoneSearch.fill("تهران");
    await expect(zoneRows).toHaveCount(1);
    await expect(zoneRows.locator(".time-zone-offset")).toHaveText("UTC+03:30");
    await zoneRows.click();
    await expect(zoneChoices.locator("input:checked")).toHaveValue("Asia/Tehran");
    await page.locator("#account-care-zone-save").click();
    await expect.poll(async () => (await (await dispatch(care + "?zone")).json()).zone).toBe("Asia/Tehran");
    await zonePanel.click();
    await zonePanel.click();
    await expect(zoneChoices.locator("input:checked")).toHaveValue("Asia/Tehran");
    await zonePanel.click();
    const zoneRevision = (await latest()).revision;
    await expect.poll(async () => (await state(page)).accountCare?.revision).toBe(zoneRevision);
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
    await page.evaluate(() => {
      const digest = crypto.subtle.digest.bind(crypto.subtle);
      crypto.subtle.digest = async (algorithm, data) => {
        if (data instanceof Uint8Array && data.length === 32 && data.every(byte => byte === 0xdd)) {
          await new Promise(resolve => { window.finishSlowKeyImport = resolve; });
        }
        return digest(algorithm, data);
      };
    });
    await page.locator("#account-care-key").fill("d".repeat(64));
    await page.locator("#account-care-key-unlock").click();
    await page.waitForFunction(() => Boolean(window.finishSlowKeyImport));
    await page.locator("#account-care-key").fill(recoveryKey);
    await page.locator("#account-care-key-unlock").click();
    await expect(page.locator("#account-care-key")).toHaveValue("");
    await page.evaluate(() => window.finishSlowKeyImport());

    const rotated = "c".repeat(64);
    const firstRotationBase = await latest();
    expect(firstRotationBase.records.privacyRotation).toMatch(/^[a-f0-9]{64}$/);
    const denied = await dispatch(care, "PUT", JSON.stringify({ ...firstRotationBase,
      records: { ...firstRotationBase.records, privacyKey: "a".repeat(64) } }));
    expect(denied.status).toBe(422);
    await page.locator("#account-care-key").fill(rotated);
    rejectStaleRotation = true;
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#account-care-key-rotate").click();
    await expect(page.locator("#account-care-key-status")).toContainText("نتوانست تغییر کلید را تأیید کند");
    const beforeRotation = await latest();
    expect(beforeRotation.revision).toBe(firstRotationBase.revision + 1);
    expect(beforeRotation.records).toEqual(firstRotationBase.records);
    expect((await state(second)).visits.v.note).toBe(visit.note);
    await expect(page.locator("#account-sync-enable")).toBeEnabled();
    loseRotationAcknowledgement = true;
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#account-care-key-rotate").click();
    await expect.poll(async () => (await latest()).revision).toBe(beforeRotation.revision + 1);
    await expect(page.locator("#account-care-key-rotate")).toBeEnabled();
    await expect(page.locator("#account-care-key-status")).toContainText("نتوانست تغییر کلید را تأیید کند");
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#account-care-key-rotate").click();
    await expect.poll(async () => (await latest()).revision).toBe(beforeRotation.revision + 1);
    await expect(page.locator("#account-care-key-status")).toContainText("کلید بازیابی عوض شد");
    const afterRotation = await latest();
    expect(afterRotation.records.privacyKey).not.toBe(beforeRotation.records.privacyKey);
    expect(afterRotation.records.visits.v.privateText).not.toEqual(beforeRotation.records.visits.v.privateText);
    await second.locator("#account-sync-enable").click();
    await expect(second.locator("#account-sync-status")).toContainText("کلید بازیابی همین حساب");
    expect((await state(second)).visits.v.note).toBe(visit.note);
    await second.locator("#account-care-key").fill(rotated);
    await second.locator("#account-care-key-unlock").click();
    await expect.poll(async () => (await state(second)).accountCare.revision).toBe(afterRotation.revision);
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
    const beforeReplacement = (await latest()).revision;
    loseReplacementAcknowledgement = true;
    await restore("replace", () => page.once("dialog", dialog => dialog.accept()));
    await expect.poll(async () => (await latest()).records.water).toEqual([old]);
    await expect.poll(async () => (await state(page)).accountCare?.restore?.mode).toBe("replace");
    await page.locator("#settings-dialog [data-close]").first().click();
    await page.locator(".app-bar [data-open-account]").click();
    await page.locator("#account-sync-enable").click();
    await expect.poll(async () => (await state(page)).accountCare?.restore).toBeUndefined();
    expect((await latest()).revision).toBe(beforeReplacement + 1);
    // The two edits both start from the committed copy of the restored row.
    const cloudEdit = { ...old, amount: 500 };
    const snapshot = await latest();
    const edited = await dispatch(care, "PUT", JSON.stringify({ ...snapshot, records: { ...snapshot.records, water: [cloudEdit] } }));
    expect(edited.status).toBe(200);
    await page.evaluate(async () => {
      const { accessCare } = await import("/medication/shared/storage.js");
      await accessCare(state => { state.water[0].amount = 700; });
    });
    await page.locator("#account-sync-enable").click();
    await expect(page.locator("#account-sync-review")).toBeVisible();
    const comparison = page.locator("#account-sync-differences");
    await expect(comparison.locator("dt")).toHaveText(["مقدار"]);
    await expect(comparison.locator("dd bdi")).toHaveText(["۷۰۰ میلی‌لیتر", "۵۰۰ میلی‌لیتر"]);
    await expect(page.locator("#account-sync-review pre")).toHaveCount(0);
    expect((await state(page)).water[0].amount).toBe(700);
    expect((await latest()).records.water[0].amount).toBe(500);
    await page.locator("#account-sync-keep-cloud").click();
    await expect.poll(async () => (await state(page)).water).toEqual([cloudEdit]);
    await page.locator('[data-account-shortcut="backup-settings"]').click();
    await page.evaluate(async () => {
      const { accessCareSettings } = await import("/medication/shared/storage.js");
      await accessCareSettings(state => {
        state.reminders = { token: "synthetic-clearing-token", revision: 3, synced: 3, enabled: false, details: true };
      });
    });
    page.once("dialog", dialog => dialog.dismiss());
    await page.locator("#clear-device-records").click();
    expect((await state(page)).water).toEqual([cloudEdit]);
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#clear-device-records").click();
    await expect.poll(async () => (await state(page)).water).toEqual([]);
    await expect.poll(async () => (await state(page)).reminders).toBeUndefined();
    expect(disabledReminder).toEqual({ enabled: false, revoke: true, revision: 4 });
    expect((await latest()).records.water).toEqual([cloudEdit]);
  } finally {
    await secondContext?.close();
    await worker.dispose();
  }
});
