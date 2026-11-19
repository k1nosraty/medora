import { expect, test } from "../browser/runner.mjs";
import { createHmac, scryptSync } from "node:crypto";
import { once } from "node:events";
import { browserServer } from "../browser/server.mjs";
import { fileURLToPath } from "node:url";
import { build, Miniflare, convertV4MiniflareOptions } from "./workerd.mjs";

test.skip(!process.env.MEDORA_PUBLIC_DIR, "Runs against the rebuilt product");
const date = new Date(2026, 10, 18, 13, 30);
const stateOf = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("medora-medication-prototype");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const read = db.transaction(["care", "days"]);
          const row = read.objectStore("care").get("state");
          const days = read.objectStore("days").getAll();
          read.oncomplete = () => {
            db.close();
            resolve({
              ...row.result.settings,
              doses: Object.assign(
                {},
                ...days.result.map((bucket) => bucket.doses),
              ),
              version: db.version,
            });
          };
          read.onerror = () => {
            db.close();
            reject(read.error);
          };
        };
      }),
  );

async function start(
  page,
  language,
  viewport,
  { runningClock = false, origin = "" } = {},
) {
  await page.setViewportSize(viewport);
  if (runningClock) await page.clock.install({ time: date });
  else await page.clock.setFixedTime(date);
  await page.addInitScript(
    (language) => localStorage.setItem("medora-language", language),
    language,
  );
  await page.goto(origin + "/medication/");
  await page.locator("#welcome-start").click();
  await expect(page.locator("#app")).toBeVisible();
  await page.locator("#program-medications").click();
  await expect(page.locator("#app")).toHaveAttribute(
    "data-active-screen",
    "medications",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "dir",
    language === "fa" ? "rtl" : "ltr",
  );
}

async function saveEditor(page) {
  const dialog = page.locator("#medication-dialog");
  for (const focus of ["#editor-schedule", "#editor-confirm"]) {
    await dialog.locator("#editor-next").click();
    await expect(dialog.locator(focus)).toBeFocused();
  }
  await dialog.locator("#editor-next").click();
  await expect(dialog).toBeHidden();
}

async function createPlan(page, name) {
  await page.locator("#add").click();
  await page.locator("#name").fill(name);
  await saveEditor(page);
}

function planNamed(page, name) {
  return page
    .locator("#plans article")
    .filter({ has: page.getByRole("button", { name, exact: true }) });
}

async function openPlanEditor(page, name) {
  const dialog = page.locator("#medication-dialog");
  await expect(page.locator("#plans p.empty")).toBeVisible();
  await page.locator("#add").press("Enter");
  await expect(dialog.locator("#editor-identity")).toBeFocused();
  await dialog.locator("#editor-next").click();
  await expect(dialog.locator("#name")).toBeFocused();
  await dialog.locator("#name").fill(name);
  return dialog;
}

async function seedPlan(page, name, taken = false) {
  const id = "medication-journey";
  await page.evaluate(async ({ id, name, taken }) => {
    const { accessCare } = await import("/medication/shared/storage.js");
    const { today } = await import("/medication/shared/ui/dates.js");
    const day = today();
    await accessCare((state) => {
      state.medicationSnoozeMinutes = 45;
      state.medicines[id] = {
        id, name, unit: "tablet", icon: "capsule", color: "green",
        stock: taken ? 14500 : 15000, threshold: 2000, revision: 1,
        phases: [{ start: day, end: null, interval: 1, mask: 127,
          slots: [{ minute: 570, amount: 500 }] }],
      };
      if (taken) state.doses[id + "|" + day + "|570"] = {
        medicineId: id, day, minute: 570, planned: 500, actual: 500,
        status: "taken", debit: 500,
      };
    });
  }, { id, name, taken });
  await page.reload();
  return id;
}

