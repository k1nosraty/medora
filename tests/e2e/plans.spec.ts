import { test, expect } from "@playwright/test";
test("care plans retain logged medicine doses and clinic appointments after reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "English" }).click();
  await page.getByRole("link", { name: "Care plans" }).click();
  await page.getByText("Add an entry", { exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Synthetic plan");
  await page.getByLabel("Time", { exact: true }).fill("20:45");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Taken", exact: true }).click();
  await expect(page.getByText("Synthetic plan · Taken")).toBeVisible();
  await page.getByRole("link", { name: "Appointments", exact: true }).click();
  await page.getByText("Add an entry", { exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Synthetic clinic");
  await page.getByLabel("Time zone").fill("Asia/Tehran");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("listitem")).toContainText("Asia/Tehran");
  await page.reload();
  await expect(page.getByRole("listitem")).toContainText("Synthetic clinic");
});

test("the daily schedule follows appointment attendance and cancellation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "English" }).click();
  await page.getByRole("link", { name: "Care plans" }).click();
  await page.getByRole("link", { name: "Appointments", exact: true }).click();
  await page.getByText("Add an entry", { exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Local appointment");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Mark attended" }).click();
  await expect(
    page.getByRole("button", { name: "Undo attendance" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await page.getByRole("link", { name: "Local appointment" }).click();
  await page.getByRole("button", { name: "Cancel appointment" }).click();
  await expect(
    page.getByRole("button", { name: "Restore appointment" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Local appointment" }),
  ).toHaveCount(0);
});
