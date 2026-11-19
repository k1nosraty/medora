import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const inputs = {
  MEDORA_STAGE_ACCOUNT: "11111111111111111111111111111111",
  MEDORA_STAGE_HYPERDRIVE: "22222222222222222222222222222222",
  MEDORA_STAGE_BUCKET: "medora-staging-archives",
};

describe("offline staging configuration", () => {
  let dir: string;
  let output: string;
  const run = (args: string[], env = inputs) =>
    spawnSync(process.execPath, [join(dir, "staging.mjs"), ...args], {
      env,
      encoding: "utf8",
    });

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "medora-stage-config-"));
    output = join(dir, ".staging.generated.json");
    for (const name of ["staging.mjs", "local.json", "portable.local.json"])
      await cp(new URL(`../../infrastructure/cloudflare/${name}`, import.meta.url), join(dir, name));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("checks without writing and renders portable bindings into a private file once", async () => {
    const checked = run(["--portable", "--check"]);
    expect(checked.status).toBe(0);
    expect(JSON.parse(checked.stdout)).toEqual({
      worker: "medora-portable-staging",
      previews: false,
      pushPaused: true,
      dedicatedBindingsRequired: true,
    });
    await expect(stat(output)).rejects.toMatchObject({ code: "ENOENT" });

    const rendered = run(["--portable"]);
    expect(rendered.status).toBe(0);
    expect(rendered.stdout).toBe("");
    const original = await readFile(output, "utf8");
    const result = JSON.parse(original);
    expect(result).toMatchObject({
      workers_dev: true,
      preview_urls: false,
      account_id: inputs.MEDORA_STAGE_ACCOUNT,
      hyperdrive: [{ binding: "HYPERDRIVE", id: inputs.MEDORA_STAGE_HYPERDRIVE }],
      r2_buckets: [{ binding: "BACKUPS", bucket_name: inputs.MEDORA_STAGE_BUCKET }],
      vars: { MEDORA_PAUSE_PUSH: "true" },
    });
    expect(result).not.toHaveProperty("routes");
    expect(result).not.toHaveProperty("durable_objects");
    expect((await stat(output)).mode & 0o777).toBe(0o600);
    expect(run(["--portable"]).status).toBe(1);
    expect(await readFile(output, "utf8")).toBe(original);
  });

  it("keeps the migration bridge in its own Worker namespaces", async () => {
    expect(run([]).status).toBe(0);
    const result = JSON.parse(await readFile(output, "utf8"));
    expect(result.name).toBe("medora-v2-staging");
    expect(result.durable_objects.bindings).toHaveLength(7);
    for (const binding of result.durable_objects.bindings) {
      expect(binding).not.toHaveProperty("script_name");
      expect(binding).not.toHaveProperty("environment");
    }
  });

  it("rejects ambiguous bucket names and placeholder identifiers", () => {
    for (const bucket of ["medora", "medora-production-staging", "medora-staging-prod", "medora-stagnant"]) {
      const result = run(["--portable", "--check"], { ...inputs, MEDORA_STAGE_BUCKET: bucket });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Supply dedicated staging");
    }
    expect(run(["--portable", "--check"], {
      ...inputs,
      MEDORA_STAGE_HYPERDRIVE: "0".repeat(32),
    }).status).toBe(1);
  });

  it("rejects a local template containing an external service binding", async () => {
    const template = join(dir, "portable.local.json");
    const config = JSON.parse(await readFile(template, "utf8"));
    config.services = [{ binding: "OTHER", service: "unrelated-fixture" }];
    await writeFile(template, JSON.stringify(config));
    const result = run(["--portable", "--check"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must use only its own bindings");
  });

  it("rejects a bridge migration that would transfer an existing Worker class", async () => {
    const template = join(dir, "local.json");
    const config = JSON.parse(await readFile(template, "utf8"));
    config.migrations.push({
      tag: "unsafe-transfer",
      transferred_classes: [{ from: "Family", from_script: "unrelated-fixture", to: "Families" }],
    });
    await writeFile(template, JSON.stringify(config));
    expect(run(["--check"]).stderr).toContain("must use only its own bindings");
  });
});
