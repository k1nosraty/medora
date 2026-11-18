import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const roots = process.argv.slice(2).map((path) => resolve(path));
if (!roots.length)
  throw Error("Supply one or more built product asset directories");
const origin = "http://127.0.0.1:8874";
const serverFile = fileURLToPath(new URL("./server.mjs", import.meta.url));
const network = {
  offline: false,
  latency: 160,
  downloadThroughput: 200_000,
  uploadThroughput: 75_000,
};
const viewport = { width: 390, height: 844 };
const browser = await chromium.launch({
  executablePath: process.env.MEDORA_CHROMIUM,
});
try {
  for (const root of roots) {
    const server = spawn(process.execPath, [serverFile], {
      env: {
        PATH: process.env.PATH,
        MEDORA_PUBLIC_DIR: root,
        MEDORA_TEST_PORT: "8874",
      },
      stdio: "inherit",
    });
    try {
      for (let i = 0; i < 40; i++) {
        if (
          await fetch(origin).then(
            (response) => response.ok,
            () => false,
          )
        )
          break;
        await sleep(100);
      }
      const trials = [];
      for (let i = 0; i < 3; i++) {
        const context = await browser.newContext({
          viewport,
          serviceWorkers: "block",
        });
        try {
          const page = await context.newPage();
          const cdp = await context.newCDPSession(page);
          await cdp.send("Network.enable");
          await cdp.send("Network.emulateNetworkConditions", network);
          await page.clock.setFixedTime(new Date(2026, 10, 18, 13, 30));
          await page.goto(origin + "/medication/");
          await page.locator("#welcome-start").click();
          await page.locator("#app").waitFor();
          await page.evaluate(async () => {
            const { accessCare } =
              await import("/medication/shared/storage.js");
            const { today } = await import("/medication/shared/ui/dates.js");
            await accessCare((state) => {
              state.medicines = Object.fromEntries(
                Array.from({ length: 24 }, (_, i) => {
                  const id = "fixture-" + i;
                  return [
                    id,
                    {
                      id,
                      name: "Fixture medicine " + i,
                      unit: "tablet",
                      stock: 15000,
                      threshold: 2000,
                      revision: 1,
                      phases: [
                        {
                          start: today() - 30,
                          end: null,
                          interval: 1,
                          mask: 127,
                          slots: [{ minute: 480 + i, amount: 1000 }],
                        },
                      ],
                    },
                  ];
                }),
              );
            });
          });
          await page.reload();
          await page.locator("#today-focus .dose-card").waitFor();
          const measurements = await page.evaluate(async () => {
            const frame = () => new Promise(requestAnimationFrame);
            async function elapsed(activate, ready) {
              const first = performance.now();
              activate();
              while (!ready()) {
                if (performance.now() - first > 10000)
                  throw Error("Missing measurement marker");
                await frame();
              }
              const readyMs = performance.now() - first;
              await frame();
              return { readyMs, paintMs: performance.now() - first };
            }
            const resourceCount = () =>
              performance.getEntriesByType("resource").length;
            const initial = resourceCount();
            const list = await elapsed(
              () => document.querySelector("#program-medications").click(),
              () =>
                document.querySelectorAll("#plans article").length === 24 &&
                document.querySelectorAll("#med-day-doses article").length ===
                  24,
            );
            const details = await elapsed(
              () => document.querySelector(".treatment-name").click(),
              () =>
                document.querySelector("#medicine-details").open &&
                document.querySelector("#medicine-details-title")
                  .textContent === "Fixture medicine 0",
            );
            document.querySelector("#medicine-details").close();
            const action = await elapsed(
              () =>
                document
                  .querySelector("#med-day-doses .care-record-action")
                  .click(),
              () =>
                document.querySelector("#med-day-doses .badge").dataset
                  .status === "taken",
            );
            return {
              navigationAndListMs: list.readyMs,
              navigationAndListPaintMs: list.paintMs,
              detailMs: details.readyMs,
              detailPaintMs: details.paintMs,
              doseCommitMs: action.readyMs,
              dosePaintMs: action.paintMs,
              requests: resourceCount() - initial,
            };
          });
          trials.push(measurements);
        } finally {
          await context.close();
        }
      }
      const files = (await readdir(join(root, "medication/bundles"))).filter(
        (name) => name.endsWith(".js"),
      );
      const sizes = await Promise.all(
        files.map(async (name) => {
          const data = await readFile(join(root, "medication/bundles", name));
          return { name, raw: data.length, gzip: gzipSync(data).length };
        }),
      );
      const total = (key) => sizes.reduce((sum, size) => sum + size[key], 0);
      const median = Object.fromEntries(
        Object.keys(trials[0]).map((key) => [
          key,
          Math.round(
            trials.map((trial) => trial[key]).sort((a, b) => a - b)[1] * 10,
          ) / 10,
        ]),
      );
      console.log(
        JSON.stringify(
          {
            root,
            viewport,
            network,
            trials,
            median,
            javascript: {
              raw: total("raw"),
              gzip: total("gzip"),
              largest: sizes.sort((a, b) => b.raw - a.raw)[0],
            },
          },
          null,
          2,
        ),
      );
    } finally {
      const exited = once(server, "exit");
      server.kill();
      await exited;
    }
  }
} finally {
  await browser.close();
}
