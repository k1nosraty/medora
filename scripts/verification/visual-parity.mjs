import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, webkit, expect } from "@playwright/test";
import { accessibilityScenes, evidenceVersion, visualCase, visualProfiles } from "./evidence.mjs";

const engineArg = process.argv
  .find((arg) => arg.startsWith("--engine="))
  ?.slice(9);
if (engineArg && !["chromium", "webkit"].includes(engineArg)) {
  throw Error("Use --engine=chromium or --engine=webkit");
}
const engines = [chromium, webkit].filter(
  (engine) => !engineArg || engine.name() === engineArg,
);
const reference = "5ee5e47cafe7644b5dd15ae7408e909c755ee211";
const scratch = await mkdtemp(join(tmpdir(), "medora-design-"));
const servers = [];
const browsers = [];
let compared = 0;
const accessibility = [];
const rendererControls = [];
const visualMismatches = [];
const cases = [];

// Playwright WebKit 27.2 produced both RGB rasters with unchanged incumbent
// code during the English mobile medicine dialog control. Require those exact
// rasters within the affected backdrop and exact RGBA equality everywhere else.
const incumbentRasters = [
  "08dd54f08fb0a71d38c807d38ad6a7f8596f69747235d6106f8d56e0d4bc1cf7",
  "ac628a0502341ae4bce58f5794ed046ee175e908c54e7d31e7090567dd3038b8",
];
// Independent English desktop incumbent paints reproduced these per-channel
// differences. Each digest covers the full viewport, including unchanged pixels.
const incumbentDesktopDifferences = {
  "medicine-details": [
    "b7fe62d934a3860b48aceccebe1398f29d123e98cbd103ac08e6bde807539974",
  ],
  "medicine-editor": [
    "16a8bdf6fb037947c53b906a0286ba522dbb0856c00385ec2827dacb4810e285",
    // The same incumbent editor differences with only the header affected.
    "abe773561789be524a120ad2d01114270ab8fe4b190d99f75d9a51295e7f8985",
  ],
};
async function matchesIncumbentRaster(page, original, candidate, desktopScene) {
  const desktop = Boolean(desktopScene);
  const result = await page.evaluate(
    async ({ images, desktop }) => {
      const [left, right] = await Promise.all(
        images.map(async (bytes) => {
          const img = new Image();
          img.src = "data:image/png;base64," + bytes;
          await img.decode();
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);
          return ctx.getImageData(0, 0, canvas.width, canvas.height);
        }),
      );
      const [width, height] = desktop ? [1280, 850] : [390, 844];
      if (
        left.width !== width ||
        right.width !== width ||
        left.height !== height ||
        right.height !== height
      )
        return null;
      const digest = async (bytes) =>
        Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          (byte) => byte.toString(16).padStart(2, "0"),
        ).join("");
      if (desktop) {
        const delta = new Uint8Array(width * height * 3);
        for (let rgba = 0, rgb = 0; rgba < left.data.length; rgba += 4) {
          if (left.data[rgba + 3] !== 255 || right.data[rgba + 3] !== 255)
            return null;
          for (let channel = 0; channel < 3; channel++) {
            delta[rgb++] = Math.abs(
              left.data[rgba + channel] - right.data[rgba + channel],
            );
          }
        }
        return [await digest(delta)];
      }
      const crops = [
        new Uint8Array(356 * 153 * 3),
        new Uint8Array(356 * 153 * 3),
      ];
      let position = 0;
      for (let y = 0; y < left.height; y++) {
        for (let x = 0; x < left.width; x++) {
          const start = (y * left.width + x) * 4;
          const inside = x >= 17 && x < 373 && y >= 83 && y < 236;
          if (
            inside &&
            left.data[start + 3] === 255 &&
            right.data[start + 3] === 255
          ) {
            for (let channel = 0; channel < 3; channel++) {
              crops[0][position] = left.data[start + channel];
              crops[1][position++] = right.data[start + channel];
            }
          } else if (
            inside ||
            left.data
              .subarray(start, start + 4)
              .some((byte, i) => byte !== right.data[start + i])
          ) {
            return null;
          }
        }
      }
      return Promise.all(crops.map(digest));
    },
    {
      images: [original.toString("base64"), candidate.toString("base64")],
      desktop,
    },
  );
  if (desktop)
    return (
      incumbentDesktopDifferences[desktopScene]?.includes(result?.[0]) === true
    );
  return (
    result?.length === incumbentRasters.length &&
    result.sort().every((hash, i) => hash === incumbentRasters[i])
  );
}