const medicationTest = test.extend({
  page: async ({ page }, use) => {
    const legacyRequests = [];
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route(
      /\/medication\/features\/medicines\/(editor|view|appearance)\.js$/,
      (route) => {
        legacyRequests.push(route.request().url());
        return route.abort();
      },
    );
    await use(page);
    expect(legacyRequests).toEqual([]);
    expect(errors).toEqual([]);
  },
});

medicationTest.describe("React medication and dose journeys", () => {
  medicationTest.use({ serviceWorkers: "block" });
  for (const language of ["fa", "en"]) {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1280, height: 850 },
    ]) {
      const profile = language + " " + viewport.width;
      const name = language === "fa"
        ? "نام طولانی داروی آزمایشی برای بررسی چیدمان فهرست"
        : "Schedule fixture";

      medicationTest(profile + " validates and saves a localized snooze preference", async ({ page }) => {
        await start(page, language, viewport);
        await expect(page.locator("#snooze-form")).toHaveCount(0);
        await page.locator(".header-tools [data-destination=settings]").click();
        await page.locator('[data-settings-panel="snooze-settings"]').click();
        const snoozeForm = page.locator("#snooze-form");
        await snoozeForm.locator('label:has(input[value="custom"])').click();
        const minutes = snoozeForm.locator("#snooze-minutes");
        await minutes.fill("1441");
        await snoozeForm.locator("button").click();
        await expect(minutes).toBeFocused();
        await expect(page.locator("#settings-status")).toHaveAttribute(
          "data-state",
          "error",
        );
        await minutes.fill(language === "fa" ? "۴۵" : "45");
        await snoozeForm.locator("button").click();
        await expect(page.locator("#settings-status")).toHaveAttribute(
          "data-state",
          "success",
        );
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
        await expect(page.locator("#settings-dialog")).toBeHidden();
        expect((await stateOf(page)).medicationSnoozeMinutes).toBe(45);
      });

      medicationTest(profile + " validates exact dates, phased schedules and weekly intervals", async ({ page }) => {
        await start(page, language, viewport);
        await expect(page.locator("#phase-template")).toHaveCount(0);
        const dialog = await openPlanEditor(page, name);
        await dialog.locator("#editor-next").click();
        const stage = dialog.locator(".phase").first();
        await stage.locator(".repeat").selectOption("dates");
        await dialog.locator("#editor-next").click();
        await expect(stage.locator(".add-exact-day")).toBeFocused();
        await expect(stage.locator(".add-exact-day")).toHaveAttribute(
          "aria-invalid",
          "true",
        );
        await stage.locator(".add-exact-day").click();
        await page.locator("#picker-date-confirm").click();
        await expect(stage.locator(".exact-days button")).toHaveCount(1);
        await dialog.locator("label:has(#phased-mode)").click();
        await expect(dialog.locator("#phase-mode-warning")).toBeVisible();
        await dialog.locator("#add-phase").click();
        const newStage = dialog.locator(".phase").nth(1);
        await expect(newStage.locator('[data-for="start"]')).toBeFocused();
        await newStage.locator(".remove-phase").click();
        await dialog.locator("label:has(#regular-mode)").click();
        await expect(stage.locator(".repeat")).toHaveValue("dates");
        await stage.locator(".repeat").selectOption("weekly");
        await expect(stage.locator(".weekdays input:checked")).toHaveCount(1);
        await stage.locator(".interval").fill("53");
        await dialog.locator("#editor-next").click();
        await expect(stage.locator(".interval")).toBeFocused();
        await stage.locator(".repeat").selectOption("daily");
        await dialog.locator("#editor-next").click();
        await expect(dialog.locator("#editor-confirm")).toBeFocused();
      });

      medicationTest(profile + " edits optional schedule dates and restores focus after slot changes", async ({ page }) => {
        await start(page, language, viewport);
        const dialog = await openPlanEditor(page, name);
        await dialog.locator("#editor-next").click();
        const stage = dialog.locator(".phase").first();
        await stage.locator('[data-for="end"]').click();
        await page.locator("#picker-date-confirm").click();
        await expect(stage.locator("input.end")).not.toHaveValue("");
        await stage.locator('[data-for="end"]').click();
        await page.locator("#picker-clear-date").click();
        await expect(stage.locator("input.end")).toHaveValue("");
        await stage.locator(".add-slot").click();
        await expect(stage.locator('[data-for="time"]').last()).toBeFocused();
        await stage.locator(".remove-slot").last().click();
        await expect(stage.locator(".add-slot")).toBeFocused();
      });

      medicationTest(profile + " saves a styled schedule with a timed dose", async ({ page }) => {
        await start(page, language, viewport);
        const dialog = await openPlanEditor(page, name);
        await dialog.locator("#medicine-appearance").click();
        await page.locator('#medicine-icons [data-choice="capsule"]').click();
        await page.locator('#medicine-colors [data-choice="green"]').click();
        await page.locator("#appearance-confirm").click();
        await expect(dialog.locator("#medicine-appearance")).toBeFocused();
        await dialog.locator("#editor-next").click();
        const stage = dialog.locator(".phase").first();
        await stage.locator('[data-for="time"]').click();
        await page.locator("#keyboard-hour").fill("09");
        await page.locator("#keyboard-minute").fill("30");
        await page.locator("#picker-time-confirm").click();
        await expect(stage.locator("input.time")).toHaveValue("09:30");
        await stage.locator('[data-dose-value="500"]').click();
        await stage.locator(".dose-unit-link").click();
        await expect(dialog.locator("#unit")).toBeFocused();
        await dialog.locator("#stock").fill(language === "fa" ? "۱۵" : "15");
        await expect(dialog.locator("#threshold")).toBeVisible();
        await dialog.locator("#editor-next").click();
        await expect(dialog.locator("#editor-confirm")).toBeFocused();
        await dialog.locator("#editor-next").click();
        await expect(dialog).toBeHidden();
        const original = await stateOf(page);
        const [id] = Object.keys(original.medicines);
        expect(original.medicines[id]).toMatchObject({
          name,
          icon: "capsule",
          color: "green",
          stock: 15000,
          phases: [{ slots: [{ minute: 570, amount: 500 }] }],
        });
        const plan = planNamed(page, name);
        await expect(plan).toBeVisible();
        await expect(plan.locator(".medication-banner")).toHaveAttribute(
          "data-shape",
          "capsule",
        );
        await expect(page.locator("#med-day-doses article")).toHaveCount(1);
      });

      medicationTest(profile + " snoozes, records, edits, skips and undoes a dose with stock", async ({ page }) => {
        await start(page, language, viewport);
        const id = await seedPlan(page, name);
        const plan = planNamed(page, name);
        await plan.locator(".refill summary").click();
        await plan.locator(".refill input").fill("2");
        await plan.locator(".refill button").click();
        await expect
          .poll(async () => (await stateOf(page)).medicines[id].stock)
          .toBe(17000);
        const dose = page.locator("#med-day-doses article");
        const options = dose.locator("summary");
        await options.press("Enter");
        await dose.locator("input").fill("0");
        await dose.locator("form button").click();
        await expect(dose.locator("form [role=status]")).not.toBeEmpty();
        await options.press("Escape");
        await expect(options).toBeFocused();
        const snooze = dose.locator(".day-card-menu > button").first();
        await options.press("Enter");
        await snooze.click();
        await expect(dose.locator(".badge")).toHaveAttribute(
          "data-status",
          "snoozed",
        );
        const postponed = await stateOf(page);
        expect(postponed.medicationSnoozeMinutes).toBe(45);
        expect(Object.values(postponed.doses)[0].snoozeUntil).toBe(
          date.getTime() + 45 * 60_000,
        );
        await dose.locator(".care-record-action").click();
        await expect(dose.locator(".badge")).toHaveAttribute(
          "data-status",
          "taken",
        );
        await options.click();
        await dose.locator("input").fill(language === "fa" ? "۳/۴" : "3/4");
        await dose.locator("form button").click();
        await expect
          .poll(async () => (await stateOf(page)).medicines[id].stock)
          .toBe(16250);
        await options.click();
        await dose.locator(".day-card-menu > button").nth(1).click();
        await expect(dose.locator(".badge")).toHaveAttribute(
          "data-status",
          "skipped",
        );
        await options.click();
        await dose.locator(".day-card-menu > button").last().click();
        await expect(dose.locator(".badge")).toHaveAttribute(
          "data-status",
          "pending",
        );
        await dose.locator(".care-record-action").click();
        await expect(dose.locator(".badge")).toHaveAttribute(
          "data-status",
          "taken",
        );
      });

      medicationTest(profile + " searches the cabinet, checks dose history and keeps browser navigation", async ({ page }) => {
        await start(page, language, viewport);
        const id = await seedPlan(page, name, true);
        const plan = planNamed(page, name);
        await plan.locator(".treatment-name").click();
        const details = page.locator("#medicine-details");
        await expect(details.locator(".dose-history li")).toHaveCount(1);
        await page.keyboard.press("Escape");
        await expect(plan.locator(".treatment-name")).toBeFocused();
        await createPlan(page, "Second cabinet fixture");
        await page.locator("#cabinet-search").fill("missing");
        await expect(page.locator("#cabinet-empty")).toBeVisible();
        await page
          .locator("#cabinet-search")
          .fill(language === "fa" ? "آزمايشي" : "sChEdUlE");
        await expect(plan).toBeVisible();
        await expect(planNamed(page, "Second cabinet fixture")).toBeHidden();
        await page.locator("#cabinet-search").clear();
        await plan.locator('input[role="switch"]').uncheck();
        await expect
          .poll(async () => (await stateOf(page)).medicines[id].paused)
          .toBe(true);
        await plan.locator('input[role="switch"]').check();
        await expect
          .poll(async () => (await stateOf(page)).medicines[id].paused)
          .toBe(false);
        await page.goBack();
        await expect(page.locator("#app")).toHaveAttribute(
          "data-active-screen",
          "today",
        );
        await expect(page.locator("#doses [data-react-dose]")).not.toHaveCount(
          0,
        );
        await page.goForward();
        await expect(page.locator("#app")).toHaveAttribute(
          "data-active-screen",
          "medications",
        );
      });

      medicationTest(profile + " audits the cabinet, details and editor", async ({ page }, testInfo) => {
        await start(page, language, viewport);
        await seedPlan(page, name, true);
        const plan = planNamed(page, name);
        await expect(plan).toBeVisible();
        await page.screenshot({
          path: testInfo.outputPath("cabinet.png"),
          animations: "disabled",
        });
        const { default: AxeBuilder } = await import("@axe-core/playwright");
        const audit = async () =>
          (
            await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
              .analyze()
          ).violations.map(({ id, nodes }) => ({
            id,
            targets: nodes.map(({ target }) => target),
          }));
        expect(await audit()).toEqual([]);
        await plan.locator(".treatment-name").click();
        const details = page.locator("#medicine-details");
        await page.screenshot({
          path: testInfo.outputPath("details.png"),
          animations: "disabled",
        });
        expect(await audit()).toEqual([]);
        await details
          .locator("#medicine-details-body > button")
          .first()
          .click();
        await page.screenshot({
          path: testInfo.outputPath("editor.png"),
          animations: "disabled",
        });
        expect(await audit()).toEqual([]);
        await page.keyboard.press("Escape");
      });
    }
  }
});

