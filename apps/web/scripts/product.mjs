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
import fa from "../product-assets/public/medication/shared/i18n/messages-fa.js";
import en from "../product-assets/public/medication/shared/i18n/messages-en.js";

const app = fileURLToPath(new URL("../", import.meta.url));
const source = resolve(app, "product-assets/public");
const incumbent = resolve(app, "../../web");
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
  ["medication/app/day-navigation.js", "dayNavigation.tsx"],
  ["medication/app/entry-actions.js", "entryActions.ts"],
  ["medication/app/update.js", "updates.ts"],
  ["medication/features/today/view.js", "Today.tsx"],
  ["medication/features/cycle/overview.js", "CycleOverview.tsx"],
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
  "medication/features/family/panel.js",
  "medication/features/family/context.js",
  "medication/features/family/fields.js",
  "medication/features/settings/dialog.js",
  "medication/features/reminders/controller.js",
  "medication/features/cycle/settings.js",
  "medication/features/cycle/daily.js",
  "medication/shared/ui/day-card.js",
  "medication/features/sync/controller.js",
  "medication/features/sync/conflict-view.js",
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
  await compileWeb({
    ui: resolve(app, "product-assets/ui"),
    sourcePublic: pathToFileURL(source + "/"),
    publicDir: pathToFileURL(staging + "/"),
    messagesFa: fa,
    iconLicenseFile: new URL("../../../branding/LICENSE", import.meta.url),
    esbuild,
    bundleWorkbox,
    htmlOverrides: {
      "layout/day-navigation.html": (
        await readFile(
          join(app, "product-assets/ui/layout/day-navigation.html"),
          "utf8",
        )
      )
        .replace(
          /(<section id="today-story"[^>]*>)[\s\S]*?<\/section>/,
          "$1</section>",
        )
        .replace(
          /(<div id="day-controls"[^>]*>)[\s\S]*$/,
          '$1\n        <input id="day" type="date" hidden>\n        <div id="day-tools-react" style="display:contents"></div>\n      </div>\n',
        ),
      "forms/account.html": (
        await readFile(
          join(app, "product-assets/ui/forms/account.html"),
          "utf8",
        )
      ).replace(
        /<div class="account-modes"[\s\S]*?(?=<p id="account-status")/,
        '<div id="account-react" style="display:contents"></div>\n      ',
      ),
      "forms/quick-add.html":
        '<dialog id="quick-dialog" class="sheet add-sheet" aria-labelledby="quick-title"></dialog>',
      "forms/family.html":
        '<dialog id="family-dialog" class="sheet shared-panel" aria-labelledby="family-title"></dialog>',
      "layout/family-context.html":
        '<div id="family-context" class="family-context" hidden></div>',
      "layout/header.html": (
        await readFile(
          join(app, "product-assets/ui/layout/header.html"),
          "utf8",
        )
      ).replace(
        /<button[^>]+id="open-care-inbox"[\s\S]*?<\/button>/,
        '<span id="care-inbox-react" style="display:contents"></span>',
      ),
      "layout/program-cards.html":
        '<section id="today-programs" aria-label="{{msg:ui.care-shortcuts}}"></section>',
      "layout/today-sleep.html":
        '<section class="today-tracker program-sleep" id="today-sleep" aria-labelledby="today-sleep-label" hidden></section>',
      "layout/today-water.html":
        '<section id="today-water" class="today-tracker water program-water" aria-labelledby="today-water-label"></section>',
      "layout/water-feedback.html":
        '<div id="water-feedback-react" style="display:contents"></div>',
      "layout/cycle-today.html":
        '<section class="today-tracker program-cycle" id="cycle-today-card" aria-labelledby="cycle-today-label" hidden></section>',
      "layout/cycle-tracking.html": (
        await readFile(
          join(app, "product-assets/ui/layout/cycle-tracking.html"),
          "utf8",
        )
      )
        .replace(
          /(<section class="cycle-panel" id="cycle-tracking">)[\s\S]*?<\/section>/,
          "$1</section>",
        )
        .replace(
          /<details id="cycle-preparation"[\s\S]*?<\/details>/,
          '<div id="cycle-preparation-react" style="display:contents"></div>',
        )
        .replace(
          /<details>\s*<summary>[^<]+<\/summary>\s*<form id="cycle-bulk-form"[\s\S]*?(?=<button id="cycle-open-settings")/,
          '<div id="cycle-tools-react" style="display:contents"></div>\n          ',
        )
        .replace(
          /<button id="cycle-open-settings"[^>]+>[\s\S]*?<\/button>/,
          '<div id="cycle-settings-link-react" style="display:contents"></div>',
        ),
      "screens/cycle.html": (
        await readFile(
          join(app, "product-assets/ui/screens/cycle.html"),
          "utf8",
        )
      )
        .replace(
          /(<div data-screen="cycle" hidden>)/,
          '$1\n        <div id="cycle-overview-react" hidden></div>',
        )
        .replace(
          /(<section id="cycle-(?:banner|calendar|trend|records)"[^>]*>)[\s\S]*?<\/section>/g,
          "$1</section>",
        ),
      "screens/today.html": (
        await readFile(
          join(app, "product-assets/ui/screens/today.html"),
          "utf8",
        )
      )
        .replace(
          /(<section class="cycle-panel program-cycle" id="cycle-companion-card"[^>]*>)[\s\S]*?<\/section>/,
          "$1</section>",
        )
        .replace(
          /<section id="today-reminders"[\s\S]*?<\/section>/,
          '<div id="today-reminders-react" style="display:contents"></div>',
        )
        .replace(
          /<div class="daily-main"[^>]*>[\s\S]*?(?= *<div id="today-family-bottom")/,
          '<div id="today-timeline-react" style="display:contents"></div>\n        ',
        )
        .replace(
          /<div id="today-cycle-feedback"[\s\S]*?<\/div>/,
          '<div id="cycle-feedback-react" style="display:contents"></div>',
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
      "forms/settings.html":
        '<dialog id="settings-dialog" class="settings-dialog shared-panel" aria-labelledby="settings-title"></dialog>',
      "forms/cycle-backup.html":
        '<dialog id="cycle-backup-dialog" class="sheet add-sheet" aria-labelledby="cycle-backup-title"></dialog>',
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
              const input = resolve(workingDir, path);
              const oldSource = relative(incumbent, input);
              if (oldSource && !oldSource.startsWith(".."))
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
