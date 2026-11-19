import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { expandPalette } from "../../packages/web-build/artwork-palettes.mjs";

const assets = new URL("../../apps/web/product-assets/", import.meta.url);

it("reconstructs every incumbent activity color byte for byte", async () => {
  const palettes = new URL("artwork-palettes/", assets);
  const names = (await readdir(palettes)).filter((name) => name.endsWith(".vp8"));
  const restored = (await Promise.all(names.map(async (file) => {
    const name = file.replace(/\.vp8$/, ".webp");
    const base = await readFile(new URL("public/design/optical-glass/" + name, assets));
    const palette = await readFile(new URL(file, palettes));
    return expandPalette(base, palette).map(([color, image]) => ({
      path: `colors/${color}/${name}`,
      image,
    }));
  }))).flat();

  expect(restored).toHaveLength(940);
  const digest = createHash("sha256");
  restored.sort((a, b) => a.path < b.path ? -1 : 1);
  for (const { path, image } of restored) digest.update(path + "\0").update(image);
  expect(digest.digest("hex")).toBe("8a632a8116127bfdcf70a7647445198721b53687f13b7436bf195ab67ca9241f");
});
