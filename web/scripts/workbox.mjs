import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { compileWorkbox } from "../../packages/web-build/workbox.mjs";

export const bundleWorkbox = () =>
  compileWorkbox(build, fileURLToPath(new URL("../", import.meta.url)));
