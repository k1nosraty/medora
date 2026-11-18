import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  timeout: 30000,
  use: { baseURL: "http://127.0.0.1:48820" },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        launchOptions: process.env.MEDORA_CHROMIUM
          ? { executablePath: process.env.MEDORA_CHROMIUM }
          : {},
      },
    },
    { name: "webkit", use: { ...devices["iPhone 13"], browserName: "webkit" } },
  ],
  webServer: {
    command:
      "pnpm --filter @medora/web exec vite preview --outDir dist --host 127.0.0.1 --port 48820 --strictPort",
    url: "http://127.0.0.1:48820",
    timeout: 20000,
  },
});
