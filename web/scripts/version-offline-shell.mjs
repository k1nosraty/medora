import { readFile, writeFile } from "node:fs/promises";

// The deploy workflow works in a disposable checkout and tags each shell by commit.
const revision = process.env.GITHUB_SHA;
if (revision) {
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("Invalid deployment revision");
  const file = new URL("../public/medication/sw.js", import.meta.url);
  const shell = await readFile(file, "utf8");
  const version = /const cacheName = "medora-medication-shell-[^"]+";/;
  if (!version.test(shell)) throw new Error("Offline shell version marker is missing");
  await writeFile(file, shell.replace(version, `const cacheName = "medora-medication-shell-${revision}";`));
}
