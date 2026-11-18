import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("Persian shell, English water form, offline editing and reload", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await page.goto("/journal/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("heading", { name: "امروز", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "English" }).click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Water", exact: true })
    .click();
  await page.getByLabel("Water (mL)").fill("375");
  await page.getByLabel("Time", { exact: true }).fill("08:30");
  await page.getByRole("button", { name: "Log water" }).click();
  await expect(page.getByRole("listitem")).toContainText("375");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((r) =>
        navigator.serviceWorker.addEventListener("controllerchange", r, {
          once: true,
        }),
      );
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("listitem")).toContainText("375");
  await page.getByRole("button", { name: "Edit 08:30" }).click();
  await page.getByLabel("Water (mL)").fill("400");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("listitem")).toContainText("400");
  await context.setOffline(false);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(audit.violations.map((v) => v.id)).toEqual([]);
});
test("encrypted export and restore with a new browser profile", async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto("/journal/");
  await page.getByRole("button", { name: "English" }).click();
  await page.getByRole("link", { name: "Log water" }).click();
  await page.getByRole("button", { name: "Log water" }).click();
  await expect(page.getByRole("listitem")).toContainText("250");
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Device data" })
    .click();
  const password = "synthetic browser fixture";
  await page.getByLabel("File password", { exact: true }).fill(password);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Create backup/ }).click();
  const file = await (await download).path();
  expect(file).toBeTruthy();
  const other = await browser.newContext();
  const dest = await other.newPage();
  try {
    await dest.goto(baseURL + "/journal/");
    await dest.getByRole("button", { name: "English" }).click();
    await dest
      .getByRole("navigation")
      .getByRole("link", { name: "Device data" })
      .click();
    await dest.locator('input[type="file"]').setInputFiles(file!);
    await dest.getByLabel("File password", { exact: true }).fill(password);
    await dest.getByRole("button", { name: /Read file/ }).click();
    await expect(
      dest.getByRole("status").filter({ hasText: "rows verified." }),
    ).toBeVisible();
    await dest.getByRole("button", { name: /Open restored journal/ }).click();
    await expect(dest.getByRole("listitem")).toContainText("250");
  } finally {
    await other.close();
  }
});
