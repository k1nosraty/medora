import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("bilingual care, account and backup routes support keyboard focus and large text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/journal/");
  await page.addStyleTag({ content: ":root { font-size: 125%; }" });
  for (const [route, label] of [
    ["/plans/medicines", "برنامه‌های مراقبت"],
    ["/account", "حساب"],
    ["/archive", "داده‌های این دستگاه"],
  ]) {
    await page.goto("/journal/#" + route);
    await expect(
      page.getByRole("heading", { name: label!, exact: true }).first(),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("main")).toBeFocused();
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => document.activeElement !== document.body),
    ).toBe(true);
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(audit.violations.map((v) => v.id)).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(
    page.getByRole("heading", { name: "Device data", exact: true }),
  ).toBeVisible();
});
