import { defineConfig, devices } from "@playwright/test";

const executablePath = process.env.MEDORA_CHROMIUM;
export default defineConfig({
  testDir: "./browser",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:8872", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { browserName: "chromium", launchOptions: { executablePath } } },
    { name: "webkit", use: { ...devices["iPhone 13"], browserName: "webkit" } }
  ],
  webServer: { command: "node browser/server.mjs", url: "http://127.0.0.1:8872", timeout: 20_000 }
});
