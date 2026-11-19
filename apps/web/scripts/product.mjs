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
import { compileWeb } from "../../../packages/web-build/compile.mjs";
import { bundleWorkbox } from "./workbox.mjs";
import fa from "../../../web/public/medication/shared/i18n/messages-fa.js";
import en from "../../../web/public/medication/shared/i18n/messages-en.js";

const app = fileURLToPath(new URL("../", import.meta.url));
const source = resolve(app, "../../web/public");
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
  "medication/features/backups/dialog.js",
  "medication/features/sleep/controller.js",
  "medication/features/medicines/appearance.js",
  "medication/features/appointments/editor.js",
  "medication/features/appointments/view.js",
  "medication/features/routines/view.js",
  "medication/features/routines/card.js",
  "medication/features/reports/controller.js",
  "medication/features/cycle/controller.js",
  "medication/features/today/story.js",
  "medication/features/reports/view.js",
  "medication/features/medicines/editor.js",
  "medication/features/medicines/view.js",
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
  await compileWeb({
    ui: resolve(app, "../../web/ui"),
    sourcePublic: pathToFileURL(source + "/"),
    publicDir: pathToFileURL(staging + "/"),
    messagesFa: fa,
    iconLicenseFile: new URL("../../../branding/LICENSE", import.meta.url),
    esbuild,
    bundleWorkbox,
    htmlOverrides: {
      "layout/day-navigation.html": (
        await readFile(
          join(app, "../../web/ui/layout/day-navigation.html"),
          "utf8",
        )
      ).replace(
        /(<section id="today-story"[^>]*>)[\s\S]*?<\/section>/,
        "$1</section>",
      ),
      "screens/insights.html": '<div data-screen="insights" hidden></div>',
      "screens/medications.html": await readFile(
        join(app, "src/product/medication/screen.html"),
        "utf8",
      ),
      "forms/medicine-editor.html":
        '<dialog id="medication-dialog" class="sheet add-sheet" aria-labelledby="editor-title"></dialog>',
      "forms/medicine-appearance.html":
        '<dialog id="appearance-dialog" class="sheet" aria-labelledby="appearance-title"></dialog>',
      "forms/medicine-details.html":
        '<dialog id="medicine-details" class="sheet" aria-labelledby="medicine-details-title"></dialog>',
      "forms/cycle-day.html":
        '<dialog id="cycle-day-dialog" class="sheet add-sheet" aria-labelledby="cycle-day-title"></dialog>',
      "forms/cycle.html":
        '<dialog id="cycle-dialog" class="sheet add-sheet" aria-labelledby="cycle-title"></dialog>',
      "forms/appointment-editor.html":
        '<dialog id="visit-dialog" class="sheet add-sheet" aria-labelledby="visit-form-title"></dialog>',
      "forms/appointment-category.html":
        '<dialog id="visit-category-dialog" class="sheet choice-sheet" aria-labelledby="visit-category-title"></dialog>',
      "forms/routine-editor.html":
        '<dialog id="routine-editor" class="sheet add-sheet routine-sheet" aria-labelledby="routine-editor-title"></dialog>',
      "forms/routine-category.html":
        '<dialog id="routine-category-dialog" class="sheet choice-sheet routine-sheet" aria-labelledby="routine-category-title"></dialog>',
      "forms/routine-log.html":
        '<dialog id="routine-log-dialog" class="sheet routine-sheet" aria-labelledby="routine-log-title"></dialog>',
      "forms/medicine-phase.html": "",
      "forms/medicine-slot.html": "",
      "forms/settings/display.html":
        '<section id="display-settings" class="settings-panel" hidden></section>',
      "forms/settings/profile.html":
        '<section id="profile-settings" class="settings-panel" hidden></section>',
      "forms/settings/sleep.html":
        '<section id="sleep-settings" class="settings-panel health-settings" hidden></section>',
      "forms/settings/backup.html":
        '<section id="backup-settings" class="settings-panel" hidden></section>',
      "forms/settings/snooze.html":
        '<section id="snooze-settings" class="settings-panel" hidden></section>',
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
