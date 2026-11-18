import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "pg";
import { chromium, expect } from "@playwright/test";
import {
  abortHandoff,
  commitHandoff,
  initializePrimary,
  prepareHandoff,
} from "../migration/postgres-handoff.mjs";
import { s3Storage, r2Storage } from "../../apps/api/src/objects.ts";
import { fixtureObjects } from "./fixture-objects.mjs";
import { saveFixtureBackup } from "./backup-erasure.mjs";
import { fixtureMailbox } from "./mailbox.mjs";
import { bundleWorker } from "./bundle-worker.mjs";
import { withLocalWorker } from "./local-worker.mjs";
import {
  decryptBackup,
  encryptBackup,
} from "../../web/public/medication/shared/crypto/backup.js";

const [source, target, aborted, recoveryDb] = [
  "MEDORA_HANDOFF_SOURCE",
  "MEDORA_HANDOFF_TARGET",
  "MEDORA_HANDOFF_ABORTED",
  "MEDORA_HANDOFF_RECOVERY",
].map((name) => {
  const db = new URL(process.env[name] ?? "");
  if (
    !["127.0.0.1", "localhost"].includes(db.hostname) ||
    !/^\/medora_[a-z0-9_]+$/.test(db.pathname)
  )
    throw Error("Four fresh loopback fixture databases are required");
  return db.href;
});
assert.equal(new Set([source, target, aborted, recoveryDb]).size, 4);
const require = createRequire(
  new URL("../../web/package.json", import.meta.url),
);

const { Miniflare, convertV4MiniflareOptions } = require("miniflare");

const secret = () => randomBytes(32).toString("hex");
const mailbox = await fixtureMailbox();
const bucket = await fixtureObjects();
const rejected = await fixtureObjects();
const storage = (parts) =>
  s3Storage(
    parts.S3_ENDPOINT,
    parts.S3_BUCKET,
    parts.S3_ACCESS_KEY_ID,
    parts.S3_SECRET_ACCESS_KEY,
    "us-east-1",
  );
const targetBindings = process.env.MEDORA_HANDOFF_TEST_S3_ENDPOINT
  ? Object.fromEntries(
      ["ENDPOINT", "BUCKET", "ACCESS_KEY_ID", "SECRET_ACCESS_KEY"].map(
        (name) => ["S3_" + name, process.env["MEDORA_HANDOFF_TEST_S3_" + name]],
      ),
    )
  : bucket.bindings;
const endpoint = new URL(targetBindings.S3_ENDPOINT);
if (
  endpoint.protocol !== "http:" ||
  endpoint.hostname !== "127.0.0.1" ||
  !Object.values(targetBindings).every(Boolean)
)
  throw Error("The optional S3 fixture must be a dedicated loopback bucket");
const to = storage(targetBindings);
const broken = storage(rejected.bindings);
const scratch = await mkdtemp(join(tmpdir(), "medora-handoff-"));
const apiPort = await openPort();
const sourceDb = new Client({ connectionString: source });
const targetDb = new Client({ connectionString: target });
const root = resolve("apps/web/dist");
let workerd, returningWorker, node, browser, nodeClosed;
let upstream = "worker";
let upgradeShell = false;
const legacyShell = execFileSync(
  "git",
  ["show", "5ee5e47cafe7644b5dd15ae7408e909c755ee211:web/ui/pwa/sw.js"],
  { encoding: "utf8" },
);
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};
const gateway = createServer(async (request, response) => {
  try {
    const incoming = new URL(request.url, "http://localhost");
    if (
      incoming.pathname.startsWith("/api/") ||
      incoming.pathname === "/__scheduled"
    ) {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const headers = new Headers();
      for (const key of [
        "content-type",
        "cookie",
        "origin",
        "x-medora-owner",
        "if-none-match",
      ])
        if (request.headers[key]) headers.set(key, request.headers[key]);
      const options = {
        headers,
        method: request.method,
        ...(chunks.length && { body: Buffer.concat(chunks) }),
      };
      const cloud = upstream === "recovery" ? returningWorker : workerd;
      const backend =
        upstream !== "node"
          ? await cloud.dispatchFetch(new URL(request.url, origin), options)
          : await fetch(
              new URL(request.url, "http://127.0.0.1:" + apiPort),
              options,
            );
      const outgoing = Object.fromEntries(backend.headers);
      delete outgoing["content-encoding"];
      delete outgoing["content-length"];
      response
        .writeHead(backend.status, outgoing)
        .end(Buffer.from(await backend.arrayBuffer()));
      return;
    }
    const file = resolve(
      root,
      "." +
        incoming.pathname +
        (incoming.pathname.endsWith("/") ? "index.html" : ""),
    );
    if (!file.startsWith(root + sep)) return response.writeHead(404).end();
    let bytes = await readFile(file);
    if (incoming.pathname === "/medication/sw.js") {
      const worker = bytes.toString();
      const assetList = worker.match(/const shell = (\[[\s\S]*?\]);/)?.[1];
      if (!assetList)
        throw Error("Cannot identify the canonical precache list");
      bytes = Buffer.from(
        upgradeShell
          ? worker.replace(
              /prefix \+ "[a-f0-9]+"/,
              'prefix + "handoff-fixture"',
            )
          : legacyShell
              .replaceAll("{{version}}", "legacy-handoff-fixture")
              .replace("{{assets}}", assetList),
      );
    }
    response
      .writeHead(200, {
        "Content-Type": mime[extname(file)] ?? "application/octet-stream",
        "Cache-Control": "no-cache",
      })
      .end(bytes);
  } catch {
    response.writeHead(503).end();
  }
});
gateway.listen(0, "127.0.0.1");
await once(gateway, "listening");
const origin = "http://127.0.0.1:" + gateway.address().port;
const bindings = {
  MEDORA_PASSWORD_KEYS: JSON.stringify({ handoff: secret() }),
  MEDORA_CURRENT_PASSWORD_KEY: "handoff",
  MEDORA_CODE_KEY: secret(),
  MEDORA_MAIL_KEY: secret(),
  MEDORA_FROM: "fixture@example.test",
  MEDORA_MAILPIT: mailbox.origin,
  PUBLIC_ORIGIN: origin,
  MEDORA_PAUSE_PUSH: "true",
};

