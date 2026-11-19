import { verifyRecoveredCatalog } from "./catalog-readback.mjs";
import { fixtureObjects } from "./fixture-objects.mjs";
import { saveFixtureBackup, eraseFixtureAccount } from "./backup-erasure.mjs";
import { backupStorage } from "../migration/backup-recovery.mjs";
import { verifyRegistration } from "./registration-cutover.mjs";
import { verifyCampaignWrites } from "./promotion-cutover.mjs";
import {
  verifyCampaignExport,
  verifyOperationalWrites,
} from "./operations-cutover.mjs";
import { fixturePush, verifyReminderWrites } from "./reminder-cutover.mjs";
import { hmac } from "../../web/src/accounts/auth-crypto.mjs";
import { withLocalWorker } from "./local-worker.mjs";
import { fixtureMailbox } from "./mailbox.mjs";
import { readdir, lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { verifyHouseholdWrites } from "./household-post-write.mjs";
import { verifyProductBrowser } from "./product-browser.mjs";
import { careDelta } from "../../apps/web/product-assets/public/medication/domain/care-delta.js";
import {
  importRecoveryKey,
  openPrivateCare,
  sealPrivateCare,
} from "../../apps/web/product-assets/public/medication/features/sync/private-care.js";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "pg";
import {
  beginFixtureTransition,
  freezeWriter,
} from "../migration/writer-transition.mjs";
import { reverseCare } from "../migration/reverse-care.mjs";

export async function verifyPostWrite({
  url,
  archive,
  key,
  keyFile,
  restored,
  probeFencedSource,
  snapshot,
  expected,
  unmapped,
  eraseImported,
}) {
  const fencedConnection = {
    connectionString: url,
    options: "-c medora.source_fenced=true",
  };
  const client = new Client(fencedConnection);
  await client.connect();
  const socket = createServer().listen(0, "127.0.0.1");
  await once(socket, "listening");
  const { port } = socket.address();
  await new Promise((resolve) => socket.close(resolve));
  const origin = "http://127.0.0.1:" + port;
  const mailbox = await fixtureMailbox();
  const push = fixturePush();
  const objects = await fixtureObjects();
  const storage = backupStorage(objects.bindings);
  const legacyKey = randomBytes(32).toString("hex");
  const api = spawn(process.execPath, ["apps/api/dist/server.mjs"], {
    stdio: "ignore",
    env: {
      PATH: process.env.PATH,
      DATABASE_URL: url,
      HOST: "127.0.0.1",
      MEDORA_LEGACY_WRITES_FENCED: "true",
      EMAIL_SESSION_KEY: legacyKey,
      ADMIN_EMAIL: expected.people[1].credential[2],
      MEDORA_RELEASE: "a".repeat(40),
      ...push,
      ...objects.bindings,
      ...{
        MEDORA_MAILPIT: mailbox.origin,
        MEDORA_CODE_KEY: randomBytes(32).toString("hex"),
        MEDORA_MAIL_KEY: randomBytes(32).toString("hex"),
        MEDORA_FROM: "fixture@example.test",
      },
      PORT: String(port),
      MEDORA_PASSWORD_KEYS: JSON.stringify({ legacy: "a".repeat(64) }),
    },
  });
  const closed = once(api, "exit");
  try {
    await beginFixtureTransition(client, archive, key);
    for (let n = 0; ; n++) {
      if ((await fetch(origin + "/api/v2/health").catch(() => null))?.ok) break;
      if (n > 100 || api.exitCode !== null)
        throw Error("Fixture API startup failed");
      await delay(75);
    }
    const person = expected.people[0],
      headers = {
        Origin: origin,
        "Content-Type": "application/json",
        "X-Medora-Owner": person.id,
      };
    const send = (path, body) =>
      fetch(origin + "/api/v2/" + path, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
    const login = await send("session", {
      username: "fixture0",
      password: "synthetic fixture password",
    });
    assert.equal(login.status, 200);
    headers.Cookie = login.headers.get("set-cookie").split(";")[0];
    const signed = person.id + "." + person.token;
    const originalCookie =
      "__Host-medora_session=" +
      signed +
      "." +
      (await hmac(legacyKey, "session-v1", signed));
    const sessionWith = (cookie) =>
      fetch(origin + "/api/v2/session", { headers: { Cookie: cookie } });
    assert.equal((await sessionWith(originalCookie)).status, 200);
    assert.equal((await sessionWith(originalCookie.slice(0, -1))).status, 401);
    async function requestReset() {
      const email = person.credential[2];
      const challenge = await send("identity/challenges", {
        email,
        purpose: "reset",
      });
      assert.equal(challenge.status, 202);
      const { challenge: id } = await challenge.json();
      const until = Date.now() + 20000;
      while (!mailbox.codes.has(email) && Date.now() < until) await delay(100);
      const code = mailbox.codes.get(email);
      assert.ok(code);
      return { challenge: id, code };
    }
    if (unmapped) {
      await requestReset();
      await freezeWriter(client, snapshot);
      const inspector = new Client({ connectionString: url });
      await inspector.connect();
      try {
        await assert.rejects(
          reverseCare(inspector, archive, key, restored),
          /different reverse projection/,
        );
        await assert.rejects(lstat(restored), { code: "ENOENT" });
      } finally {
        await inspector.end();
      }
      return { pendingPasswordReset: true, recoveryPublicationBlocked: true };
    }
    if (eraseImported) {
      const admin = await send("session", {
        username: "fixture1",
        password: "synthetic fixture password",
      });
      assert.equal(admin.status, 200);
      const actor = {
        ...headers,
        Cookie: admin.headers.get("set-cookie").split(";")[0],
      };
      const backup = await saveFixtureBackup(origin, headers, person.id);
      await eraseFixtureAccount(
        origin,
        actor,
        {
          username: "fixture0",
          password: "synthetic fixture password",
          headers,
          owner: person.id,
        },
        objects,
        backup,
        true,
      );
      assert.equal((await sessionWith(originalCookie)).status, 401);
      // Wait for the cleanup transaction to commit after object readback.
      for (let n = 0; n < 50; n++) {
        const pending = await client.query(
          "SELECT 1 FROM medora.backup_cleanup LIMIT 1",
        );
        if (!pending.rowCount) break;
        await delay(100);
      }
      await freezeWriter(client, snapshot);
      expected.erased = {
        name: person.credential[0],
        owner: person.id,
        archived: true,
      };
      expected.people.shift();
      const recovered = await reverseCare(
        client,
        archive,
        key,
        restored,
        storage,
      );
      assert.deepEqual(recovered, {
        owners: 1,
        replayed: 0,
        reminderDevices: 0,
        backupObjects: 0,
        deletedAccounts: 1,
      });
      return {
        ...recovered,
        delayedObjectCleanupRetried: true,
        legacySessionRevoked: true,
      };
    }
    const { rows: seeds } = await client.query(
      "SELECT id,revision FROM medora.records WHERE owner=$1 AND id IN ('w-0','w-1') ORDER BY id",
      [person.id],
    );
    const body = { day: 20008, time: "12:30", amount: 375 };
    const add = {
      kind: "water",
      id: randomUUID(),
      baseRevision: 0,
      body,
      operation: randomUUID(),
    };
    const edit = {
      ...add,
      id: seeds[0].id,
      baseRevision: Number(seeds[0].revision),
      operation: randomUUID(),
    };
    const remove = {
      ...add,
      id: seeds[1].id,
      baseRevision: Number(seeds[1].revision),
      body: null,
      operation: randomUUID(),
    };
    const receipt = await send("changes", add);
    assert.equal(receipt.status, 200);
    probeFencedSource();
    for (const sourceFenced of [false, true]) {
      await withLocalWorker(
        url,
        48977,
        {
          MEDORA_PASSWORD_KEYS: JSON.stringify({ legacy: "a".repeat(64) }),
          MEDORA_LEGACY_WRITES_FENCED: String(sourceFenced),
        },
        async (gateway) => {
          const mode = await (
            await fetch(gateway + "/api/v2/product-writer")
          ).json();
          assert.equal(mode.writer, sourceFenced ? "postgres" : "frozen");
          const response = await fetch(gateway + "/api/v2/changes", {
            method: "POST",
            headers: { ...headers, Origin: gateway },
            body: JSON.stringify(add),
          });
          assert.equal(response.status, sourceFenced ? 200 : 503);
          if (sourceFenced) {
            assert.deepEqual(
              await response.json(),
              await receipt.clone().json(),
            );
            assert.equal(
              (
                await fetch(gateway + "/api/account/care", {
                  method: "PUT",
                  headers: { ...headers, Origin: gateway },
                  body: "{}",
                })
              ).status,
              503,
            );
          }
        },
      );
    }
    // A stale API sharing this database does not receive the new setting.
    const previous = new Client({ connectionString: url });
    await previous.connect();
    try {
      await assert.rejects(
        previous.query(
          "UPDATE medora.records SET revision=revision WHERE false",
        ),
        { code: "55000" },
      );
    } finally {
      await previous.end();
    }
    assert.deepEqual(
      await (await send("changes", add)).json(),
      await receipt.json(),
    );
    assert.equal((await send("changes", edit)).status, 200);
    assert.equal((await send("changes", remove)).status, 200);
    assert.equal(
      (await send("changes", { ...edit, operation: randomUUID() })).status,
      409,
    );
    const current = await (
      await fetch(origin + "/api/v2/care", { headers })
    ).json();
    assert.equal(current.revision, 10);
    const unchanged = await fetch(origin + "/api/v2/care", {
      headers: { ...headers, "If-None-Match": '"' + person.id + ':10"' },
    });
    assert.equal(unchanged.status, 304);
    const recovery = await importRecoveryKey(expected.recovery);
    const draft = await openPrivateCare(current.records, recovery);
    const routineId = randomUUID(),
      start = 1734062400000;
    draft.medicines.plan = {
      id: "plan",
      name: "Fixture",
      unit: "tablet",
      stock: 9000,
      threshold: 1000,
      phases: [
        {
          start: 20001,
          end: null,
          interval: 1,
          mask: 127,
          slots: [{ minute: 480, amount: 1000 }],
        },
      ],
    };
    draft.doses["plan|20001|480"] = {
      medicineId: "plan",
      day: 20001,
      minute: 480,
      status: "taken",
      planned: 1000,
      actual: 1000,
      debit: 1000,
    };
    draft.routines[routineId] = {
      id: routineId,
      name: "Fixture",
      category: "custom",
      mode: "steps",
      minute: null,
      start: 20001,
      interval: 1,
      mask: 127,
      steps: ["Step"],
    };
    draft.routineLogs["20001"] = {
      [routineId]: { ...draft.routines[routineId], checked: [0] },
    };
    draft.sleepRecords = {
      s: {
        start,
        end: start + 3600000,
        kind: "nap",
        quality: "good",
        zone: "UTC",
        note: "fixture sleep text",
      },
    };
    draft.visits.sample.note = "updated fixture text";
    draft.cycleRecords = {
      20001: { end: 20003, flow: "light", note: "fixture cycle text" },
    };
    draft.settings.theme = "dark";
    draft.water.push({
      id: "document-water",
      amount: 100,
      day: 20002,
      time: "11:22",
    });
    const sealed = await sealPrivateCare(draft, recovery);
    const changes = careDelta(current.records, sealed);
    assert.ok(changes.length);
    const commit = {
      operation: randomUUID(),
      baseRevision: 10,
      changes,
      zone: "UTC",
    };
    assert.equal(
      (
        await send("care", {
          ...commit,
          changes: [["sleepRecords", null, draft.sleepRecords]],
        })
      ).status,
      400,
    );
    const accepted = await send("care", commit);
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).revision, 11);
    assert.equal((await send("care", commit)).status, 200);
    assert.equal(
      (await send("care", { ...commit, operation: randomUUID() })).status,
      409,
    );
    assert.equal(
      (await send("care", { ...commit, zone: "Europe/Paris" })).status,
      409,
    );
    const latest = await (
      await fetch(origin + "/api/v2/care", { headers })
    ).json();
    assert.equal(latest.zone, "UTC");
    assert.equal(
      (await openPrivateCare(latest.records, recovery)).sleepRecords.s.note,
      draft.sleepRecords.s.note,
    );
    assert.ok(
      (
        await fetch(origin + "/api/v2/care", {
          headers: { ...headers, "X-Medora-Owner": expected.people[1].id },
        })
      ).status === 409,
    );
    person.records = sealed;
    person.revision = 11;
    await assert.rejects(
      reverseCare(client, archive, key, restored),
      /must be fenced/,
    );
    await verifyHouseholdWrites(origin, expected, headers);
    const second = expected.people[1];
    await verifyProductBrowser(
      origin,
      second.credential[0],
      "synthetic fixture password",
    );
    const {
      rows: [browserState],
    } = await client.query(
      "SELECT records,revision FROM medora.care_state WHERE owner=$1",
      [second.id],
    );
    assert.equal(browserState.records.water.length, 2);
    assert.equal(browserState.records.water[1].amount, 250);
    assert.equal(browserState.records.water[0].id, second.records.water[0].id);
    second.records = browserState.records;
    second.revision = Number(browserState.revision);
    // Exercise the real audit trigger on a value change. Roll back this negative
    // control and keep the successful recovery fixture identical to user traffic.
    await client.query("BEGIN");
    await client.query(
      "UPDATE medora.accounts SET password_proof=password_proof WHERE id=$1",
      [person.id],
    );
    await freezeWriter(client, snapshot);
    await assert.rejects(
      reverseCare(client, archive, key, restored),
      /different reverse projection/,
    );
    await client.query("ROLLBACK");
    const publication = await fetch(
      origin + "/api/v2/operations/release?version=" + "a".repeat(40),
    );
    assert.equal(publication.status, 200);
    assert.equal((await publication.json()).status, "paused");
    assert.equal(
      (
        await fetch(
          origin + "/api/v2/operations/release?version=" + "b".repeat(40),
        )
      ).status,
      404,
    );
    const admin = await verifyOperationalWrites(origin, headers, expected);
    await verifyCampaignWrites(origin, expected, headers);
    await verifyCampaignExport(origin, admin.actor, expected.postCampaign);
    await withLocalWorker(
      url,
      48977,
      {
        ADMIN_EMAIL: "fixture1@example.test",
        MEDORA_PASSWORD_KEYS: JSON.stringify({ legacy: "a".repeat(64) }),
        MEDORA_LEGACY_WRITES_FENCED: "true",
      },
      (gateway) =>
        verifyCampaignExport(gateway, admin.actor, expected.postCampaign),
    );
    await verifyReminderWrites(
      origin,
      expected,
      headers,
      person.revision,
      push,
      url,
      client,
    );
    // The release integration test exercises provider retry. This rehearsal
    // independently supplies its completed batch and receipt to the reverse journal.
    expected.postRelease = {
      version: "a".repeat(40),
      after: expected.postReminders.id,
      done: true,
    };
    await client.query("BEGIN");
    await client.query(
      "UPDATE medora.release_batches SET batch=$1 WHERE singleton",
      [JSON.stringify(expected.postRelease)],
    );
    await client.query(
      "UPDATE medora.reminder_devices SET values=jsonb_set(values,'{release-sent}',to_jsonb($2::text)) WHERE id=$1",
      [expected.postReminders.id, expected.postRelease.version],
    );
    await client.query("COMMIT");
    const password = randomBytes(24).toString("hex");
    assert.equal(
      (await send("identity/verify", { ...(await requestReset()), password }))
        .status,
      200,
    );
    assert.equal((await sessionWith(originalCookie)).status, 401);
    assert.equal((await sessionWith(headers.Cookie)).status, 401);
    assert.equal(
      (
        await send("session", {
          username: "fixture0",
          password: "synthetic fixture password",
        })
      ).status,
      401,
    );
    const newSession = await send("session", {
      username: "fixture0",
      password,
    });
    assert.equal(newSession.status, 200);
    headers.Cookie = newSession.headers.get("set-cookie").split(";")[0];
    const updatedList = await fetch(
      origin + "/api/v2/admin/accounts?q=fixture0",
      { headers: admin.actor },
    );
    const {
      users: [updatedUser],
    } = await updatedList.json();
    const revoke = (body) =>
      fetch(origin + "/api/v2/admin/accounts", {
        method: "PATCH",
        headers: admin.actor,
        body: JSON.stringify(body),
      });
    assert.equal((await revoke(admin.target)).status, 409);
    assert.equal(
      (await revoke({ ...admin.target, tag: updatedUser.tag })).status,
      200,
    );
    assert.equal((await sessionWith(headers.Cookie)).status, 401);
    const relogin = await send("session", { username: "fixture0", password });
    assert.equal(relogin.status, 200);
    headers.Cookie = relogin.headers.get("set-cookie").split(";")[0];
    expected.passwordReset = password;
    expected.registration = await verifyRegistration(origin, mailbox);
    const backup = await saveFixtureBackup(origin, headers, person.id);
    const erased = await verifyRegistration(origin, mailbox, "erase_fixture");
    const erasedBackup = await saveFixtureBackup(
      origin,
      erased.headers,
      erased.owner,
    );
    await eraseFixtureAccount(
      origin,
      admin.actor,
      erased,
      objects,
      erasedBackup,
    );
    expected.erased = { name: erased.username, owner: erased.owner };
    delete expected.registration.headers;
    // Hold the shared guard as an in-flight writer would. The freeze cannot finish early.
    const draining = new Client(fencedConnection);
    await draining.connect();
    let frozen;
    try {
      await draining.query("BEGIN");
      await draining.query(
        "UPDATE medora.login_attempts SET attempts=attempts WHERE false",
      );
      frozen = freezeWriter(client, snapshot);
      assert.equal(
        await Promise.race([frozen.then(() => true), delay(100, false)]),
        false,
      );
      await draining.query("COMMIT");
      await frozen;
    } finally {
      await draining.end();
    }
    assert.equal(
      (
        await send("changes", {
          ...add,
          id: randomUUID(),
          operation: randomUUID(),
        })
      ).status,
      503,
    );
    await assert.rejects(
      client.query("DELETE FROM medora.backups WHERE false"),
      { code: "55000" },
    );
    await assert.rejects(
      reverseCare(client, archive, key, restored),
      /authorized backup object source/,
    );
    await assert.rejects(lstat(restored), { code: "ENOENT" });
    const keyName = "/medora-test/backups/" + person.id + "/" + backup;
    const savedBytes = objects.objects.get(keyName);
    const corrupt = Buffer.from(savedBytes);
    corrupt[corrupt.length - 1] ^= 1;
    objects.objects.set(keyName, corrupt);
    try {
      await assert.rejects(
        reverseCare(client, archive, key, restored + "-corrupt", storage),
        /Backup object digest mismatch/,
      );
      await assert.rejects(lstat(join(restored + "-corrupt", "do")), {
        code: "ENOENT",
      });
    } finally {
      objects.objects.set(keyName, savedBytes);
    }
    // Stop a separate recovery process after SQLite images exist in its private
    // workspace. A restart in the very same destination must produce one tree.
    const interrupted = restored + "-retry";
    const copying = spawn(
      process.execPath,
      [
        "scripts/migration/objects.mjs",
        "restore-after-writes",
        archive,
        interrupted,
      ],
      {
        stdio: "ignore",
        env: {
          PATH: process.env.PATH,
          DATABASE_URL: url,
          MEDORA_ARCHIVE_KEY_FILE: keyFile,
          ...objects.bindings,
        },
      },
    );
    const stopped = once(copying, "exit");
    try {
      let copied = false;
      for (let i = 0; i < 1500 && !copied; i++) {
        if (copying.exitCode !== null)
          throw Error("Recovery exited before interruption check");
        const work = (await readdir(interrupted).catch(() => [])).find(
          (name) =>
            name.startsWith(".recovery-") && name !== ".recovery-source",
        );
        if (work)
          copied = (
            await readdir(join(interrupted, work, "do"), {
              recursive: true,
            }).catch(() => [])
          ).some((f) => f.endsWith(".sqlite"));
        if (!copied) await delay(2);
      }
      assert.ok(copied);
    } finally {
      copying.kill("SIGKILL");
      await stopped;
    }
    await assert.rejects(lstat(join(interrupted, "do")), { code: "ENOENT" });
    const result = await reverseCare(client, archive, key, restored, storage);
    assert.deepEqual(result, {
      owners: 3,
      replayed: person.revision + second.revision - 14 + 1,
      reminderDevices: 2,
      backupObjects: 1,
      deletedAccounts: 1,
    });
    await assert.rejects(reverseCare(client, archive, key, restored, storage), {
      code: "EEXIST",
    });
    assert.deepEqual(
      await reverseCare(client, archive, key, restored + "-retry", storage),
      result,
    );
    const transfer = await readFile(
      join(restored, "do", ".medora-journal-backups", person.id + "_" + backup),
    );
    assert.equal(transfer.length, 192);
    await verifyRecoveredCatalog(
      client,
      url,
      join(restored, "do"),
      key,
      person.id,
      backup,
    );
    return result;
  } finally {
    api.kill("SIGTERM");
    await closed;
    await client.end();
    await mailbox?.close();
    await objects.close();
  }
}
