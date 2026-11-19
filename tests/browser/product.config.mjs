import { fileURLToPath } from "node:url";
import product from "./playwright.config.mjs";

const incumbent = process.env.MEDORA_INCUMBENT_BROWSER === "1";
if (incumbent) delete process.env.MEDORA_PUBLIC_DIR;
else
  process.env.MEDORA_PUBLIC_DIR ??= fileURLToPath(new URL("../../apps/web/dist", import.meta.url));

export default {
  ...product,
  testDir: "..",
  testIgnore: ["**/.local/**"],
  testMatch: ["**/tests/browser/*.spec.mjs", "**/tests/product/*.spec.mjs"],
  outputDir: incumbent ? "../../test-results/incumbent" : "../../test-results/product",
  webServer: {
    ...product.webServer,
    env: {
      ...product.webServer.env,
      MEDORA_PUBLIC_DIR:
        process.env.MEDORA_PUBLIC_DIR ??
        fileURLToPath(new URL("../../apps/compat-worker/public", import.meta.url)),
    },
  },
};
