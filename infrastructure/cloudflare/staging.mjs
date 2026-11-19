import { readFileSync, writeFileSync } from "node:fs";
const flags = process.argv.slice(2);
if (new Set(flags).size !== flags.length ||
    flags.some((flag) => !["--portable", "--check"].includes(flag)))
  throw Error("Use --portable for standalone PostgreSQL and --check to verify without writing a file");
const portable = flags.includes("--portable");
const config = JSON.parse(
  readFileSync(
    new URL(
      portable ? "./portable.local.json" : "./local.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const {
  MEDORA_STAGE_ACCOUNT: account,
  MEDORA_STAGE_HYPERDRIVE: hyperdrive,
  MEDORA_STAGE_BUCKET: bucket,
} = process.env;
if (
  ![account, hyperdrive].every(
    (s) => s && /^[0-9a-f]{32}$/.test(s) && !/^0+$/.test(s),
  ) ||
  !bucket ||
  bucket.length > 63 ||
  !/^medora-(?:staging(?:-[a-z0-9]+)*|(?:fixture|v2|portable)-staging)$/.test(bucket)
)
  throw new Error(
    "Supply dedicated staging account, Hyperdrive and stage bucket references",
  );
const localKeys = new Set([
  "name", "main", "compatibility_date", "compatibility_flags", "assets",
  "workers_dev", "preview_urls", "hyperdrive", "r2_buckets", "triggers",
  ...(!portable ? ["durable_objects", "migrations", "ratelimits"] : []),
]);
if (
  Object.keys(config).some((key) => !localKeys.has(key)) ||
  config.preview_urls !== false ||
  config.hyperdrive?.length !== 1 ||
  config.hyperdrive[0].binding !== "HYPERDRIVE" ||
  config.r2_buckets?.length !== 1 ||
  config.r2_buckets[0].binding !== "BACKUPS" ||
  config.durable_objects?.bindings.some((binding) => "script_name" in binding || "environment" in binding) ||
  config.migrations?.some((migration) =>
    Object.keys(migration).some((key) => key !== "tag" && key !== "new_sqlite_classes"))
)
  throw Error("The staging configuration must use only its own bindings and workers.dev");
config.name = portable ? "medora-portable-staging" : "medora-v2-staging";
config.account_id = account;
config.workers_dev = true;
config.hyperdrive = [{ binding: "HYPERDRIVE", id: hyperdrive }];
config.r2_buckets = [{ binding: "BACKUPS", bucket_name: bucket }];
config.triggers = { crons: ["* * * * *"] };
config.vars = { MEDORA_PAUSE_PUSH: "true" };
if (flags.includes("--check")) {
  console.log(JSON.stringify({ worker: config.name, previews: false, pushPaused: true, dedicatedBindingsRequired: true }));
} else {
  writeFileSync(
    new URL("./.staging.generated.json", import.meta.url),
    JSON.stringify(config, null, 2),
    { mode: 0o600, flag: "wx" },
  );
}
