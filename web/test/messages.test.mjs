import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import fa from "../../apps/web/product-assets/public/medication/shared/i18n/messages-fa.js";
import en from "../../apps/web/product-assets/public/medication/shared/i18n/messages-en.js";

test("stable UI message keys exist in both locales and use the same parameters", async () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(fa).sort());
  const parameters = text => [...new Set(text.match(/\{\d+\}/g))].sort();
  for (const [key, message] of Object.entries(fa)) {
    assert.ok(en[key]?.trim(), key);
    assert.deepEqual(parameters(en[key]), parameters(message), key);
  }
  for (const directory of ["../../apps/web/product-assets/ui/", "../../apps/web/product-assets/public/medication/"]) {
    const root = new URL(directory, import.meta.url);
    for (const file of await readdir(root, { recursive: true })) {
      if (!/\.(js|html)$/.test(file) || file.startsWith("bundles/")) continue;
      const source = await readFile(new URL(file, root), "utf8");
      for (const [, key] of source.matchAll(/(?:\bt\("|\{\{msg:)(ui\.[a-z0-9.-]+)/g)) {
        assert.ok(Object.hasOwn(fa, key), `${file}: ${key}`);
      }
    }
  }
});
