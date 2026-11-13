import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ui = fileURLToPath(new URL("../ui/", import.meta.url));
const publicDir = new URL("../public/", import.meta.url);
const medication = new URL("medication/", publicDir);
const include = /(?:<!-- include ([\w./-]+) -->|\/\* include ([\w./-]+) \*\/)/g;

async function render(file, parents = []) {
  const path = resolve(ui, file);
  if (!path.startsWith(ui) || parents.includes(path)) throw new Error("Invalid template include: " + file);
  const source = await readFile(path, "utf8");
  const matches = [...source.matchAll(include)];
  const parts = await Promise.all(matches.map(match => render(match[1] ?? match[2], [...parents, path])));
  let index = 0;
  return source.replace(include, () => parts[index++].trimEnd());
}

async function emit(path, content) {
  await mkdir(new URL("./", path), { recursive: true });
  if (await readFile(path, "utf8").catch(error => {
    if (error.code !== "ENOENT") throw error;
  }) !== content) await writeFile(path, content);
}

const html = await render("index.html");
await emit(new URL("styles/app.css", medication), await render("styles/app.css") + "\n");
const assets = (await readdir(medication, { recursive: true, withFileTypes: true }))
  .filter(file => file.isFile() && /\.(js|css|svg)$/.test(file.name) && file.name !== "sw.js")
  .map(file => "/medication/" + relative(fileURLToPath(medication), resolve(file.parentPath, file.name)).split(sep).join("/"))
  .sort();
const mainArtwork = ["bottle", "visit", "routine", "water", "cycle", "notification", "backup",
  "control-settings", "control-sun", "control-user", "control-calendar", "complete"];
const artwork = ["optical-glass", "matte-3d"].flatMap(finish => mainArtwork.map(id => `/design/${finish}/${id}.webp`));
const shell = ["/medication/", ...assets, ...artwork, "/manifest.webmanifest", "/manifest.en.webmanifest", "/icon-192.png",
  "/apple-touch-icon.png", "/medora-icon-192.png", "/medora-icon-512.png", "/style.css", "/vazirmatn.woff2"];
const worker = await readFile(resolve(ui, "pwa/sw.js"), "utf8");
const hash = createHash("sha256").update(html).update(worker).update(JSON.stringify(shell));
for (const asset of shell.slice(1)) hash.update(await readFile(new URL(asset.slice(1), publicDir)));
const revision = process.env.GITHUB_SHA;
if (revision && !/^[a-f0-9]{40}$/.test(revision)) throw new Error("Invalid deployment revision");
const version = revision || hash.digest("hex").slice(0, 20);
await Promise.all([
  emit(new URL("index.html", medication), html),
  emit(new URL("sw.js", medication), worker.replace("{{version}}", version).replace("{{assets}}", JSON.stringify(shell, null, 2))),
  emit(new URL("design/index.html", publicDir), await render("gallery/index.html"))
]);
