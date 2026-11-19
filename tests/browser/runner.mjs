import { createRequire } from "node:module";

const packageFile =
  process.env.MEDORA_INCUMBENT_BROWSER === "1"
    ? new URL("../../web/package.json", import.meta.url)
    : import.meta.url;

export const { defineConfig, devices, expect, test } =
  createRequire(packageFile)("@playwright/test");
