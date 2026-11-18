import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

export async function bundleWorkbox() {
  const license = await readFile(
    new URL("../node_modules/workbox-routing/LICENSE", import.meta.url),
    "utf8",
  );
  const { outputFiles } = await build({
    stdin: {
      contents: 'export { registerRoute } from "workbox-routing";',
      resolveDir: fileURLToPath(new URL("../", import.meta.url)),
    },
    bundle: true,
    minify: true,
    platform: "browser",
    format: "iife",
    globalName: "MedoraWorkbox",
    banner: { js: "/*\n" + license.trim() + "\n*/" },
    define: { "process.env.NODE_ENV": '"production"' },
    write: false,
  });
  return outputFiles[0].text;
}
