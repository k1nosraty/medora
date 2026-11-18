import { test, expect } from "@playwright/test";
test("the date-range report includes local water and remains readable at 320 pixels", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/journal/");
  await page.getByRole("button", { name: "English" }).click();
  await page.getByRole("link", { name: "Log water" }).click();
  await page.getByRole("button", { name: "Log water" }).click();
  await expect(page.getByRole("listitem")).toContainText("250");
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await page.getByRole("link", { name: "Care report" }).click();
  await expect(
    page.getByRole("heading", { name: "Total water · 250 mL" }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(7);
  await page.getByLabel("Report period").selectOption("30");
  await expect(page.locator("tbody tr")).toHaveCount(30);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
