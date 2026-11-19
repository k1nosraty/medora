import { fileURLToPath } from "node:url";
import product from "../tests/browser/playwright.config.mjs";

export default {
  ...product,
  testDir: "..",
  testIgnore: ["**/.local/**"],
  testMatch: ["**/tests/browser/*.spec.mjs", "**/tests/product/*.spec.mjs"],
  webServer: {
    ...product.webServer,
    env: {
      ...product.webServer.env,
      MEDORA_PUBLIC_DIR:
        process.env.MEDORA_PUBLIC_DIR ??
        fileURLToPath(new URL("./public", import.meta.url)),
    },
  },
};
