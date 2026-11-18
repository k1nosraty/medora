import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Client } from "pg";
import { readFile } from "node:fs/promises";
import { passwordProof } from "../../web/src/accounts/auth-crypto.mjs";

const origin = new URL(process.argv[2]);
if (
  !["127.0.0.1", "localhost"].includes(origin.hostname) ||
  origin.protocol !== "http:"
)
  throw new Error("Runtime rehearsal requires an isolated loopback origin");
const dbUrl = process.env.MEDORA_TEST_DATABASE_URL;
const project = process.env.MEDORA_TEST_COMPOSE_PROJECT;
if (
  !dbUrl === !project ||
  (dbUrl && !["127.0.0.1", "localhost"].includes(new URL(dbUrl).hostname))
)
  throw Error("Choose one isolated database target");
const id = randomUUID(),
  username = id.replaceAll("-", ""),
  password = randomBytes(24).toString("hex"),
  salt = randomBytes(16).toString("hex");
const proof = await passwordProof(
  JSON.parse(process.env.MEDORA_PASSWORD_KEYS).legacy,
  password,
  salt,
);
const row = [id, username + "@example.test", username, salt, proof];
if (project) {
  if (!/^medora-[a-z0-9-]+$/.test(project))
    throw Error("Invalid fixture project");
  const envFile = process.env.MEDORA_TEST_COMPOSE_ENV;
  const sql =
    "INSERT INTO medora.accounts(id,email,username,password_salt,password_proof,password_key,sync_generation) VALUES (" +
    row.map((v) => "'" + v + "'").join(",") +
    ",'legacy',2)";
  execFileSync(
    "docker",
    [
      "compose",
      "--env-file",
      envFile,
      "-p",
      project,
      "exec",
      "-T",
      "postgres",
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "medora",
    ],
    { input: sql, stdio: ["pipe", "ignore", "pipe"] },
  );
} else {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query(
      "INSERT INTO medora.accounts(id,email,username,password_salt,password_proof,password_key,sync_generation) VALUES ($1,$2,$3,$4,$5,'legacy',2)",
      row,
    );
  } finally {
    await client.end();
  }
}
const request = (path, options = {}) =>
  fetch(new URL("/api/v2/" + path, origin), { ...options, redirect: "error" });
const auth = await request("session", {
  method: "POST",
  headers: { Origin: origin.origin, "Content-Type": "application/json" },
  body: JSON.stringify({ username, password }),
});
assert.equal(auth.status, 200, "sign-in");
const headers = {
  Cookie: auth.headers.get("Set-Cookie").split(";")[0],
  Origin: origin.origin,
  "X-Medora-Owner": id,
};
const op = {
  operation: randomUUID(),
  kind: "water",
  id: randomUUID(),
  baseRevision: 0,
  body: { day: 20000, time: "13:30", amount: 300 },
};
const push = await request("changes", {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify(op),
});
assert.equal(push.status, 200, "push");
assert.deepEqual(
  (await (await request("changes", { headers })).json()).changes,
  [{ ...op, cursor: 1 }],
);
const bytes = await readFile(
  new URL("../../web/test/fixtures/android-medora-v1.medora", import.meta.url),
);
const saved = await request("backups", {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/octet-stream" },
  body: bytes,
});
assert.equal(saved.status, 200, "archive upload");
const archive = await saved.json();
const restored = await request("backups/" + archive.id, { headers });
assert.equal(restored.status, 200);
assert.deepEqual(Buffer.from(await restored.arrayBuffer()), bytes);
assert.equal(
  (await request("session", { method: "DELETE", headers })).status,
  204,
);
assert.equal((await request("changes", { headers })).status, 401);
console.log(
  "Passed session, owner-bound push/pull, encrypted object round trip and revocation.",
);
