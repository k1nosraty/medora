import * as esbuild from "esbuild";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, join, relative } from "node:path";
import { compileWeb, copyWebResources } from "../../../packages/web-build/compile.mjs";
import { replacedModules } from "../../../packages/web-build/product-ownership.mjs";
import { bundleWorkbox } from "./workbox.mjs";
import fa from "../product-assets/public/medication/shared/i18n/messages-fa.js";
import en from "../product-assets/public/medication/shared/i18n/messages-en.js";

const app = fileURLToPath(new URL("../", import.meta.url));
const source = resolve(app, "product-assets/public");
const incumbent = [resolve(app, "../../web"), resolve(app, "../compat-worker")];
const output = resolve(app, "dist");
const staging = await mkdtemp(join(app, ".product-"));
const onboardingCopy = (messages) => ({
  title: messages["ui.medora"],
  subtitle: messages["ui.your-health-every-day"],
  description: messages["ui.reminders-for-medicines-water-and-appointments"],
  start: messages["ui.get-started"],
  privacy: messages["ui.your-records-stay-on-this-device"],
  error: messages["ui.could-not-save-try-again"],
});

try {
  // Keep the published URLs for installed clients and the separate browser tools.
  await cp(source, staging, {
    recursive: true,
    filter: async (path) => {
      const name = relative(source, path);
      if (name.split("/").some((part) => part.startsWith("."))) return false;
      const info = await lstat(path);
      if (info.isDirectory()) return true;
      return (
        info.isFile() &&
        (["FONT-LICENSE.txt", "_headers", "_redirects"].includes(name) ||
          /\.(?:js|css|html|webp|svg|png|woff2|ttf|webmanifest)$/.test(name))
      );
    },
  });
  await copyWebResources(pathToFileURL(staging + "/"));
  await compileWeb({
    ui: resolve(app, "product-assets/ui"),
    sourcePublic: pathToFileURL(source + "/"),
    publicDir: pathToFileURL(staging + "/"),
    messagesFa: fa,
    iconLicenseFile: new URL("../../../branding/LICENSE", import.meta.url),
    esbuild,
    bundleWorkbox,
    htmlOverrides: {
      "index.html": await readFile(join(app, "src/product/shell.html"), "utf8"),
      "screens/medications.html": await readFile(join(app, "src/product/medication/screen.html"), "utf8"),
    },
    plugins: [
      {
        name: "medora-react-features",
        setup(build) {
          build.initialOptions.metafile = true;
          build.initialOptions.define.MEDORA_WELCOME_COPY = JSON.stringify({
            fa: onboardingCopy(fa),
            en: onboardingCopy(en),
          });
          build.onResolve({ filter: /(?:^|\/)account-transport\.js$/ }, ({ path, resolveDir }) => {
            if (resolve(resolveDir, path) === join(source, "medication/shared/account-transport.js"))
              return { path: join(app, "src/product/accountTransport.ts") };
          });
          build.onEnd(({ metafile }) => {
            if (!metafile) return;
            const workingDir = build.initialOptions.absWorkingDir;
            const errors = Object.keys(metafile.inputs).flatMap((path) => {
              const input = resolve(workingDir, path);
              const oldSource = incumbent.map((root) => relative(root, input)).find((file) => file && !file.startsWith(".."));
              if (oldSource)
                return [
                  {
                    text: `Product bundle depends on incumbent source: ${oldSource}`,
                  },
                ];
              const module = relative(source, input);
              return replacedModules.has(module)
                ? [
                    {
                      text: `Replaced product controller remains in the bundle: ${module}`,
                    },
                  ]
                : [];
            });
            return { errors };
          });
        },
      },
    ],
    entryPoints: {
      bootstrap: join(app, "src/product/bootstrap.ts"),
      medora: join(app, "src/product/startup.ts"),
    },
  });
  await esbuild.build({
    entryPoints: [join(app, "src/product/accountTransport.ts")],
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    outfile: join(staging, "medication/shared/account-transport.js"),
  });
  await mkdir(output, { recursive: true });
  for (const name of await readdir(output)) {
    if (name !== "journal")
      await rm(join(output, name), { recursive: true, force: true });
  }
  // Vite built the isolated journal first. Move only the product's known assets.
  for (const name of await readdir(staging))
    await rename(join(staging, name), join(output, name));
} finally {
  await rm(staging, { recursive: true, force: true });
}