async function openPort() {
  const server = createServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}
const request = (context, path, data, headers = {}) =>
  context.post(origin + "/api/v2/" + path, {
    data,
    headers: { Origin: origin, ...headers },
  });

async function enroll(name) {
  const email = name + "@example.test",
    password = secret();
  const context = await browser.newContext();
  const challenge = await request(context.request, "identity/challenges", {
    email,
    purpose: "register",
  });
  assert.equal(challenge.status(), 202);
  const { challenge: id } = await challenge.json();
  const handler = await workerd.getWorker();
  await handler.scheduled({ scheduledTime: Date.now(), cron: "* * * * *" });
  assert.ok(mailbox.codes.has(email));
  const confirmation = await request(
    context.request,
    "identity/confirm-email",
    {
      email,
      challenge: id,
      code: mailbox.codes.get(email),
    },
  );
  assert.equal(confirmation.status(), 200);
  const { grant } = await confirmation.json();
  const registered = await request(context.request, "identity/register", {
    username: name,
    challenge: id,
    grant: grant.split(".")[1],
    password,
  });
  assert.equal(registered.status(), 200);
  const session = await request(context.request, "session", {
    username: name,
    password,
  });
  assert.equal(session.status(), 200);
  const profile = await context.request.get(origin + "/api/v2/profile");
  assert.equal(profile.status(), 200);
  const { scope: owner } = await profile.json();
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem("medora-language", "en"));
  await page.goto(origin + "/medication/?view=water");
  await page.locator("#welcome-start").click();
  await page.locator(".header-tools [data-destination=settings]").click();
  await page.locator("#settings-dialog [data-open-account]").click();
  await expect(page.locator("#account-session")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#account-sync-enable").click();
  await expect.poll(() => readLocal(page, "enabled")).toBe(true);
  await page.goto(origin + "/medication/?view=water");
  await page.evaluate(async () => {
    const { accessCare } = await import("/medication/shared/storage.js");
    await accessCare((state) => {
      state.fixtureExtension = { value: "preserve" };
    });
    await navigator.serviceWorker.ready;
  });
  return { context, page, owner, email };
}
function readLocal(page, key) {
  return page.evaluate(
    (key) =>
      new Promise((resolve, reject) => {
        const opened = indexedDB.open("medora-medication-prototype");
        opened.onupgradeneeded = () => opened.transaction.abort();
        opened.onerror = () => reject(opened.error);
        opened.onsuccess = () => {
          const db = opened.result;
          const tx = db.transaction(["care", "days"], "readonly");
          const settings = tx.objectStore("care").get("state");
          const history = tx.objectStore("days").getAll();
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
          tx.oncomplete = () => {
            db.close();
            if (key === "enabled")
              resolve(Boolean(settings.result?.settings.accountCare?.enabled));
            else if (key === "extension")
              resolve(settings.result?.settings.fixtureExtension?.value);
            else
              resolve(
                history.result.flatMap(({ water }) =>
                  water.map(({ id, amount }) => ({ id, amount })),
                ),
              );
          };
        };
      }),
    key,
  );
}
async function household(person, command, status = 200) {
  const response = await request(person.context.request, "household", command, {
    "X-Medora-Owner": person.owner,
  });
  assert.equal(response.status(), status);
  return response.json();
}
async function saved(person) {
  const response = await person.context.request.get(origin + "/api/v2/care", {
    headers: { "X-Medora-Owner": person.owner },
  });
  assert.equal(response.status(), 200);
  const { records } = await response.json();
  return records.water.map(({ id, amount }) => ({ id, amount }));
}
async function add(person, amount) {
  await person.page
    .locator("#water-entry [data-water-add='" + amount + "']")
    .click();
}
async function failsValidation(person) {
  const response = await request(
    person.context.request,
    "care",
    {
      operation: "invalid",
      baseRevision: 0,
      changes: [],
    },
    { "X-Medora-Owner": person.owner },
  );
  assert.equal(response.status(), 400);
}
async function writer() {
  return (await (await fetch(origin + "/api/v2/product-writer")).json()).writer;
}

