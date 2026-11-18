import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const asset = (p: string) => readFileSync(new URL(p, import.meta.url));
export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "medora-offline",
      generateBundle(_, bundle) {
        const art: Record<string, string> = {
          "art/logo.svg": "../../branding/logo.svg",
          "art/water.webp": "../../web/public/design/optical-glass/water.webp",
          "art/today.webp":
            "../../web/public/medication/assets/illustrations/today-noon.webp",
          "icon-192.png": "../../web/public/medora-icon-192.png",
          "icon-512.png": "../../web/public/medora-icon-512.png",
          "FONT-LICENSE.txt": "../../web/public/FONT-LICENSE.txt",
        };
        const files = new Map<string, Buffer | string>();
        for (const [name, source] of Object.entries(art)) {
          const bytes = asset(source);
          files.set(name, bytes);
          this.emitFile({ type: "asset", fileName: name, source: bytes });
        }
        const manifest = JSON.stringify({
          id: "./",
          name: "مدورا",
          short_name: "مدورا",
          lang: "fa",
          dir: "rtl",
          scope: "./",
          start_url: "./",
          display: "standalone",
          theme_color: "#006f68",
          background_color: "#eaf5ee",
          icons: [192, 512].map((size) => ({
            src: "./icon-" + size + ".png",
            sizes: size + "x" + size,
            type: "image/png",
          })),
        });
        this.emitFile({
          type: "asset",
          fileName: "manifest.webmanifest",
          source: manifest,
        });
        files.set("manifest.webmanifest", manifest);
        for (const [name, item] of Object.entries(bundle))
          files.set(
            name,
            item.type === "chunk" ? item.code : Buffer.from(item.source),
          );
        if (!files.has("index.html"))
          files.set("index.html", asset("./index.html"));
        const hash = createHash("sha256");
        for (const [name, bytes] of [...files].sort(([a], [b]) =>
          a.localeCompare(b),
        )) {
          hash.update(name);
          hash.update(bytes);
        }
        const template = asset("./sw.template.js");
        hash.update(template);
        const sw = template
          .toString()
          .replace('"__VERSION__"', JSON.stringify(hash.digest("hex")))
          .replace('"__FILES__"', JSON.stringify([...files.keys()]));
        this.emitFile({ type: "asset", fileName: "sw.js", source: sw });
        this.emitFile({
          type: "asset",
          fileName: "_headers",
          source: asset("./static.headers"),
        });
      },
    },
  ],
});
