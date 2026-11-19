import { defineConfig, devices } from "./runner.mjs";
import { fileURLToPath } from "node:url";

const executablePath = process.env.MEDORA_CHROMIUM;
const port = Number(process.env.MEDORA_TEST_PORT ?? 8872);
const url = "http://127.0.0.1:" + port;
const server = fileURLToPath(new URL("./server.mjs", import.meta.url));

export default defineConfig({
  testDir: ".",
  outputDir: "../../test-results/standalone",
  workers: 1,
  use: { baseURL: url, trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium", launchOptions: { executablePath } },
    },
    { name: "webkit", use: { ...devices["iPhone 13"], browserName: "webkit" } },
  ],
  webServer: {
    command: "node " + JSON.stringify(server),
    url,
    timeout: 20_000,
    env: { MEDORA_TEST_PORT: String(port) },
  },
});
