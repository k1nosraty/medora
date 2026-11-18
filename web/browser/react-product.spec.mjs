import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { decryptBackup } from "../public/medication/shared/crypto/backup.js";

test.skip(!process.env.MEDORA_PUBLIC_DIR, "Runs against the rebuilt product");
test.use({ serviceWorkers: "block" });

async function open(page, language, view, viewport) {
  await page.setViewportSize(viewport);
  await page.goto("/medication/");
  await expect(page.locator("#welcome-start")).toBeVisible();
  await page.evaluate(async (locale) => {
    localStorage.setItem("medora-language", locale);
    const { accessCare } = await import("/medication/shared/storage.js");
    await accessCare((state) => {
      state.intro = "done";
    });
  }, language);
  await page.goto(`/medication/?view=${view}`);
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute(
    "dir",
    language === "fa" ? "rtl" : "ltr",
  );
}

test("water validates localized amounts and saves through the date and time controls", async ({
  page,
}) => {
  await open(page, "fa", "water", { width: 320, height: 720 });
  await page.locator("#water-custom-action").click();
  const form = page.locator("#water-custom");
  const amount = form.locator("#water-amount");
  await expect(amount).toBeFocused();
  await amount.fill("۰");
  await form.locator('[type="submit"]').click();
  await expect(amount).toHaveAttribute("aria-invalid", "true");
  await expect(amount).toBeFocused();
  await form.locator('[data-water-preset="500"]').click();
  await expect(amount).toHaveValue("۵۰۰");
  await expect(form.locator("#water-error")).toBeEmpty();
  await form.locator("summary").click();
  await expect(
    form.locator('.picker-field[data-for="water-log-day"]'),
  ).toBeVisible();
  await form.locator('.picker-field[data-for="water-log-time"]').click();
  await expect(page.locator("#time-picker")).toBeVisible();
  await page.locator("#keyboard-hour").fill("۳۰");
  await page.locator("#picker-time-confirm").click();
  await expect(page.locator("#keyboard-hour")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#keyboard-hour")).toBeFocused();
  await page.locator("#keyboard-hour").fill("۹");
  await page.locator("#keyboard-minute").fill("۰۵");
  await page.locator("#picker-time-confirm").click();
  await expect(form.locator("#water-when")).toContainText("۰۹:۰۵");
  await form.locator('[type="submit"]').click();
  await expect(page.locator("#water-dialog")).toBeHidden();
  await expect(page.locator("#water-entries")).toContainText("۵۰۰");
  await page.reload();
  await expect(page.locator("#water-entries")).toContainText("۵۰۰");
  await page.evaluate(async () => {
    const { accessCare } = await import("/medication/shared/storage.js");
    await accessCare((state) => {
      state.water[0].fixtureExtension = { preserve: true };
    });
  });
  await page.reload();
  await page.locator("#water-entries button:not(.water-entry-remove)").click();
  await amount.fill("۶۰۰");
  await form.locator('[type="submit"]').click();
  await expect(page.locator("#water-entries")).toContainText("۶۰۰");
  const saved = await page.evaluate(async () => {
    const { accessCare } = await import("/medication/shared/storage.js");
    return (await accessCare()).water[0];
  });
  expect(saved).toMatchObject({
    amount: 600,
    time: "09:05",
    fixtureExtension: { preserve: true },
  });
});

test("deletion opens an accessible confirmation and only commits after confirmation", async ({
  page,
}) => {
  await open(page, "en", "medications", { width: 390, height: 844 });
  await page.evaluate(async () => {
    const { accessCare } = await import("/medication/shared/storage.js");
    const { today } = await import("/medication/shared/ui/dates.js");
    await accessCare((state) => {
      state.medicines.fixture = {
        id: "fixture",
        name: "Fixture tablet",
        unit: "قرص",
        stock: 15000,
        threshold: 2000,
        icon: "bottle",
        color: "purple",
        revision: 1,
        phases: [
          {
            start: today(),
            end: null,
            interval: 1,
            mask: 127,
            slots: [{ minute: 480, amount: 1000 }],
          },
        ],
      };
    });
  });
  await page.reload();
  const plans = page.locator("#plans");
  const remove = plans.getByRole("button", {
    name: "Delete medicine",
    exact: true,
  });
  await remove.click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toHaveAccessibleName("Delete medicine");
  await expect(
    confirmation.getByRole("button", { name: "Cancel" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirmation).toBeHidden();
  await expect(plans).toContainText("Fixture tablet");
  await remove.click();
  await page.locator("#confirm-delete").click();
  await expect(confirmation).toBeHidden();
  const remains = await page.evaluate(async () => {
    const { accessCare } = await import("/medication/shared/storage.js");
    return Object.hasOwn((await accessCare()).medicines, "fixture");
  });
  expect(remains).toBe(false);
});

test("support handles authentication, shows progress and preserves a draft edited during send", async ({
  page,
}) => {
  await open(page, "en", "today", { width: 1280, height: 800 });
  let authorized = false;
  let posted;
  let finish;
  const release = new Promise((resolve) => {
    finish = resolve;
  });
  await page.route("**/api/support", async (route) => {
    if (!authorized) return route.fulfill({ status: 401, json: {} });
    if (route.request().method() === "POST") {
      posted = route.request().postDataJSON();
      await release;
      return route.fulfill({ status: 201, json: {} });
    }
    return route.fulfill({
      json: {
        tickets: [
          {
            id: "fixture",
            status: "open",
            message: "Synthetic support message",
            reply: "پاسخ آزمایشی",
          },
        ],
      },
    });
  });
  const settings = page.locator('.app-bar [data-destination="settings"]');
  const dialog = page.locator("#support-dialog");
  async function openSupport() {
    await settings.click();
    await page.locator("#open-support").click();
    await expect(dialog).toBeVisible();
  }
  await openSupport();
  await expect(dialog.locator("#support-sign-in")).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(settings).toBeFocused();
  authorized = true;
  await openSupport();
  await expect(dialog.locator("#support-history")).toContainText(
    "پاسخ آزمایشی",
  );
  const message = dialog.locator("#support-message");
  await message.fill("First fixture draft");
  await dialog.locator('button[type="submit"]').click();
  try {
    await expect.poll(() => posted).toEqual({ message: "First fixture draft" });
    await expect(dialog.locator("form")).toHaveAttribute("aria-busy", "true");
    await message.fill("Edited during send");
  } finally {
    finish();
  }
  await expect(dialog.locator("#support-status")).toContainText(/report sent/i);
  await expect(message).toHaveValue("Edited during send");
});

test("the React recovery form exports readable data from a newer IndexedDB without downgrading it", async ({
  page,
}) => {
  await open(page, "en", "today", { width: 390, height: 844 });
  await page.evaluate(async () => {
    const { accessCare } = await import("/medication/shared/storage.js");
    await accessCare((state) => {
      state.water = [
        { id: "recovery-fixture", day: 20000, time: "10:00", amount: 250 },
      ];
    });
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("medora-medication-prototype", 4);
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  });
  await page.reload();
  await expect(page.locator("#boot-status")).toContainText("older version");
  await page.locator("#boot-recovery summary").click();
  const password = "fixture password only";
  await page.locator("#boot-recovery-password").fill(password);
  const event = page.waitForEvent("download");
  await page.locator('#boot-recovery-form button[type="submit"]').click();
  const download = await event;
  expect(download.suggestedFilename()).toBe("medora-storage-recovery.medoraid");
  const recovered = await decryptBackup(
    await readFile(await download.path()),
    password,
    new TextEncoder().encode("MEDORAID"),
  );
  expect(recovered.databaseVersion).toBe(4);
  expect(recovered.days[0].water[0].id).toBe("recovery-fixture");
  await expect(page.locator("#boot-recovery-password")).toHaveValue("");
});

test("the React credential forms verify an account, protect password visibility and complete password recovery", async ({
  page,
}) => {
  const requests = [];
  let signedIn = false;
  const email = "browser-fixture@example.test";
  await page.route("**/api/auth/*", async (route) => {
    const method = new URL(route.request().url()).pathname.split("/").at(-1);
    const body = route.request().postDataJSON();
    requests.push({ method, body });
    switch (method) {
      case "session":
        return route.fulfill({
          json: {
            available: true,
            registrationAvailable: true,
            email: signedIn ? email : null,
          },
        });
      case "register-code":
      case "reset-code":
        return route.fulfill({
          status: 202,
          json: { challenge: `fixture-${method}` },
        });
      case "confirm-email":
        return route.fulfill({ json: { grant: "fixture-grant" } });
      case "register":
        signedIn = true;
        return route.fulfill({ json: { email, username: "browser_fixture" } });
      case "logout":
        signedIn = false;
    }
    return route.fulfill({ json: {} });
  });
  await open(page, "en", "today", { width: 390, height: 844 });
  await page.locator("#open-account").click();
  await expect(page.locator("#password-login")).toBeVisible();
  const password = page.locator("#login-password");
  await password.fill("synthetic password draft");
  const reveal = page.locator('[data-reveal-password="login-password"]');
  await reveal.click();
  await expect(reveal).toHaveAttribute("aria-pressed", "true");
  await expect(password).toHaveAttribute("type", "text");
  await page.locator('[data-close="account-dialog"]').first().click();
  await page.locator("#open-account").click();
  await expect(password).toHaveValue("");
  await expect(password).toHaveAttribute("type", "password");
  await page.locator('[data-account-mode="email"]').click();
  await page.locator("#account-email").fill(email);
  await page.locator('#email-start [type="submit"]').click();
  await expect(page.locator("#account-recipient")).toHaveText(email);
  await page.locator("#account-code").fill("۱۲۳۴۵۶");
  await page.locator('#email-verify [type="submit"]').click();
  await page.locator("#register-username").fill("browser_fixture");
  await page.locator("#register-password").fill("synthetic fixture password");
  await page.locator('#password-register [type="submit"]').click();
  await expect(page.locator("#account-username")).toHaveText("browser_fixture");
  expect(
    requests.find(({ method }) => method === "confirm-email")?.body.code,
  ).toBe("123456");
  expect(requests.find(({ method }) => method === "register")?.body.grant).toBe(
    "fixture-grant",
  );
  await page.locator("#email-logout").click();
  await page.locator("#forgot-password").click();
  await page.locator("#reset-email").fill(email);
  await page.locator('#reset-email-form [type="submit"]').click();
  await page.locator("#reset-code").fill("٦٥٤٣٢١");
  await page.locator("#reset-password").fill("synthetic replacement password");
  await page.locator('#reset-password-form [type="submit"]').click();
  await expect(page.locator("#password-login")).toBeVisible();
  expect(
    requests.find(({ method }) => method === "reset-password")?.body,
  ).toMatchObject({ email, code: "654321", challenge: "fixture-reset-code" });
});
