import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
async function inventory(root, base = root) {
  const result = [];
  for (const e of (await readdir(base, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const path = join(base, e.name);
    if (e.isDirectory()) result.push(...(await inventory(root, path)));
    else if (e.isFile()) {
      const bytes = await readFile(path);
      result.push({
        name: relative(root, path),
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    } else throw Error("Unexpected artifact entry");
  }
  return result;
}
const worker = process.argv[2];
if (!worker || !(await stat(worker)).isDirectory())
  throw Error("Supply the dry-run Worker output directory");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
if (git("status", "--porcelain"))
  throw Error("Commit candidate changes before recording artifact hashes");
const manifest = {
  branch: git("branch", "--show-current"),
  commit: git("rev-parse", "HEAD"),
  web: await inventory("apps/web/dist"),
  api: await inventory("apps/api/dist"),
  worker: await inventory(worker),
};
console.log(JSON.stringify(manifest, null, 2));