try {
  execFileSync(process.execPath, ["scripts/migration/apply.mjs"], {
    env: { ...process.env, DATABASE_URL: source },
    stdio: "ignore",
  });
  await initializePrimary(source);
  await sourceDb.connect();
  const script = await bundleWorker("apps/api/src/adapters/worker.ts");
  const workerFor = (database) =>
    new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script,
        compatibilityDate: "2026-10-29",
        compatibilityFlags: ["nodejs_compat"],
        hyperdrives: { HYPERDRIVE: database },
        r2Buckets: ["BACKUPS"],
        bindings,
      }),
    );
  workerd = workerFor(source);
  await workerd.ready;
  assert.equal(await writer(), "postgres");
  assert.equal(
    (await fetch(origin + "/api/account/care", { method: "PUT" })).status,
    503,
  );
  async function workerStorage(worker) {
    const r2 = await worker.getR2Bucket("BACKUPS");
    return {
      ...r2Storage(r2),
      async *listKeys() {
        let cursor;
        do {
          const page = await r2.list({ cursor });
          for (const object of page.objects) yield object.key;
          cursor = page.truncated ? page.cursor : undefined;
        } while (cursor);
      },
    };
  }
  const from = await workerStorage(workerd);
  await to.initialize();
  browser = await chromium.launch({
    executablePath: process.env.MEDORA_CHROMIUM,
  });
  const people = [
    await enroll("handoff_first"),
    await enroll("handoff_second"),
  ];
  await add(people[0], 250);
  await add(people[1], 500);
  for (const person of people)
    await expect.poll(async () => (await saved(person)).length).toBe(1);
  await failsValidation(people[0]);
  const [first, second] = people;
  const { group } = await household(first, {
    action: "create",
    name: "Handoff fixture household",
    icon: "group",
  });
  const { invite } = await household(first, {
    action: "invite",
    group,
    email: second.email,
    language: "en",
  });
  await household(second, { action: "accept", invite });
  const homeResponse = await first.context.request.get(
    origin + "/api/v2/household",
    {
      headers: { "X-Medora-Owner": first.owner },
    },
  );
  const home = await homeResponse.json();
  const members = home.groups.find((item) => item.id === group).members;
  const ownerMember = members.find(({ self }) => self).id;
  const viewerMember = members.find(({ self }) => !self).id;
  const view = { action: "view", group, target: ownerMember };
  await household(second, view, 403);
  await household(first, {
    action: "share",
    group,
    target: viewerMember,
    sections: ["water"],
    days: 7,
    record: false,
    add: false,
  });
  const originalGrant = await household(second, view);
  const unauthorized = await people[0].context.request.get(
    origin + "/api/v2/care",
    { headers: { "X-Medora-Owner": people[1].owner } },
  );
  assert.equal(unauthorized.status(), 409);
  const cookie = (await people[0].context.cookies()).find(
    (entry) => entry.name === "__Host-medora_v2",
  );
  assert.ok(cookie);
  const backupPassword = secret();
  const backupMagic = new TextEncoder().encode("MEDORAW\x01");
  const backupData = { water: await saved(first) };
  const ciphertext = await encryptBackup(
    backupData,
    backupPassword,
    backupMagic,
  );
  const digest = await saveFixtureBackup(
    origin,
    { Origin: origin, Cookie: cookie.name + "=" + cookie.value },
    people[0].owner,
    ciphertext,
  );
  const freezeBefore = join(scratch, "abort");
  const prepared = {
    source,
    target: aborted,
    from,
    to: broken,
    output: freezeBefore,
  };
  await assert.rejects(
    prepareHandoff({
      ...prepared,
      to: {
        ...broken,
        put: async () => {
          throw Error("fixture copy interrupted");
        },
      },
    }),
    /fixture copy interrupted/,
  );
  assert.equal(await writer(), "frozen");
  await assert.rejects(commitHandoff(prepared), { code: "ENOENT" });
  await abortHandoff(source, freezeBefore);
  assert.equal(await writer(), "postgres");

  for (const [i, person] of people.entries()) {
    await person.context.setOffline(true);
    await add(person, i ? 250 : 500);
    await expect(person.page.locator("#water-entries .entry-row")).toHaveCount(
      2,
    );
    await add(person, 250);
    await expect(person.page.locator("#water-entries .entry-row")).toHaveCount(
      3,
    );
    await person.page.reload({ waitUntil: "domcontentloaded" });
    await expect(person.page.locator("#water-entries .entry-row")).toHaveCount(
      3,
    );
    assert.equal(await readLocal(person.page, "extension"), "preserve");
  }
  const pendingMail = await people[0].context.request.post(
    origin + "/api/v2/identity/challenges",
    {
      data: { email: people[0].email, purpose: "reset" },
      headers: { Origin: origin },
    },
  );
  assert.equal(pendingMail.status(), 202);
  const { challenge } = await pendingMail.json();
  const finalOutput = join(scratch, "cutover");
  const final = { source, target, from, to, output: finalOutput };
  await sourceDb.query("BEGIN");
  await sourceDb.query("SELECT medora.lock_writer()");
  await sourceDb.query(
    "INSERT INTO medora.operations_counters(day,metric,count) VALUES(0,'handoff-late-write',1)",
  );
  const copying = prepareHandoff(final);
  assert.equal(
    await Promise.race([copying.then(() => true), delay(150, false)]),
    false,
  );
  await sourceDb.query("COMMIT");
  const report = await copying;
  assert.equal(report.objects, 1);
  assert.equal(await writer(), "frozen");
  await assert.rejects(
    sourceDb.query("UPDATE medora.records SET revision=revision WHERE false"),
    { code: "55000" },
  );
  upgradeShell = true;
  for (const person of people) {
    await person.context.setOffline(false);
    await person.page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      await registration.update();
    });
    await expect
      .poll(() =>
        person.page.evaluate(async () =>
          (await caches.keys()).includes(
            "medora-medication-shell-handoff-fixture",
          ),
        ),
      )
      .toBe(true);
    await person.context.setOffline(true);
    await person.page.reload({ waitUntil: "domcontentloaded" });
    await expect(person.page.locator("#water-entries .entry-row")).toHaveCount(
      3,
    );
    assert.equal(await readLocal(person.page, "extension"), "preserve");
  }
  const sibling = await people[0].context.newPage();
  await sibling.goto(origin + "/medication/?view=water");
  await expect(sibling.locator("#water-entries .entry-row")).toHaveCount(3);
  await sibling.close();
  await targetDb.connect();
  assert.equal(
    (
      await targetDb.query(
        "SELECT 1 FROM medora.mail_outbox WHERE challenge=$1 AND sent_at IS NULL",
        [challenge],
      )
    ).rowCount,
    1,
  );
  assert.equal(
    (
      await targetDb.query(
        "SELECT count FROM medora.operations_counters WHERE metric='handoff-late-write'",
      )
    ).rows[0].count,
    "1",
  );
  await assert.rejects(
    targetDb.query("UPDATE medora.records SET revision=revision WHERE false"),
    { code: "55000" },
  );
  await commitHandoff(final);
  await commitHandoff(final);
  await assert.rejects(
    abortHandoff(source, finalOutput),
    /frozen original source/,
  );
  node = spawn(process.execPath, ["apps/api/dist/server.mjs"], {
    env: {
      PATH: process.env.PATH,
      DATABASE_URL: target,
      PORT: String(apiPort),
      ...bindings,
      ...targetBindings,
    },
    stdio: "ignore",
  });
  nodeClosed = once(node, "exit");
  for (let i = 0; ; i++) {
    if (
      (
        await fetch("http://127.0.0.1:" + apiPort + "/api/v2/health").catch(
          () => null,
        )
      )?.ok
    )
      break;
    if (i === 80 || node.exitCode !== null)
      throw Error("Node target did not start");
    await delay(100);
  }
  upstream = "node";
  await failsValidation(people[0]);
  assert.equal(await writer(), "postgres");
  for (const person of people) {
    const queued = await readLocal(person.page, "water");
    const response = person.page.waitForResponse(
      (reply) =>
        reply.url().endsWith("/api/v2/care") &&
        reply.request().method() === "POST" &&
        reply.ok(),
    );
    await person.context.setOffline(false);
    const sent = (await response).request().postDataJSON();
    await expect.poll(() => saved(person)).toEqual(queued);
    const replay = await request(person.context.request, "care", sent, {
      "X-Medora-Owner": person.owner,
    });
    assert.equal(replay.status(), 200);
    assert.deepEqual(await saved(person), queued);
    assert.equal(
      (await person.context.request.get(origin + "/api/v2/profile")).status(),
      200,
    );
  }
  await expect
    .poll(
      async () =>
        (
          await targetDb.query(
            "SELECT 1 FROM medora.mail_outbox WHERE challenge=$1 AND sent_at IS NOT NULL",
            [challenge],
          )
        ).rowCount,
      { timeout: 15000 },
    )
    .toBe(1);
  const backup = await people[0].context.request.get(
    origin + "/api/v2/backups/" + digest,
    { headers: { "X-Medora-Owner": people[0].owner } },
  );
  assert.equal(backup.status(), 200);
  assert.deepEqual(
    await decryptBackup(
      new Uint8Array(await backup.body()),
      backupPassword,
      backupMagic,
    ),
    backupData,
  );
  const restoredGrant = await household(second, view);
  assert.deepEqual(restoredGrant.policy, originalGrant.policy);
  assert.equal(restoredGrant.records.visits, undefined);
  const denied = await people[1].context.request.get(origin + "/api/v2/care", {
    headers: { "X-Medora-Owner": people[0].owner },
  });
  assert.equal(denied.status(), 409);
  assert.equal(
    (await sourceDb.query("SELECT phase FROM medora.infrastructure_handoff"))
      .rows[0].phase,
    "retired",
  );
  // Roll back the runtime after new Node writes by creating a fresh recovery
  // copy from its authoritative state. The old, retired source remains fenced.
  const nodeState = await Promise.all(people.map(saved));
  returningWorker = workerFor(recoveryDb);
  await returningWorker.ready;
  const reverse = {
    source: target,
    target: recoveryDb,
    from: to,
    to: await workerStorage(returningWorker),
    output: join(scratch, "return"),
  };
  const reverseReport = await prepareHandoff(reverse);
  assert.deepEqual(reverseReport, report);
  assert.equal(await writer(), "frozen");
  await commitHandoff(reverse);
  upstream = "recovery";
  assert.equal(await writer(), "postgres");
  assert.deepEqual(await Promise.all(people.map(saved)), nodeState);
  assert.deepEqual(
    (await household(second, view)).policy,
    originalGrant.policy,
  );
  assert.equal(
    (
      await people[0].context.request.get(
        origin + "/api/v2/backups/" + digest,
        { headers: { "X-Medora-Owner": people[0].owner } },
      )
    ).status(),
    200,
  );
  await withLocalWorker(
    recoveryDb,
    await openPort(),
    bindings,
    async (local) => {
      assert.equal(
        (await (await fetch(local + "/api/v2/product-writer")).json()).writer,
        "postgres",
      );
      assert.equal(
        (await fetch(local + "/api/account/care", { method: "PUT" })).status,
        503,
      );
      assert.equal((await fetch(local + "/medication/")).status, 200);
    },
    { config: "infrastructure/cloudflare/portable.local.json" },
  );
  console.log(
    JSON.stringify({
      source: "synthetic Workerd",
      target: "local Node",
      ...report,
      accounts: 2,
      offlineWrites: 4,
      sameOrigin: true,
      sessionsPreserved: true,
      standaloneWranglerVerified: true,
      backupDecrypted: true,
      outboxResumed: true,
      grantPreserved: true,
      updatedServiceWorker: true,
      twoTabs: true,
      reversedAfterWrites: true,
      concurrentWriterDrained: true,
      abortedCopyRecovered: true,
    }),
  );
} finally {
  await browser?.close();
  if (node) {
    node.kill("SIGTERM");
    await nodeClosed;
  }
  await returningWorker?.dispose();
  await workerd?.dispose();
  await sourceDb.end();
  await targetDb.end();
  await mailbox.close();
  await bucket.close();
  await rejected.close();
  await new Promise((resolve) => gateway.close(resolve));
  await rm(scratch, { force: true, recursive: true });
}
