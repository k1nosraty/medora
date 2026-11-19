import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const fixture = await mkdtemp(join(tmpdir(), "medora-frontend-"));
const original = execFileSync("git", ["ls-files", "-z"], {
  cwd: root,
  encoding: "utf8",
}).split("\0");
const files = original.filter((file) => file && !file.startsWith("apps/compat-worker/") && !file.startsWith("web/"));
const absent = () =>
  Promise.all(["web", "apps/compat-worker"].map((path) =>
    assert.rejects(stat(join(fixture, path)), { code: "ENOENT" }),
  ));

function pnpm(...args) {
  execFileSync("pnpm", args, {
    cwd: fixture,
    env: {
      ...process.env,
      MEDORA_PUBLIC_DIR: join(fixture, "apps/web/dist"),
      MEDORA_TEST_PORT: process.env.MEDORA_INDEPENDENCE_PORT ?? "8876",
    },
    stdio: "inherit",
  });
}

try {
  await Promise.all(
    files.map(async (file) => {
      const destination = join(fixture, file);
      await mkdir(dirname(destination), { recursive: true });
      await cp(join(root, file), destination, { verbatimSymlinks: true });
    }),
  );
  await absent();
  pnpm("install", "--frozen-lockfile", ...process.argv.slice(2));
  pnpm("--filter", "@medora/web", "build");
  pnpm(
    "exec",
    "playwright",
    "test",
    "--config",
    "tests/browser/playwright.config.mjs",
  );
  await absent();
  console.log(
    "Frontend build and standalone browser suite passed with both compatibility source paths physically absent.",
  );
} finally {
  await rm(fixture, { recursive: true, force: true });
}
