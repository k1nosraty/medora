import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const { build } = require("esbuild");
export const { Miniflare, convertV4MiniflareOptions } = require("miniflare");
