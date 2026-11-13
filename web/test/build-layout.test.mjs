import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { accentOf, availableAccents } from "../public/medication/styles/theme.js";

const publicDir = new URL("../public/", import.meta.url);

test("compiled pages contain their components and valid local SVG references", async () => {
  for (const name of ["medication/index.html", "design/index.html"]) {
    const html = await readFile(new URL(name, publicDir), "utf8");
    assert.doesNotMatch(html, /<!-- include/);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
    const known = new Set(ids);
    assert.equal(known.size, ids.length, name + " has duplicate IDs");
    for (const [, symbol] of html.matchAll(/<use href="#([^"]+)"/g)) {
      assert.ok(known.has(symbol), name + " is missing SVG " + symbol);
    }
    for (const [, path] of html.matchAll(/(?:src|href)="(\/[^"#]+\.(?:css|js|svg))"/g)) {
      await readFile(new URL(path.slice(1), publicDir));
    }
  }
});

test("the fifth accent is available only with Cycle enabled", () => {
  assert.deepEqual(availableAccents().map(accent => accent.id), ["blue", "green", "lilac", "coral"]);
  assert.equal(availableAccents(true).at(-1).id, "berry");
  assert.equal(accentOf("berry"), "blue");
  assert.equal(accentOf("berry", true), "berry");
});