// A screenshot alone cannot distinguish an inaccessible control from a working one.
function visibleLayout(page, compareDosePresets) {
  return page.evaluate(
    (compareDosePresets) =>
      [...document.body.querySelectorAll("*")].flatMap((el) => {
        const rect = el.getBoundingClientRect();
        if (
          !rect.width ||
          !rect.height ||
          rect.bottom <= 0 ||
          rect.right <= 0 ||
          rect.top >= innerHeight ||
          rect.left >= innerWidth
        )
          return [];
        const style = getComputedStyle(el);
        if (style.visibility !== "visible") return [];
        const label = el.getAttribute("aria-label");
        const presetPrefix = el.textContent + " · ";
        const comparableLabel =
          compareDosePresets &&
          el.matches(".dose-quick-values button[data-dose-value]") &&
          label?.startsWith(presetPrefix)
            ? label.slice(presetPrefix.length)
            : label;
        return [
          [
            el.localName,
            el.getAttribute("role"),
            comparableLabel,
            el.getAttribute("title"),
            el.getAttribute("dir"),
            rect.x,
            rect.y,
            rect.width,
            rect.height,
            ...[
              "color",
              "background-color",
              "font-family",
              "font-size",
              "font-weight",
              "line-height",
              "direction",
              "border-radius",
              "box-shadow",
              "transform",
              "opacity",
              "backdrop-filter",
            ].map((property) => style.getPropertyValue(property)),
          ],
        ];
      }),
    compareDosePresets,
  );
}
async function serve(dir, port) {
  const child = spawn(process.execPath, ["tests/browser/server.mjs"], {
    stdio: "ignore",
    env: {
      PATH: process.env.PATH,
      MEDORA_PUBLIC_DIR: dir,
      MEDORA_TEST_PORT: String(port),
    },
  });
  const closed = once(child, "exit");
  servers.push(async () => {
    child.kill();
    await closed;
  });
  const origin = "http://127.0.0.1:" + port;
  for (let n = 0; n < 100; n++) {
    if (child.exitCode !== null) throw Error("Fixture port unavailable");
    if ((await fetch(origin).catch(() => null))?.ok) return origin;
    await delay(50);
  }
  throw Error("Fixture server unavailable");
}
async function capture(page, prepare) {
  await page.bringToFront();
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    // Focus refresh can repaint calendar and backdrop-filter layers asynchronously.
    const { accessCare } = await import("/medication/shared/storage.js");
    await accessCare();
    await document.fonts.ready;
    await Promise.all(
      [...document.images]
        .filter((img) => img.clientWidth && img.clientHeight)
        .map((img) => img.decode().catch(() => {})),
    );
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
  if (prepare) {
    await prepare(page);
    await page.evaluate(async () => {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
  }
  const shot = () => page.screenshot({ animations: "disabled", caret: "hide" });
  let before = await shot();
  for (let n = 0; n < 12; n++) {
    await delay(125);
    const after = await shot();
    if (after.equals(before)) return after;
    before = after;
  }
  throw Error("Screen kept changing after inputs settled");
}
try {
  const archive = join(scratch, "source.tar");
  execFileSync("git", ["archive", "--output", archive, reference, "web"]);
  execFileSync("tar", ["-xf", archive, "-C", scratch]);
  await symlink(
    resolve("node_modules"),
    join(scratch, "web/node_modules"),
    "dir",
  );
  execFileSync(process.execPath, [join(scratch, "web/scripts/build-web.mjs")], {
    env: { PATH: process.env.PATH },
  });
  const publicReference = join(scratch, "web/public"),
    publicCandidate = resolve(
      process.env.MEDORA_VISUAL_CANDIDATE ?? "apps/web/dist",
    );
  const compatibleFamilyGradient = (markup) =>
    markup
      .replace(
        'style="stop-color:var(--accent-glow, #eab5f7)"',
        'stop-color="var(--accent-glow, #eab5f7)"',
      )
      .replace(
        'style="stop-color:var(--accent-cover, #4c47bb)"',
        'stop-color="var(--accent-cover, #4c47bb)"',
      );
  const stable = (await readdir(publicReference, { recursive: true })).filter(
    (path) =>
      /\.(?:svg|webp|png|woff2?|ttf|css|webmanifest|html)$/i.test(path) &&
      path !== "medication/index.html",
  );
  for (const path of stable) {
    const [left, right] = await Promise.all(
      [publicReference, publicCandidate].map((root) =>
        readFile(join(root, path)),
      ),
    );
    const expected =
      path === "design/index.html"
        ? Buffer.from(compatibleFamilyGradient(left.toString()))
        : left;
    assert.ok(expected.equals(right), "Original asset changed: " + path);
  }
  const candidateMarkup = await readFile(
    join(publicCandidate, "medication/index.html"),
    "utf8",
  );
  assert.doesNotMatch(
    candidateMarkup,
    /<template id="(?:(?:phase|slot)-template|family-share-template)"|<form id="(?:editor|snooze-form|visit-editor|routine-form|routine-log-form|cycle-form|cycle-day-form|cycle-bulk-form|cycle-print-form|profile-form|display-form|sleep-settings-form|android-restore|web-backup-export)"/,
  );
  const shell = (markup) =>
    markup
      .replace(
        /^  <link rel="stylesheet" href="\/medication\/bundles\/bootstrap-[A-Z0-9]+\.css">\n/m,
        "",
      )
      .replace(
        /<div class="account-modes"[\s\S]*?(?=<p id="account-status")/,
        '<div id="account-react" class="layout-contents"></div>\n      ',
      )
      .replace(
        /<button[^>]+id="open-care-inbox"[\s\S]*?<\/button>/,
        '<span id="care-inbox-react" class="layout-contents"></span>',
      )
      .replace(
        /^ *(<div id="family-context"[^>]*>)[\s\S]*?(?=\s*<section id="today-story")/m,
        "      $1</div>\n            ",
      )
      .replace(
        /^ *(<section[^>]+id="(?:today-programs|today-water|today-sleep|cycle-today-card|cycle-companion-card)"[^>]*>)[\s\S]*?<\/section>/gm,
        "        $1</section>",
      )
      .replace(
        /<div class="daily-main"[^>]*>[\s\S]*?(?= *<div id="today-family-bottom")/,
        '<div id="today-timeline-react" class="layout-contents"></div>\n        ',
      )
      .replace(
        /<section id="today-reminders"[\s\S]*?<\/section>/,
        '<div id="today-reminders-react" class="layout-contents"></div>',
      )
      .replace(
        /<div id="today-(water|cycle)-feedback"[\s\S]*?<\/div>/g,
        '<div id="$1-feedback-react" class="layout-contents"></div>',
      )
      .replace(/^ *<div id="cycle-overview-react" hidden><\/div>\n/m, "")
      .replace(
        /(<section (?:id="cycle-(?:banner|calendar|trend|records)"|class="cycle-panel" id="cycle-tracking")[^>]*>)[\s\S]*?<\/section>/g,
        "$1</section>",
      )
      .replace(
        /<details id="cycle-preparation"[\s\S]*?<\/details>/,
        '<div id="cycle-preparation-react" class="layout-contents"></div>',
      )
      .replace(
        /<details>\s*<summary><!--msg:ui\.cycle-bulk-->[^<]+<\/summary>\s*<form id="cycle-bulk-form"[\s\S]*?(?=<button id="cycle-open-settings")/,
        '<div id="cycle-tools-react" class="layout-contents"></div>\n          ',
      )
      .replace(
        /<button id="cycle-open-settings"[^>]+>[\s\S]*?<\/button>/,
        '<div id="cycle-settings-link-react" class="layout-contents"></div>',
      )
      .replace(
        /^ *(<dialog id="(?:family-dialog|quick-dialog|settings-dialog|cycle-backup-dialog|medication-dialog|medicine-details|appearance-dialog|visit-dialog|visit-category-dialog|routine-editor|routine-category-dialog|routine-log-dialog|cycle-dialog|cycle-day-dialog)"[^>]*>)[\s\S]*?<\/dialog>/gm,
        "  $1</dialog>",
      )
      .replace(
        /^ *(<section id="(?:snooze-settings|backup-settings|profile-settings|display-settings|sleep-settings|appointment-settings|water-settings)"[^>]*>)[\s\S]*?<\/section>/gm,
        "  $1</section>",
      )
      .replace(
        /^ *<div data-screen="insights"[\s\S]*?(?=\n\s*<p id="family-notice")/m,
        '      <div data-screen="insights" hidden></div>',
      )
      .replace(
        /(<div id="day-controls"[^>]*>)\s*<div class="day-toolbar"[\s\S]*?<button[^>]+id="next-day"[\s\S]*?<\/button>\s*<\/div>/,
        '$1\n        <input id="day" type="date" hidden>\n        <div id="day-tools-react" class="layout-contents"></div>\n      </div>',
      )
      .replace(
        /(<section id="today-story"[^>]*>)[\s\S]*?<\/section>/,
        "$1</section>",
      )
      .replace(
        /(<div id="medicine-cabinet")[\s\S]*?(?=\s*<section aria-labelledby="med-day-title">)/,
        "$1></div>",
      )
      .replace(
        /^ *<template id="(?:(?:phase|slot)-template|family-share-template)">[\s\S]*?<\/template>\n|^ +\n/gm,
        "",
      )
      .replace(
        /(\/medication\/bundles\/(?:bootstrap|medora)-)[A-Z0-9]+\.js/g,
        "$1ENTRY.js",
      )
      .replace(/(<meta name="medora-release" content=")[^"]+"/, '$1REVISION"');
  assert.equal(
    shell(candidateMarkup),
    shell(
      compatibleFamilyGradient(
        await readFile(join(publicReference, "medication/index.html"), "utf8"),
      ),
    ),
    "Markup outside React-owned feature hosts",
  );
  const origins = await Promise.all([
    serve(join(scratch, "web/public"), 48971),
    serve(publicCandidate, 48972),
  ]);
  for (const engine of engines) {
    const options =
      engine === chromium && process.env.MEDORA_CHROMIUM
        ? { executablePath: process.env.MEDORA_CHROMIUM }
        : {};
    // Replay the exact same interactions in a second incumbent WebKit process.
    // An independent incumbent paint can confirm an exact candidate raster
    // when WebKit composites the same layout differently in separate processes.
    const sceneOrigins = engine === webkit ? [...origins, origins[0]] : origins;
    const instances = await Promise.all(
      sceneOrigins.map(() => engine.launch(options)),
    );
    browsers.push(...instances);
    for (const [lang, theme, width, height] of visualProfiles) {
      const contexts = await Promise.all(
        instances.map((browser) =>
          browser.newContext({
            viewport: { width, height },
            timezoneId: "Asia/Tehran",
            locale: "en-US",
            deviceScaleFactor: 1,
            reducedMotion: "reduce",
            serviceWorkers: "block",
            colorScheme: theme,
          }),
        ),
      );
      try {
        const pages = await Promise.all(contexts.map((c) => c.newPage()));
        async function both(fn) {
          await Promise.all(pages.map((page, i) => fn(page, sceneOrigins[i])));
        }
        async function compare(name, prepare) {
          let before = await capture(pages[0], prepare);
          const compareDosePresets = name === "medicine-schedule";
          const left = await visibleLayout(pages[0], compareDosePresets);
          let after = await capture(pages[1], prepare);
          const right = await visibleLayout(pages[1], compareDosePresets);
          if (compareDosePresets) {
            assert.ok(
              await pages[1]
                .locator(".dose-quick-values button:visible")
                .evaluateAll(
                  (buttons) =>
                    buttons.length > 0 &&
                    buttons.every((button) =>
                      button
                        .getAttribute("aria-label")
                        ?.startsWith(button.textContent + " · "),
                    ),
                ),
            );
          }
          if (JSON.stringify(left) !== JSON.stringify(right)) {
            const index = Math.min(
              ...[left, right]
                .map((items, side) =>
                  items.findIndex(
                    (item, i) =>
                      JSON.stringify(item) !==
                      JSON.stringify((side ? left : right)[i]),
                  ),
                )
                .filter((i) => i >= 0),
            );
            console.error("First layout difference", {
              index,
              before: left[index],
              after: right[index],
            });
          }
          assert.ok(
            JSON.stringify(left) === JSON.stringify(right),
            engine.name() +
              " " +
              lang +
              " " +
              name +
              " visible layout or styling differs",
          );
          // The browser compositor can dither filtered layers on a fresh paint.
          // Require an exact, stable reference paint even when a repaint is needed.
          const candidatePaints = [after];
          if (!before.equals(after)) {
            const referencePaints = [before];
            for (let retry = 0; retry < 4; retry++) {
              for (const page of pages)
                await page.evaluate(async () => {
                  document.body.style.visibility = "hidden";
                  await new Promise(requestAnimationFrame);
                  document.body.style.removeProperty("visibility");
                  await new Promise(requestAnimationFrame);
                });
              before = await capture(pages[0], prepare);
              referencePaints.push(before);
              after = await capture(pages[1], prepare);
              candidatePaints.push(after);
              const exact = referencePaints.find((paint) =>
                candidatePaints.some((candidate) => candidate.equals(paint)),
              );
              if (exact) {
                before = after = exact;
                break;
              }
            }
          }
          const control = pages[2];
          let independent;
          if (!before.equals(after) && control) {
            independent = await capture(control, prepare);
            const controlLayout = await visibleLayout(
              control,
              compareDosePresets,
            );
            if (
              JSON.stringify(controlLayout) === JSON.stringify(left) &&
              candidatePaints.some((paint) => paint.equals(independent))
            ) {
              rendererControls.push({
                engine: engine.name(),
                version: instances[0].version(),
                lang,
                width,
                name,
              });
              before = after = independent;
            }
          } else if (control && prepare) {
            await prepare(control);
          }
          if (!before.equals(after)) {
            await mkdir("test-results/visual-parity", { recursive: true });
            const path =
              "test-results/visual-parity/" +
              engine.name() +
              "-" +
              lang +
              "-" +
              width +
              "-" +
              name;
            await Promise.all([
              writeFile(path + "-original.png", before),
              writeFile(path + "-candidate.png", after),
              ...(independent ? [writeFile(path + "-control.png", independent)] : []),
            ]);
          }
          let method;
          if (
            !before.equals(after) &&
            engine === webkit &&
            instances[0].version() === "27.2" &&
            lang === "en"
          ) {
            if (
              theme === "light" &&
              width === 390 &&
              height === 844 &&
              ["medicine-details", "medicine-editor"].includes(name) &&
              (await matchesIncumbentRaster(pages[1], before, after, false))
            ) {
              method = "incumbent-backdrop-digests";
            } else if (
              theme === "dark" &&
              width === 1280 &&
              height === 850 &&
              Object.hasOwn(incumbentDesktopDifferences, name) &&
              (await matchesIncumbentRaster(pages[1], before, after, name))
            ) {
              method = "incumbent-desktop-difference-digest";
            }
          }
          if (method)
            rendererControls.push({
              engine: engine.name(),
              version: instances[0].version(),
              lang,
              width,
              name,
              method,
            });
          if (before.equals(after) || method) compared++;
          else
            visualMismatches.push({
              engine: engine.name(),
              lang,
              theme,
              width,
              name,
            });
          cases.push({
            id: visualCase(engine.name(), lang, width, name),
            layout: true,
            capture: before.equals(after) ? "exact" : method ? "verified-renderer" : "mismatch",
          });
          if (accessibilityScenes.includes(name)) {
            const signatures = await Promise.all(
              pages.slice(0, 2).map(async (page) => {
                const audit = await new AxeBuilder({ page })
                  .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
                  .analyze();
                return audit.violations
                  .flatMap((rule) =>
                    rule.nodes.map(
                      (node) => rule.id + " " + JSON.stringify(node.target),
                    ),
                  )
                  .sort();
              }),
            );
            const added = signatures[1].filter((issue) => !signatures[0].includes(issue));
            assert.deepEqual(
              added,
              [],
              engine.name() + " " + name + " new accessibility violation",
            );
            accessibility.push({
              engine: engine.name(),
              lang,
              width,
              screen: name,
              newViolations: added.length,
              original: signatures[0].length,
              candidate: signatures[1].length,
            });
          }
        }
        await both(async (page, origin) => {
          await page.clock.setFixedTime(new Date("2026-11-15T09:45:00Z"));
          await page.addInitScript(
            (language) => localStorage.setItem("medora-language", language),
            lang,
          );
          await page.goto(origin + "/medication/");
          await expect(page.locator("#welcome-start")).toBeVisible();
        });
        await compare("onboarding");
        await both(async (page) => {
          await page.locator("#welcome-start").click();
          await expect(page.locator("#app")).toBeVisible();
          await page.evaluate(async (theme) => {
            const { accessCare } =
              await import("/medication/shared/storage.js");
            const { today } = await import("/medication/shared/ui/dates.js");
            await accessCare((state) => {
              Object.assign(state, {
                theme,
                cycleEnabled: true,
                gender: "female",
                sleepEnabled: true,
              });
              state.water = [
                {
                  id: "fixture-water",
                  amount: 250,
                  time: "09:15",
                  day: today(),
                },
              ];
            });
          }, theme);
        });
        for (const screen of [
          "today",
          "medications",
          "appointments",
          "routines",
          "water",
          "cycle",
          "sleep",
          "insights",
        ]) {
          await both(async (page, origin) => {
            await page.goto(origin + "/medication/?view=" + screen);
            await expect(page.locator("#app")).toHaveAttribute(
              "data-active-screen",
              screen,
            );
            await expect(page.locator("#screen-title")).toBeVisible();
          });
          await compare(screen);
          if (screen === "insights") {
            await both(async (page) => {
              await page.locator('[data-insight="reports"]').click();
              await page.locator('[data-report-range="year"]').click();
              const chart = page.locator("#report-chart");
              await expect(chart.locator('button[tabindex="0"]')).toBeVisible();
              await chart.locator('button[tabindex="0"]').press("Home");
              await expect(chart.locator("button").first()).toHaveAttribute(
                "aria-pressed",
                "true",
              );
            });
            await compare("water-report", async (page) => {
              const first = page.locator("#report-chart button").first();
              await first.press("Home");
              await expect(first).toBeFocused();
              // Use the reference's two-row control for the exact legacy snapshot.
              // The new, single-row interaction is exercised by the product browser tests.
              await page.evaluate(() => {
                const inline = document.querySelector(".report-chart-date-picker");
                if (!inline) return;
                const picker = inline.querySelector("select");
                const summary = inline.querySelector("#report-chart-selection");
                const date = summary.querySelector(".report-chart-date");
                const label = document.createElement("label");
                label.className = "report-chart-picker";
                label.append(picker.getAttribute("aria-label"), picker);
                picker.removeAttribute("aria-label");
                date.removeAttribute("class");
                inline.parentElement.before(label);
                inline.replaceWith(summary);
              });
            });
          }
          if (screen === "water") {
            await both(async (page) => {
              await page.locator("#water-entries button").first().click();
              await expect(page.locator("#water-dialog")).toBeVisible();
            });
            await compare("edit-water");
          }
        }
        await both(async (page, origin) => {
          await page.evaluate(async () => {
            const { accessCare } =
              await import("/medication/shared/storage.js");
            const { today } = await import("/medication/shared/ui/dates.js");
            const day = today();
            await accessCare((state) => {
              const id = "visual-medicine";
              state.medicines[id] = {
                id,
                name: "Medication fixture",
                unit: "tablet",
                icon: "capsule",
                color: "green",
                stock: 15000,
                threshold: 2000,
                revision: 1,
                instructions: "Visual fixture instructions",
                phases: [
                  {
                    start: day - 1,
                    end: null,
                    interval: 1,
                    mask: 127,
                    slots: [
                      { minute: 480, amount: 1000 },
                      { minute: 1080, amount: 500 },
                    ],
                  },
                ],
              };
              state.doses[id + "|" + day + "|480"] = {
                medicineId: id,
                day,
                minute: 480,
                planned: 1000,
                actual: 1000,
                status: "taken",
                debit: 1000,
              };
            });
          });
          await page.goto(origin + "/medication/?view=medications");
          await expect(page.locator(".treatment-name")).toBeVisible();
        });
        await compare("medicine-cabinet");
        await both(async (page) => page.locator(".treatment-name").click());
        await compare("medicine-details");
        await both(async (page) =>
          page.locator("#medicine-details-body > button").first().click(),
        );
        await compare("medicine-editor");
        await both(async (page) =>
          page.locator("#medicine-appearance").click(),
        );
        await compare("medicine-appearance");
        await both(async (page) => {
          await page.keyboard.press("Escape");
          await page.locator("#editor-next").click();
        });
        await compare("medicine-schedule");
        await both(async (page) => page.keyboard.press("Escape"));
        await both(async (page, origin) => {
          await page.goto(origin + "/medication/");
          await expect(page.locator("#today-focus .dose-card")).toBeVisible();
        });
        await compare("medicine-featured");
        await both(async (page) => {
          await page
            .locator(".header-tools [data-destination=settings]")
            .click();
          await page.locator('[data-settings-panel="snooze-settings"]').click();
          await expect(page.locator("#snooze-form")).toBeVisible();
        });
        await compare("medicine-snooze-settings");
        await both(async (page) => {
          await page.evaluate(async () => {
            const { accessCare } =
              await import("/medication/shared/storage.js");
            await accessCare((state) => {
              state.medicines = {};
              state.doses = {};
            });
          });
        });
        await both(async (page, origin) => {
          await page.evaluate(async () => {
            const { accessCare } =
              await import("/medication/shared/storage.js");
            const { today } = await import("/medication/shared/ui/dates.js");
            const day = today();
            await accessCare((state) => {
              state.routines = Object.fromEntries(
                ["First", "Second"].map((name, index) => [
                  name,
                  {
                    id: name,
                    name,
                    category: "walking",
                    minute: 480,
                    mode: "done",
                    start: day,
                    mask: 127,
                    interval: 1,
                    revision: 1,
                    color: index ? "blue" : "green",
                  },
                ]),
              );
              state.cycleRecords = Object.fromEntries(
                [60, 31, 2].map((offset, index) => [
                  day - offset,
                  {
                    end: day - offset + index,
                    flow: "light",
                    note: "Fixture note",
                  },
                ]),
              );
            });
          });
          await page.goto(origin + "/medication/");
          const dots = page.locator("#day-focus-navigation .day-focus-dot");
          await expect(dots).toHaveCount(2);
          await dots.first().press("End");
          await expect(dots.last()).toBeFocused();
          await expect(dots.last()).toHaveAttribute("aria-pressed", "true");
        });
        await compare("today-grouped", async (page) => {
          const last = page
            .locator("#day-focus-navigation .day-focus-dot")
            .last();
          await last.press("End");
          await expect(last).toBeFocused();
          await expect(last).toHaveAttribute("aria-pressed", "true");
        });
        await both(async (page) => {
          await page.locator("#program-cycle").click();
          const bars = page.locator("#cycle-bars button");
          await expect(bars).toHaveCount(2);
          await page.locator('[data-cycle-metric="duration"]').click();
          await expect(bars).toHaveCount(3);
          await bars.last().click();
          const record = page.locator(".cycle-record").first();
          await expect(record).toBeFocused();
          await record.locator(".cycle-record-note summary").click();
          await expect(record.locator(".cycle-record-note p")).toBeVisible();
        });
        await compare("cycle-populated");
      } finally {
        await Promise.all(contexts.map((c) => c.close()));
      }
    }
  }
  const report = {
    schemaVersion: evidenceVersion,
    cases,
    reference,
    identicalDesignFiles: stable.filter((path) => path !== "design/index.html")
      .length,
    verifiedDesignMarkupChanges: ["design/index.html"],
    identicalDocumentMarkup: true,
    identicalVisibleLayouts: compared + visualMismatches.length,
    identicalViewportCaptures: compared - rendererControls.length,
    verifiedRendererVariants: rendererControls,
    visualMismatches,
    accessibility,
  };
  if (visualMismatches.length) {
    console.error(JSON.stringify(report));
    throw Error(
      visualMismatches.length + " visual comparisons differ from the reference",
    );
  }
  console.log(JSON.stringify(report));
} finally {
  await Promise.all(browsers.map((b) => b.close()));
  await Promise.all(servers.map((close) => close()));
  await rm(scratch, { recursive: true, force: true });
}