async function fixtureWorker() {
  const { outputFiles } = await build({
    absWorkingDir: fileURLToPath(new URL("../../apps/compat-worker/", import.meta.url)),
    entryPoints: ["src/worker.mjs"],
    bundle: true,
    platform: "browser",
    format: "esm",
    external: ["cloudflare:workers", "node:crypto", "node:buffer"],
    write: false,
  });
  const secret = "6".repeat(64);
  const worker = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: outputFiles[0].text,
      compatibilityDate: "2026-10-29",
      compatibilityFlags: ["nodejs_compat"],
      durableObjects: {
        EMAIL_ACCOUNTS: { className: "EmailAccount", useSQLite: true },
        CREDENTIALS: { className: "Credentials", useSQLite: true },
      },
      ratelimits: {
        EMAIL_AUTH_LIMIT: {
          namespace_id: "750517",
          simple: { limit: 8, period: 60 },
        },
      },
      bindings: { EMAIL_AUTH_SECRET: secret },
    }),
  );
  try {
    const hmac = (purpose, value) =>
      createHmac("sha256", secret)
        .update(purpose + ":" + value)
        .digest("hex");
    const email = "medication-fixture@example.test";
    const owner = hmac("account-v1", email);
    const origin = "https://medication-fixture.test";
    const password = "synthetic dose fixture password";
    const salt = "7".repeat(32);
    const proof = scryptSync(hmac("password-v1", password), salt, 32, {
      N: 16384,
      r: 8,
      p: 5,
      maxmem: 32 * 1024 * 1024,
    }).toString("hex");
    const index = await worker.getDurableObjectNamespace("CREDENTIALS");
    await index
      .get(index.idFromName("medora-credentials-v1"))
      .register("medication_fixture", owner, email, salt, proof);
    const login = await worker.dispatchFetch(origin + "/api/auth/login", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ username: "medication_fixture", password }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("Set-Cookie").split(";")[0];
    await login.arrayBuffer();
    const dispatch = (path, method = "GET", body, headers = {}) =>
      worker.dispatchFetch(origin + path, {
        method,
        headers: {
          ...headers,
          Origin: origin,
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body,
      });
    return {
      dispatch,
      stop: () => worker.dispose(),
      latest: async () => (await dispatch("/api/account/care")).json(),
    };
  } catch (error) {
    await worker.dispose();
    throw error;
  }
}

