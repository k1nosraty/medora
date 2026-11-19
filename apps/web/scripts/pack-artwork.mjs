import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { colors, expandPalette, packPalette } from "../../../packages/web-build/artwork-palettes.mjs";

const [from, to] = process.argv.slice(2);
if (!from || !to) throw Error("Usage: node apps/web/scripts/pack-artwork.mjs <optical-glass-source> <palette-output>");
const source = pathToFileURL(resolve(from) + sep);
const output = pathToFileURL(resolve(to) + sep);
const names = (await readdir(new URL("colors/gold/", source))).sort();
assert.ok(names.length > 0 && names.every((name) => /^(?:visit|routine)(?:-[a-z0-9-]+)?\.webp$/.test(name)));
for (const color of colors)
  assert.deepEqual((await readdir(new URL(`colors/${color}/`, source))).sort(), names);
await mkdir(output, { recursive: true });
for (const name of names) {
  const base = await readFile(new URL(name, source));
  const originals = await Promise.all(colors.map((color) => readFile(new URL(`colors/${color}/${name}`, source))));
  const packed = packPalette(base, originals);
  assert.deepEqual(expandPalette(base, packed).map(([, image]) => image), originals, name);
  await writeFile(new URL(name.replace(/\.webp$/, ".vp8"), output), packed);
}
console.log(`Verified ${names.length * colors.length} byte-identical variants for ${names.length} assets.`);
