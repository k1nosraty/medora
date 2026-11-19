import { builtinModules, createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const { build } = createRequire(
  import.meta.url,
)("esbuild");

export async function bundleWorker(entry) {
  const compiled = await build({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "esm",
    conditions: ["workerd"],
    external: ["node:*", "cloudflare:*", "pg-native"],
    write: false,
    plugins: [
      {
        name: "workerd-node-imports",
        setup(bundle) {
          const builtins = new Set(builtinModules);
          bundle.onResolve({ filter: /.*/ }, ({ path, kind }) => {
            if (
              kind === "require-call" &&
              builtins.has(path.replace(/^node:/, ""))
            )
              return {
                path: path.startsWith("node:") ? path : "node:" + path,
                namespace: "node-builtins",
              };
          });
          bundle.onLoad(
            { filter: /.*/, namespace: "node-builtins" },
            ({ path }) => ({
              contents: `import api from ${JSON.stringify(path)}; module.exports = api;`,
            }),
          );
        },
      },
    ],
  });
  return compiled.outputFiles[0].text;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [entry, output] = process.argv.slice(2);
  if (!entry || !output) throw Error("Supply the local entry and output");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, await bundleWorker(entry));
}
