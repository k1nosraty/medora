import * as esbuild from "esbuild";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compileWeb } from "../../packages/web-build/compile.mjs";
import messagesFa from "../public/medication/shared/i18n/messages-fa.js";
import { bundleWorkbox } from "./workbox.mjs";

const sourcePublic = new URL("../public/", import.meta.url);

export function buildWeb(publicDir = sourcePublic) {
  return compileWeb({
    ui: fileURLToPath(new URL("../ui/", import.meta.url)),
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
