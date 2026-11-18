import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function compileWorkbox(build, resolveDir) {
  const require = createRequire(join(resolveDir, "package.json"));
  const packageDir = dirname(require.resolve("workbox-routing/package.json"));
  const license = await readFile(join(packageDir, "LICENSE"), "utf8");
  const { outputFiles } = await build({
    stdin: {
      contents: 'export { registerRoute } from "workbox-routing";',
      resolveDir,
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
