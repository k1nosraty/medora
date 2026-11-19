import { expect, test } from "@playwright/test";

test.skip(!process.env.MEDORA_PUBLIC_DIR, "Runs against the rebuilt product");
test.use({ serviceWorkers: "block" });

const screens = [
  "today",
  "medications",
  "appointments",
  "routines",
  "water",
  "cycle",
  "sleep",
  "insights",
];
const viewports = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1280, height: 850 },
};

for (const lang of ["fa", "en"]) {
  for (const [layout, viewport] of Object.entries(viewports)) {
    test(`${lang} ${layout} product screens fit the viewport and pass Axe`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      const { default: AxeBuilder } = await import("@axe-core/playwright");
      const unexpected = [];
      const replaced =
        /\/medication\/features\/(?:appointments\/(?:editor|view)|routines\/(?:view|card)|backups\/dialog|cycle\/controller|reports\/(?:controller|view)|today\/story)\.js$/;
      await page.route(replaced, async (route) => {
        unexpected.push(new URL(route.request().url()).pathname);
        await route.abort();
      });
      await page.setViewportSize(viewport);
      await page.goto("/medication/");
      await expect(page.locator("#welcome-start")).toBeVisible();
      await page.evaluate(async (language) => {
        localStorage.setItem("medora-language", language);
        const { accessCare } = await import("/medication/shared/storage.js");
        const { today } = await import("/medication/shared/ui/dates.js");
        await accessCare((state) => {
          state.intro = "done";
          state.gender = "female";
          state.cycleEnabled = true;
          state.sleepEnabled = true;
          state.water = [
            { id: "matrix-water", amount: 250, day: today(), time: "09:15" },
          ];
        });
      }, lang);
      for (const screen of screens) {
        await test.step(screen, async () => {
          await page.goto(`/medication/?view=${screen}`);
          await expect(page.locator("html")).toHaveAttribute("lang", lang);
          await expect(page.locator("html")).toHaveAttribute(
            "dir",
            lang === "fa" ? "rtl" : "ltr",
          );
          await expect(page.locator("#app")).toHaveAttribute(
            "data-active-screen",
            screen,
          );
          await expect(page.locator("#screen-title")).toBeVisible();
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          const { violations } = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
            .analyze();
          expect(
            violations.map(({ id, nodes }) => ({
              id,
              targets: nodes.map(({ target }) => target),
            })),
          ).toEqual([]);
          if (process.env.MEDORA_CAPTURE_PRODUCT)
            await page.screenshot({
              path: testInfo.outputPath(screen + ".png"),
              animations: "disabled",
            });
        });
      }
      await page.locator('[data-insight="reports"]').click();
      await expect(page.locator("#reports-panel")).toBeVisible();
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      if (process.env.MEDORA_CAPTURE_PRODUCT)
        await page.screenshot({
          path: testInfo.outputPath("reports.png"),
          animations: "disabled",
        });
      expect(unexpected).toEqual([]);
    });
  }
}
