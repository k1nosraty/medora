import * as esbuild from "esbuild";
import { cp } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compileWeb } from "../../packages/web-build/compile.mjs";
import messagesFa from "../../apps/web/product-assets/public/medication/shared/i18n/messages-fa.js";
import { bundleWorkbox } from "./workbox.mjs";

const source = new URL("../../apps/web/product-assets/", import.meta.url);
const sourcePublic = new URL("public/", source);

export async function buildWeb(publicDir = new URL("../public/", import.meta.url)) {
  await cp(sourcePublic, publicDir, { recursive: true });
  return compileWeb({
    ui: fileURLToPath(new URL("ui/", source)),
    sourcePublic,
    publicDir,
    messagesFa,
    iconLicenseFile: new URL("../../branding/LICENSE", import.meta.url),
    esbuild,
    bundleWorkbox,
  });
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
)
  await buildWeb();
