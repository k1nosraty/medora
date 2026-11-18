import { readFileSync, writeFileSync } from "node:fs";
const mode = process.argv.slice(2);
if (mode.length && (mode.length !== 1 || mode[0] !== "--portable"))
  throw Error("Use --portable for standalone PostgreSQL");
const portable = mode.length === 1;
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
  !/^medora-[a-z0-9-]*stag[a-z0-9-]+$/.test(bucket ?? "")
)
  throw new Error(
    "Supply dedicated staging account, Hyperdrive and stage bucket references",
  );
config.triggers = { crons: ["* * * * *"] };
config.name = portable ? "medora-portable-staging" : "medora-v2-staging";
config.account_id = account;
config.workers_dev = true;
config.hyperdrive[0].id = hyperdrive;
config.r2_buckets[0].bucket_name = bucket;
writeFileSync(
  new URL("./.staging.generated.json", import.meta.url),
  JSON.stringify(config, null, 2),
  { mode: 0o600 },
);