test("offline React medication changes survive reload and reconcile after a lost Workerd acknowledgement", async ({
  page,
  context,
}) => {
  test.setTimeout(75_000);
  const fixture = await fixtureWorker();
  let dropAcknowledgement = false;
  let lost = 0;
  let recoveredReads = 0;
  const gateway = browserServer(async (request, reply, url) => {
    if (!["/api/auth/session", "/api/account/care"].includes(url.pathname))
      return false;
    const headers = Object.fromEntries(
      Object.entries(request.headers).filter(([key]) => key.startsWith("if-")),
    );
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const response = await fixture.dispatch(
        url.pathname + url.search,
        request.method,
        chunks.length ? Buffer.concat(chunks) : undefined,
        headers,
      );
      if (url.pathname === "/api/account/care") {
        if (request.method === "PUT" && response.ok && dropAcknowledgement) {
          dropAcknowledgement = false;
          lost++;
          await response.arrayBuffer();
          reply
            .writeHead(503, { "Content-Type": "application/json" })
            .end('{"error":"unavailable"}');
          return true;
        }
        if (lost && request.method === "GET") recoveredReads++;
      }
      const outgoing = Object.fromEntries(response.headers);
      delete outgoing["content-length"];
      delete outgoing["content-encoding"];
      reply.writeHead(response.status, outgoing);
      reply.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      reply.writeHead(503).end();
    }
    return true;
  }).listen(0, "127.0.0.1");
  await once(gateway, "listening");
  const origin = "http://127.0.0.1:" + gateway.address().port;
  try {
    await start(
      page,
      "en",
      { width: 390, height: 844 },
      { runningClock: true, origin },
    );
    await createPlan(page, "Offline original");
    await createPlan(page, "Offline removal");
    await page.locator("#open-account").click();
    await expect(page.locator("#account-session")).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#account-sync-enable").click();
    await expect
      .poll(
        async () =>
          Object.keys((await fixture.latest()).records?.medicines ?? {}).length,
      )
      .toBe(2);
    await expect(page.locator("#account-sync-badge")).toHaveAttribute(
      "data-enabled",
      "true",
    );
    await page.keyboard.press("Escape");
    const initial = await stateOf(page);
    const [edited, removed] = Object.values(initial.medicines);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller)
        await new Promise((resolve) =>
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            resolve,
            { once: true },
          ),
        );
    });
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator("#plans article")).toHaveCount(2);
    await createPlan(page, "Offline addition");
    await planNamed(page, edited.name)
      .locator(".buttons button")
      .first()
      .click();
    await page.locator("#name").fill("Edited offline");
    await saveEditor(page);
    await planNamed(page, removed.name).locator(".danger-link").click();
    await page.locator("#confirm-delete").click();
    await expect(planNamed(page, removed.name)).toHaveCount(0);
    const dose = page
      .locator("#med-day-doses article")
      .filter({ hasText: "Edited offline" });
    await dose.locator(".care-record-action").click();
    await expect(dose.locator(".badge")).toHaveAttribute(
      "data-status",
      "taken",
    );
    await page.reload();
    await expect(dose.locator(".badge")).toHaveAttribute(
      "data-status",
      "taken",
    );
    const pending = await stateOf(page);
    expect(pending.accountCare.revision).toBe(initial.accountCare.revision);
    const addition = Object.values(pending.medicines).find(
      (plan) => plan.name === "Offline addition",
    );
    const doseId = Object.keys(pending.doses)[0];
    expect(pending.doses[doseId]).toMatchObject({
      medicineId: edited.id,
      status: "taken",
    });
    dropAcknowledgement = true;
    await context.setOffline(false);
    await expect.poll(() => lost).toBe(1);
    await page.clock.fastForward(32_000);
    await expect.poll(() => recoveredReads).toBeGreaterThan(0);
    await expect
      .poll(async () => (await stateOf(page)).accountCare.revision)
      .toBe(initial.accountCare.revision + 1);
    const synced = await fixture.latest();
    expect(Object.keys(synced.records.medicines).sort()).toEqual(
      [edited.id, addition.id].sort(),
    );
    expect(synced.records.medicines[edited.id].name).toBe("Edited offline");
    expect(Object.keys(synced.records.doses)).toEqual([doseId]);
    expect(synced.records.doses[doseId]).toMatchObject({
      medicineId: edited.id,
      status: "taken",
    });
    expect(synced.revision).toBe(initial.accountCare.revision + 1);
    await page.reload();
    await expect(dose.locator(".badge")).toHaveAttribute(
      "data-status",
      "taken",
    );
  } finally {
    await context.close();
    await new Promise((resolve) => gateway.close(resolve));
    await fixture.stop();
  }
});

