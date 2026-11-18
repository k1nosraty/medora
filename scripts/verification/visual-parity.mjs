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

const reference = "5ee5e47cafe7644b5dd15ae7408e909c755ee211";
const scratch = await mkdtemp(join(tmpdir(), "medora-design-"));
const servers = [];
const browsers = [];
let compared = 0;
const accessibility = [];

// A screenshot alone cannot distinguish an inaccessible control from a working one.
function visibleLayout(page) {
  return page.evaluate(() =>
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
      return [
        [
          el.localName,
          el.getAttribute("role"),
          el.getAttribute("aria-label"),
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
  );
}
async function serve(dir, port) {
  const child = spawn(process.execPath, ["web/browser/server.mjs"], {
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
    resolve("web/node_modules"),
    join(scratch, "web/node_modules"),
    "dir",
  );
  execFileSync(process.execPath, [join(scratch, "web/scripts/build-web.mjs")], {
    env: { PATH: process.env.PATH },
  });
  const publicReference = join(scratch, "web/public"),
    publicCandidate = resolve("apps/web/dist");
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
    assert.ok(left.equals(right), "Original asset changed: " + path);
  }
  const shell = async (root) =>
    (await readFile(join(root, "medication/index.html"), "utf8"))
      .replace(
        /(\/medication\/bundles\/(?:bootstrap|medora)-)[A-Z0-9]+\.js/g,
        "$1ENTRY.js",
      )
      .replace(/(<meta name="medora-release" content=")[^"]+"/, '$1REVISION"');
  assert.equal(
    await shell(publicCandidate),
    await shell(publicReference),
    "Full markup of screens, controls and dialogs",
  );
  const origins = await Promise.all([
    serve(join(scratch, "web/public"), 48971),
    serve(resolve("apps/web/dist"), 48972),
  ]);
  for (const engine of [chromium, webkit]) {
    const options =
      engine === chromium && process.env.MEDORA_CHROMIUM
        ? { executablePath: process.env.MEDORA_CHROMIUM }
        : {};
    // Separate browser processes keep both web views foregrounded during
    // keyboard focus and screenshot capture.
    const pair = await Promise.all(origins.map(() => engine.launch(options)));
    browsers.push(...pair);
    for (const [lang, theme, width, height] of [
      ["fa", "light", 390, 844],
      ["fa", "dark", 1280, 850],
      ["en", "light", 390, 844],
      ["en", "dark", 1280, 850],
    ]) {
      const contexts = await Promise.all(
        pair.map((browser) =>
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
          await Promise.all(pages.map((page, i) => fn(page, origins[i])));
        }
        async function compare(name, prepare) {
          let before = await capture(pages[0], prepare);
          const left = await visibleLayout(pages[0]);
          let after = await capture(pages[1], prepare);
          const right = await visibleLayout(pages[1]);
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
          if (!before.equals(after)) {
            const paints = [before];
            for (let retry = 0; retry < 4; retry++) {
              for (const page of pages)
                await page.evaluate(async () => {
                  document.body.style.visibility = "hidden";
                  await new Promise(requestAnimationFrame);
                  document.body.style.removeProperty("visibility");
                  await new Promise(requestAnimationFrame);
                });
              before = await capture(pages[0], prepare);
              paints.push(before);
              after = await capture(pages[1], prepare);
              const exact = paints.find((referencePaint) =>
                referencePaint.equals(after),
              );
              if (exact) {
                before = exact;
                break;
              }
            }
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
            ]);
          }
          assert.ok(
            before.equals(after),
            engine.name() +
              " " +
              lang +
              " " +
              theme +
              " " +
              name +
              " differs from reference",
          );
          compared++;
          if (["onboarding", "today", "edit-water"].includes(name)) {
            const signatures = await Promise.all(
              pages.map(async (page) => {
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
            assert.deepEqual(
              signatures[1].filter((issue) => !signatures[0].includes(issue)),
              [],
              engine.name() + " " + name + " new accessibility violation",
            );
            accessibility.push({
              engine: engine.name(),
              lang,
              screen: name,
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
  console.log(
    JSON.stringify({
      reference,
      identicalDesignFiles: stable.length,
      identicalDocumentMarkup: true,
      identicalVisibleLayouts: compared,
      identicalViewportCaptures: compared,
      accessibility,
    }),
  );
} finally {
  await Promise.all(browsers.map((b) => b.close()));
  await Promise.all(servers.map((close) => close()));
  await rm(scratch, { recursive: true, force: true });
}
