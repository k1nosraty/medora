import { fileURLToPath } from "node:url";
import { build } from "esbuild";

export async function bundleWorkbox() {
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
    define: { "process.env.NODE_ENV": '"production"' },
    write: false,
  });
  return outputFiles[0].text;
}