for (const version of [1, 2, 3]) {
  test(`React edits historical IndexedDB v${version} medication and dose records without losing extensions`, async ({
    page,
  }) => {
    await page.clock.setFixedTime(date);
    await page.goto("/");
    const fixture = await page.evaluate(
      (version) =>
        new Promise((resolve, reject) => {
          localStorage.setItem("medora-language", "en");
          const request = indexedDB.open(
            "medora-medication-prototype",
            version,
          );
          const at = new Date();
          const day =
            Date.UTC(at.getFullYear(), at.getMonth(), at.getDate()) / 86400000;
          const id = "historical-plan";
          const doseKey = id + "|" + day + "|480";
          const settings = {
            intro: "done",
            medicines: {
              [id]: {
                id,
                name: "Historical plan",
                unit: "tablet",
                revision: 1,
                stock: 5000,
                threshold: 2000,
                extension: { keep: true },
                phases: [
                  {
                    start: day - 1,
                    end: null,
                    mask: 127,
                    interval: 1,
                    testStage: "preserved",
                    slots: [
                      { minute: 480, amount: 1000, testSlot: "preserved" },
                    ],
                  },
                ],
              },
            },
            accountCare: {
              enabled: false,
              revision: 12,
              owner: "synthetic-owner",
              base: { fixture: true },
            },
            careExtension: { keep: true },
          };
          const doses = {
            [doseKey]: {
              medicineId: id,
              day,
              minute: 480,
              planned: 1000,
              actual: 1000,
              status: "taken",
              debit: 1000,
              doseExtension: { test: "old-data" },
            },
          };
          request.onupgradeneeded = () => {
            const db = request.result;
            const care = db.createObjectStore("care");
            if (version === 1)
              care.put({ ...settings, doses, water: [] }, "state");
            else {
              care.put({ settings, revision: 9 }, "state");
              db.createObjectStore("days", { keyPath: "day" }).put({
                day,
                doses,
                water: [],
                bucketExtension: "preserved",
              });
            }
          };
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            request.result.close();
            resolve({ id, doseKey });
          };
        }),
      version,
    );
    await page.goto("/medication/?view=medications");
    await expect(page.locator("#plans article")).toHaveCount(1);
    const original = await stateOf(page);
    expect(original.version).toBe(3);
    const startRevision = original.accountCare.revision;
    const plan = planNamed(page, "Historical plan");
    await plan.locator(".buttons button").first().click();
    await page.locator("#name").fill("Historical plan edit");
    await saveEditor(page);
    const dose = page.locator("#med-day-doses article").first();
    await expect(dose.locator(".badge")).toHaveAttribute(
      "data-status",
      "taken",
    );
    await dose.locator("summary").click();
    await dose.locator("input").fill("1.5");
    await dose.locator("form button").click();
    await expect
      .poll(async () => (await stateOf(page)).doses[fixture.doseKey]?.actual)
      .toBe(1500);
    await page.reload();
    const saved = await stateOf(page);
    expect(saved.version).toBe(3);
    expect(saved.accountCare).toEqual(original.accountCare);
    expect(saved.accountCare.revision).toBe(startRevision);
    expect(saved.careExtension).toEqual({ keep: true });
    expect(Object.keys(saved.doses)).toEqual([fixture.doseKey]);
    expect(saved.doses[fixture.doseKey]).toMatchObject({
      medicineId: fixture.id,
      doseExtension: { test: "old-data" },
      actual: 1500,
    });
    expect(saved.medicines[fixture.id]).toMatchObject({
      id: fixture.id,
      name: "Historical plan edit",
      revision: 2,
      stock: 4500,
      extension: { keep: true },
      phases: [{ testStage: "preserved", slots: [{ testSlot: "preserved" }] }],
    });
    await planNamed(page, "Historical plan edit")
      .locator(".treatment-name")
      .click();
    await expect(page.locator(".dose-history li")).toHaveCount(1);
    if (version === 3) {
      await page.locator("#medicine-details-body > button").first().click();
      await page.locator("#name").fill("Outdated edit");
      await page.evaluate(async (id) => {
        const { accessCare } = await import("/medication/shared/storage.js");
        await accessCare((state) => {
          state.medicines[id].revision++;
          state.medicines[id].name = "Concurrent edit";
        });
      }, fixture.id);
      const next = page.locator("#editor-next");
      await next.click();
      await next.click();
      await next.click();
      await expect(page.locator("#editor-status")).toContainText(
        /changed in another window/i,
      );
      expect((await stateOf(page)).medicines[fixture.id].name).toBe(
        "Concurrent edit",
      );
      await page.goto("/medication/?view=insights");
      await expect(
        page.locator("#calendar-entries [data-react-dose]"),
      ).toHaveCount(1);
      const options = page.locator(
        "#calendar-entries [data-react-dose] summary",
      );
      await options.press("Enter");
      await expect(
        page.locator("#calendar-entries [data-react-dose] .day-card-menu"),
      ).toBeVisible();
      await options.press("Escape");
      await expect(options).toBeFocused();
    }
  });
}

