import { createRequire } from "node:module";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  rename,
  rm,
} from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, join, relative } from "node:path";
import { buildWeb } from "../../../web/scripts/build-web.mjs";

const { build } = createRequire(
  new URL("../../../web/package.json", import.meta.url),
)("esbuild");
const app = fileURLToPath(new URL("../", import.meta.url));
const source = resolve(app, "../../web/public");
const output = resolve(app, "dist");
const staging = await mkdtemp(join(app, ".product-"));
const components = new Map([
  ["medication/app/onboarding.js", "Onboarding.tsx"],
  ["medication/app/routes.js", "routes.ts"],
  ["medication/app/day-navigation.js", "dayNavigation.ts"],
  ["medication/app/entry-actions.js", "entryActions.ts"],
  ["medication/app/update.js", "updates.ts"],
  ["medication/features/today/view.js", "Today.tsx"],
  ["medication/features/cycle/overview.js", "CycleOverview.tsx"],
  ["medication/features/sync/conflict-view.js", "SyncConflicts.tsx"],
  ["medication/app/week-strip.js", "DayWeek.tsx"],
  ["medication/shared/ui/month-grid.js", "MonthGrid.tsx"],
  ["medication/features/reports/stats.js", "ReportStats.tsx"],
  ["medication/features/reports/water-chart.js", "WaterChart.tsx"],
  ["medication/features/sleep/history.js", "SleepHistory.tsx"],
  ["medication/features/operations.js", "Operations.tsx"],
  ["medication/shared/account-transport.js", "accountTransport.ts"],
  ["medication/features/water/controller.js", "waterController.tsx"],
]);
const replacedModules = new Set([
  ...components.keys(),
  "medication/bootstrap.js",
  "medication/app/medora.js",
  "medication/app/navigation.js",
  "medication/features/account/dialog.js",
  "medication/features/promotions/dialog.js",
  "medication/features/support-tickets.js",
  "medication/features/water/entries.js",
  "medication/shared/ui/confirm-delete.js",
  "medication/shared/ui/pickers.js",
]);
try {
  // The original public asset tree already defines the published surface, including
  // unbundled modules used by design previews, legacy module URLs and the pilot.
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
  await buildWeb(
    pathToFileURL(staging + "/"),
    [
      {
        name: "medora-react-features",
        setup(build) {
          build.initialOptions.metafile = true;
          build.onResolve({ filter: /^\.{1,2}\// }, (args) => {
            // Unported controllers import the corresponding candidate components.
            if (relative(source, args.resolveDir).startsWith("..")) return;
            const module = relative(
              source,
              resolve(args.resolveDir, args.path),
            );
            if (components.has(module))
              return { path: join(app, "src/product", components.get(module)) };
          });
          build.onEnd(({ metafile }) => {
            if (!metafile) return;
            const workingDir = build.initialOptions.absWorkingDir;
            const errors = Object.keys(metafile.inputs).flatMap((path) => {
              const module = relative(source, resolve(workingDir, path));
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
    {
      bootstrap: join(app, "src/product/bootstrap.ts"),
      medora: join(app, "src/product/product.ts"),
    },
  );
  await build({
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
