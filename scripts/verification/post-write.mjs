import { fixtureMailbox } from "./mailbox.mjs";
import { readdir, lstat } from "node:fs/promises";
import { join } from "node:path";
import { verifyHouseholdWrites } from "./household-post-write.mjs";
import { verifyProductBrowser } from "./product-browser.mjs";
import { careDelta } from "../../web/public/medication/domain/care-delta.js";
import {
  importRecoveryKey,
  openPrivateCare,
  sealPrivateCare,
} from "../../web/public/medication/features/sync/private-care.js";
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
}) {
  const client = new Client({ connectionString: url });
  await client.connect();
  const socket = createServer().listen(0, "127.0.0.1");
  await once(socket, "listening");
  const { port } = socket.address();
  await new Promise((resolve) => socket.close(resolve));
  const origin = "http://127.0.0.1:" + port;
  const mailbox = unmapped ? await fixtureMailbox() : undefined;
  const api = spawn(process.execPath, ["apps/api/dist/server.mjs"], {
    stdio: "ignore",
    env: {
      PATH: process.env.PATH,
      DATABASE_URL: url,
      HOST: "127.0.0.1",
      ...(mailbox && {
        MEDORA_MAILPIT: mailbox.origin,
        MEDORA_CODE_KEY: randomBytes(32).toString("hex"),
        MEDORA_MAIL_KEY: randomBytes(32).toString("hex"),
        MEDORA_FROM: "fixture@example.test",
      }),
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
    if (mailbox) {
      // A real reset commits a new proof, invalidates sessions and consumes the
      // challenge. The persisted exception must prevent restoring the old proof.
      const email = person.credential[2];
      const challenge = await send("identity/challenges", {
        email,
        purpose: "reset",
      });
      assert.equal(challenge.status, 202);
      const id = (await challenge.json()).challenge;
      const until = Date.now() + 20000;
      while (!mailbox.codes.has(email) && Date.now() < until) await delay(100);
      const code = mailbox.codes.get(email);
      assert.ok(code);
      const reset = await send("identity/verify", {
        challenge: id,
        code,
        password: randomBytes(24).toString("hex"),
      });
      assert.equal(reset.status, 200);
      assert.equal(
        (await fetch(origin + "/api/v2/session", { headers })).status,
        401,
      );
      await freezeWriter(client, snapshot);
      const inspector = new Client({ connectionString: url });
      await inspector.connect();
      try {
        const { rows } = await inspector.query(
          "SELECT relation_name FROM medora.rollback_exceptions ORDER BY relation_name",
        );
        assert.deepEqual(
          rows.map((row) => row.relation_name),
          ["accounts", "challenges", "mail_outbox"],
        );
        await assert.rejects(
          reverseCare(inspector, archive, key, restored),
          /different reverse projection/,
        );
        await assert.rejects(lstat(restored), { code: "ENOENT" });
      } finally {
        await inspector.end();
      }
      return {
        passwordResetCommitted: true,
        sessionRevoked: true,
        recoveryPublicationBlocked: true,
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
    // Hold the shared guard as an in-flight writer would. The freeze cannot finish early.
    const draining = new Client({ connectionString: url });
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
    const result = await reverseCare(client, archive, key, restored);
    assert.deepEqual(result, {
      owners: 2,
      replayed: person.revision + second.revision - 14,
    });
    await assert.rejects(reverseCare(client, archive, key, restored), {
      code: "EEXIST",
    });
    assert.deepEqual(
      await reverseCare(client, archive, key, restored + "-retry"),
      result,
    );
    return result;
  } finally {
    api.kill("SIGTERM");
    await closed;
    await client.end();
    await mailbox?.close();
  }
}
