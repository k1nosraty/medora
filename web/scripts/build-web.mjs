import { build, transform } from "esbuild";
import messagesFa from "../public/medication/shared/i18n/messages-fa.js";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
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

function translateMarkup(source) {
  const escape = text => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const textFor = key => {
    if (!Object.hasOwn(messagesFa, key)) throw new Error("Missing template message: " + key);
    return escape(messagesFa[key]);
  };
  return source
    .replace(/(aria-label|placeholder|title|alt)="\{\{msg:([a-z0-9.-]+)\}\}"/g,
      (_, attribute, key) => `${attribute}="${textFor(key)}" data-msg-${attribute}="${key}"`)
    .replace(/\{\{msg:([a-z0-9.-]+)\}\}/g, (_, key) => `<!--msg:${key}-->${textFor(key)}`);
}

const appCSS = await render("styles/app.css") + "\n";
await emit(new URL("styles/app.css", medication), appCSS);
const assetDirectory = new URL("bundles/", medication);
const bundle = await build({
  absWorkingDir: fileURLToPath(medication), entryPoints: { bootstrap: "bootstrap.js", medora: "app/medora.js" },
  bundle: true, splitting: true, write: false, outdir: fileURLToPath(assetDirectory), entryNames: "[name]-[hash]",
  chunkNames: "chunk-[hash]", format: "esm", platform: "browser", target: "es2022", minify: true
});
const css = await Promise.all(["/style.css", "/medication/styles/base.css", "/medication/styles/routines.css"]
  .map(path => readFile(new URL(path.slice(1), publicDir), "utf8")));
const { code } = await transform([css[0], css[1], appCSS, css[2]].join("\n"), { loader: "css", minify: true });
const stylesheet = "style-" + createHash("sha256").update(code).digest("hex").slice(0, 16) + ".css";
const outputs = new Map(bundle.outputFiles.map(file => [file.path.split(sep).at(-1), file.text]));
outputs.set(stylesheet, code);
for (const [name, contents] of outputs) await emit(new URL(name, assetDirectory), contents);

const assetPath = prefix => "/medication/bundles/" + [...outputs.keys()].find(name => name.startsWith(prefix + "-"));
const html = translateMarkup(await render("index.html"))
  .replace("/medication/bootstrap.js", assetPath("bootstrap"))
  .replace("/medication/app/medora.js", assetPath("medora"))
  .replace("{{app-style}}", assetPath("style"));
const svg = (await readdir(new URL("assets/", medication), { recursive: true, withFileTypes: true }))
  .filter(file => file.isFile() && file.name.endsWith(".svg"))
  .map(file => "/medication/" + relative(fileURLToPath(medication), resolve(file.parentPath, file.name)).split(sep).join("/"))
  .sort();
const shell = ["/medication/", ...[...outputs.keys()].sort().map(name => "/medication/bundles/" + name), ...svg,
  "/manifest.webmanifest", "/manifest.en.webmanifest", "/icon-192.png", "/apple-touch-icon.png",
  "/medora-icon-192.png", "/vazirmatn.woff2"];
const worker = await readFile(resolve(ui, "pwa/sw.js"), "utf8");
const hash = createHash("sha256").update(html).update(worker).update(JSON.stringify(shell));
for (const asset of shell.slice(1)) hash.update(await readFile(new URL(asset.slice(1), publicDir)));
const revision = process.env.GITHUB_SHA;
if (revision && !/^[a-f0-9]{40}$/.test(revision)) throw new Error("Invalid deployment revision");
const version = revision || hash.digest("hex").slice(0, 20);
await Promise.all([
  emit(new URL("index.html", medication), html.replace("{{version}}", version)),
  emit(new URL("sw.js", medication), worker.replaceAll("{{version}}", version).replace("{{assets}}", JSON.stringify(shell, null, 2))),
  emit(new URL("design/index.html", publicDir), translateMarkup(await render("gallery/index.html")))
]);
for (const name of await readdir(assetDirectory)) {
  if (/^(?:bootstrap|medora|style|chunk)-[a-z0-9]+\.(?:js|css)$/i.test(name) && !outputs.has(name)) {
    await unlink(new URL(name, assetDirectory));
  }
}
