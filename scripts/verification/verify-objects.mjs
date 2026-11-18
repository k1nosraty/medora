import { Client } from "pg";
import { AwsClient } from "aws4fetch";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const env = process.env;
if (
  new URL(env.DATABASE_URL).hostname !== "postgres" ||
  env.S3_ENDPOINT !== "http://storage:9000" ||
  !env.MEDORA_MAILPIT
)
  throw Error("Compose fixture required");
const db = new Client({ connectionString: env.DATABASE_URL });
await db.connect();
try {
  const client = new AwsClient({
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    region: env.S3_REGION,
    service: "s3",
  });
  const { rows } = await db.query(
    "SELECT owner,digest,bytes FROM medora.backups WHERE ready",
  );
  assert.ok(
    rows.length,
    "At least one previously saved fixture backup required",
  );
  for (const row of rows) {
    const path = [env.S3_BUCKET, "backups", row.owner, row.digest]
      .map(encodeURIComponent)
      .join("/");
    const response = await client.fetch(env.S3_ENDPOINT + "/" + path);
    assert.equal(response.status, 200, "Restored object must be readable");
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(bytes.length, row.bytes);
    assert.ok(
      createHash("sha256").update(bytes).digest("hex") === row.digest,
      "Restored object content mismatch",
    );
  }
  console.log(
    "Verified",
    rows.length,
    "restored encrypted object(s) against their catalog.",
  );
} finally {
  await db.end();
}
