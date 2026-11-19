import { createECDH } from "node:crypto";
import { expect, test } from "./runner.mjs";

test.skip(!process.env.MEDORA_PUBLIC_DIR, "Runs against the rebuilt product");
test.use({
  serviceWorkers: "allow",
  viewport: { width: 390, height: 844 },
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1",
});

for (const standalone of [false, true]) {
  test(`iPhone ${standalone ? "installed app" : "browser tab"} preserves Reports offline with its notification policy`, async ({ page, context, baseURL }) => {
    await page.addInitScript((installed) => {
      localStorage.setItem("medora-language", "en");
      Object.defineProperty(navigator, "standalone", { configurable: true, value: installed });
      Object.defineProperty(window, "Notification", { configurable: true, value: { permission: "default" } });
      Object.defineProperty(window, "PushManager", { configurable: true, value: function PushManager() {} });
      window.fixturePush = { registrations: 0, lookups: 0 };
      const register = navigator.serviceWorker.register.bind(navigator.serviceWorker);
      navigator.serviceWorker.register = (url, options) => {
        if (url !== "/sw.js") return register(url, options);
        window.fixturePush.registrations++;
        return Promise.resolve({ active: {}, pushManager: {
          getSubscription() {
            window.fixturePush.lookups++;
            // Reproduce a provider call that never settles on an unconfigured device.
            return new Promise(() => {});
          },
        } });
      };
    }, standalone);
    const key = createECDH("prime256v1");
    const publicKey = key.generateKeys().toString("base64url");
    await context.addCookies([{ name: "test-push-key", value: publicKey, url: baseURL }]);

    await page.goto("/medication/?view=insights");
    await page.locator("#welcome-start").click();
    await expect(page.locator("#app")).toHaveAttribute("data-active-screen", "insights");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.locator('[data-settings-panel="notification-settings"]').click();
    if (standalone)
      await expect(page.locator("#push-enable")).toBeEnabled();
    else {
      await expect(page.locator("#push-status")).toContainText("add Medora to your Home Screen");
      await expect(page.locator("#push-enable")).toBeDisabled();
    }
    expect(await page.evaluate(() => window.fixturePush)).toEqual({ registrations: Number(standalone), lookups: 0 });
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL.endsWith("/medication/sw.js"))).toBe(true);
    await page.evaluate(async () => {
      const { accessCare } = await import("/medication/shared/storage.js");
      const { today } = await import("/medication/shared/ui/dates.js");
      await accessCare((state) => {
        state.water = [{ id: "offline-ios-water", day: today(), time: "10:00", amount: 250 }];
      });
    });
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator("#app")).toHaveAttribute("data-active-screen", "insights");
    await page.locator('[data-insight="reports"]').click();
    await expect(page.locator("#report-water-number")).toHaveText("250");
  });
}