test.describe("Delegated React dose form", () => {
  test.use({ serviceWorkers: "block" });
  test("family medicine record respects the active grant and keeps one operation across a failed acknowledgement", async ({
    page,
    context,
  }) => {
    const origin = "http://127.0.0.1:8872";
    const id = "shared-medication-fixture";
    const day = Math.floor(date.getTime() / 86400000);
    let calls = 0;
    const actions = [];
    await context.addCookies([
      { name: "test-family", value: "1", url: origin },
      { name: "test-family-policy", value: "read", url: origin },
    ]);
    await page.route("**/api/family", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const request = route.request().postDataJSON();
      if (request.action === "view") {
        const response = await route.fetch();
        const projection = await response.json();
        projection.records.medicines[id] = {
          id,
          name: "Shared medicine",
          unit: "tablet",
          stock: null,
          threshold: 2000,
          revision: 1,
          phases: [
            {
              start: day,
              end: null,
              interval: 1,
              mask: 127,
              slots: [{ minute: 480, amount: 1000 }],
            },
          ],
        };
        return route.fulfill({ response, json: projection });
      }
      actions.push(request);
      const fail = ++calls === 1;
      await route.fulfill({
        status: fail ? 503 : 200,
        json: fail ? { error: "unavailable" } : { ok: true },
      });
    });
    await start(page, "en", { width: 390, height: 844 });
    async function member() {
      await page.locator(".header-tools [data-destination=settings]").click();
      await page.locator("#settings-open-family").click();
      await page
        .locator(".family-roster-row")
        .filter({ hasText: "Alex" })
        .click();
      await expect(page.locator("#family-home")).toBeVisible();
      await expect(page.locator("#today-focus .dose-card")).toContainText(
        "Shared medicine",
      );
    }
    await member();
    await expect(page.locator("#today-focus .care-record-action")).toHaveCount(
      0,
    );
    await page.locator("#family-home").click();
    await context.addCookies([
      { name: "test-family-policy", value: "write", url: origin },
    ]);
    await member();
    await page.locator("#today-focus .care-record-action").click();
    const family = page.locator("#family-dialog");
    await family.locator('input[name="amount"]').fill("invalid");
    await family.locator('button[type="submit"]').click();
    await expect(family.locator("#family-status")).not.toBeEmpty();
    expect(actions).toHaveLength(0);
    await family.locator('input[name="amount"]').fill("۰٫۵");
    await family.locator('button[type="submit"]').click();
    await expect.poll(() => actions.length).toBe(1);
    await expect(family.locator('button[type="submit"]')).toBeEnabled();
    await family.locator('button[type="submit"]').click();
    await expect(family).toBeHidden();
    expect(actions).toHaveLength(2);
    expect(actions[1]).toEqual(actions[0]);
    expect(actions[0]).toMatchObject({
      action: "record",
      kind: "medicine",
      id,
      status: "taken",
      amount: 500,
      day,
      minute: 480,
    });
    expect((await stateOf(page)).doses).toEqual({});
  });
});

test("the React cabinet and history open an encrypted Android v1 backup", async ({
  page,
}) => {
  await start(page, "en", { width: 390, height: 844 });
  await page.locator(".header-tools [data-destination=settings]").click();
  await page.locator('[data-settings-panel="backup-settings"]').click();
  await page
    .locator("#android-backup-file")
    .setInputFiles(
      fileURLToPath(
        new URL("../compatibility/fixtures/android-medora-v1.medora", import.meta.url),
      ),
    );
  await page.locator("#android-backup-password").fill("MedoraInterop2026");
  await page.locator("#android-backup-confirm").check();
  await page.locator("#android-restore-submit").click();
  await expect(page.locator("#android-restore-status")).toHaveAttribute(
    "data-state",
    "success",
  );
  const restored = await stateOf(page);
  expect(Object.values(restored.medicines)[0]?.icon).toBe("capsule");
  expect(
    Object.values(restored.doses).filter((dose) => dose.status === "taken"),
  ).toHaveLength(1);
  await page.goto("/medication/?view=medications");
  await page.locator(".treatment-name").first().click();
  await expect(
    page.locator("#medicine-details .dose-history li"),
  ).not.toHaveCount(0);
});
