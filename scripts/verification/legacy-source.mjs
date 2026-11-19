import {
  generateRecoveryKey,
  importRecoveryKey,
  sealPrivateCare,
} from "../../apps/web/product-assets/public/medication/features/sync/private-care.js";
// Generates a stopped, synthetic local Workerd copy and an independent inventory.
import assert from "node:assert/strict";
import { sessionHash } from "../../web/src/accounts/auth-crypto.mjs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { passwordProof } from "../../web/src/accounts/auth-crypto.mjs";
const require = createRequire(
  new URL("../../web/package.json", import.meta.url),
);
const { build } = require("esbuild"),
  { Miniflare, convertV4MiniflareOptions } = require("miniflare");
const output = process.argv[2];
if (!output) throw new Error("Supply a fresh private fixture directory");
const verification = process.argv[3];
const fenced = process.argv[4] === "fenced";
if (!verification) await mkdir(output, { mode: 0o700 });
const root = fileURLToPath(new URL("../../web/", import.meta.url));
const classes = [
  "EmailAccount",
  "Credentials",
  "MedicationReminders",
  "Operations",
  "Families",
  "Promotions",
  "PushPilot",
];
const methods = `async fixture(values,tables){
  for(const [k,v] of Object.entries(values))await this.ctx.storage.put(k,v);
  for(const [statement,parameters] of tables)this.ctx.storage.sql.exec(statement,...parameters);
}
async fixtureAlarm(){await this.alarm(); return this.ctx.storage.getAlarm();}
async fixtureRead(key,query){return {value:key?await this.ctx.storage.get(key):null,rows:query?this.ctx.storage.sql.exec(query).toArray():[]};}
`;
const { outputFiles } = await build({
  stdin: {
    resolveDir: root,
    contents:
      'import * as base from "./src/worker.mjs";\n' +
      classes
        .map(
          (c) =>
            "export class " + c + " extends base." + c + " {" + methods + "}",
        )
        .join("\n") +
      `
export default {...base.default, async fetch(request,env,ctx) {
        if (new URL(request.url).pathname !== "/fixture-fence") return base.default.fetch(request,env,ctx);
        const [kind,name,method] = await request.json();
        const args=Array.isArray(method) ? method.slice(1) : [];
        const operation=Array.isArray(method) ? method[0] : method;
        try { await env[kind].getByName(name)[operation](...args); return Response.json({blocked:false}); }
        catch(error) { return Response.json({blocked:error.message.includes("legacy_writer_fenced")}); }
      }};`,
  },
  bundle: true,
  platform: "browser",
  format: "esm",
  external: ["cloudflare:workers", "node:crypto", "node:buffer"],
  write: false,
});
const mf = new Miniflare(
  convertV4MiniflareOptions({
    name: "fixture",
    cf: false,
    modules: true,
    script: outputFiles[0].text,
    compatibilityDate: "2026-10-29",
    compatibilityFlags: ["nodejs_compat"],
    resourcePersistencePath: resolve(output),
    durableObjects: {
      ...Object.fromEntries(
        classes.map((c) => [c, { className: c, useSQLite: true }]),
      ),
      CREDENTIALS: {
        className: "Credentials",
        useSQLite: true,
        unsafeUniqueKey: "fixture-Credentials",
      },
    },
    bindings: {
      MEDORA_LEGACY_WRITES_FENCED: String(fenced),
      EMAIL_AUTH_SECRET: "a".repeat(64),
      MEDORA_PAUSE_PUSH: "true",
    },
    outboundService: () => {
      throw Error("Fixture network disabled");
    },
  }),
);
const expected = {
  people: [],
  group: "",
  device: "",
  recovery: generateRecoveryKey(),
};
const census = {},
  identity = {};
async function seed(c, name, values, sql = []) {
  const ns = await mf.getDurableObjectNamespace(c);
  const id = ns.idFromName(name);
  const list = (census["fixture-" + c] ??= ["metadata.sqlite"]);
  list.push(id.toString() + ".sqlite");
  (identity["fixture-" + c] ??= {})[id.toString() + ".sqlite"] = name;
  await ns.get(id).fixture(values, sql);
}
if (verification) {
  try {
    const e = JSON.parse(await readFile(verification, "utf8"));
    if (fenced) {
      for (const [path, method] of [
        ["account/care", "PUT"],
        ["family", "POST"],
        ["migration/restore", "POST"],
        ["migration/parts/restore", "POST"],
        ["auth/session", "GET"],
        ["operations/release", "GET"],
        ["reminders", "PUT"],
      ]) {
        const result = await mf.dispatchFetch(
          "http://fixture.test/api/" + path,
          { method },
        );
        assert.equal(result.status, 503);
        assert.equal((await result.json()).error, "legacy_writer_fenced");
      }
      const worker = await mf.getWorker();
      await worker.scheduled({
        scheduledTime: Date.now(),
        cron: "*/5 * * * *",
      });
      for (const [kind, name, rpc] of [
        [
          "EmailAccount",
          e.people[0].id,
          [
            "saveCareSnapshot",
            7,
            e.people[0].records,
            "",
            e.people[0].token,
            null,
            e.people[0].id,
          ],
        ],
        ["Credentials", "medora-credentials-v1", "restoreAccount"],
        ["Families", "care-groups", "pruneAudit"],
        ["MedicationReminders", e.device, "replaceAccountPlan"],
        ["Operations", "operations", "publishRelease"],
        ["Promotions", "home", "campaigns"],
        ["PushPilot", "medora-push-pilot", "start"],
      ]) {
        const ns = await mf.getDurableObjectNamespace(kind),
          stub = ns.get(ns.idFromName(name));
        const check = await mf.dispatchFetch(
          "http://fixture.test/fixture-fence",
          { method: "POST", body: JSON.stringify([kind, name, rpc]) },
        );
        assert.equal(
          (await check.json()).blocked,
          true,
          "Fence failed for " + kind,
        );
        if (
          [
            "EmailAccount",
            "MedicationReminders",
            "Operations",
            "PushPilot",
          ].includes(kind)
        )
          assert.ok((await stub.fixtureAlarm()) > Date.now());
      }
    }
    const read = async (c, name, key, statement) => {
      const ns = await mf.getDurableObjectNamespace(c);
      return ns.get(ns.idFromName(name)).fixtureRead(key, statement);
    };
    const { isDeepStrictEqual } = await import("node:util");
    const same = (left, right) => {
      if (!isDeepStrictEqual(left, right))
        throw Error("Restored runtime value mismatch");
    };
    const creds = await read(
      "Credentials",
      "medora-credentials-v1",
      null,
      "SELECT email_id FROM credentials_v1 ORDER BY username",
    );
    same(
      creds.rows.map((r) => r.email_id),
      [
        ...e.people.map((p) => p.id),
        ...(e.registration ? [e.registration.owner] : []),
      ],
    );
    if (e.erased)
      assert.ok(!creds.rows.some((row) => row.email_id === e.erased.owner));
    if (e.erased?.archived) {
      const care = await read(
        "EmailAccount",
        e.erased.owner,
        "care-sync",
        null,
      );
      assert.equal(care.value, undefined);
      const key = await read(
        "EmailAccount",
        e.erased.owner,
        "future-extension",
        null,
      );
      assert.equal(key.value, undefined);
    }
    if (e.registration) {
      const { owner, username, password, water } = e.registration;
      const ns = await mf.getDurableObjectNamespace("EmailAccount"),
        account = ns.getByName(owner);
      const { token } = await account.login(
        username,
        owner,
        password,
        "fixture",
      );
      assert.ok(token);
      const saved = await account.readCareForSession(token, owner);
      assert.equal(saved.revision, 1);
      same(saved.records.water, [water]);
    }
    for (const person of e.people) {
      const care = await read(
        "EmailAccount",
        person.id,
        "care-sync",
        "SELECT hash FROM sessions",
      );
      same(care.value, {
        revision: person.revision ?? 7,
        records: person.records,
      });
      const reset = e.passwordReset && person === e.people[0];
      let token = person.token;
      if (reset) {
        assert.equal(care.rows.length, 0);
        const ns = await mf.getDurableObjectNamespace("EmailAccount"),
          stub = ns.getByName(person.id);
        assert.equal(await stub.session(token), null);
        assert.equal(
          (
            await stub.login(
              person.credential[0],
              person.id,
              "synthetic fixture password",
              "fixture",
            )
          ).error,
          "credentials",
        );
        token = (
          await stub.login(
            person.credential[0],
            person.id,
            e.passwordReset,
            "fixture",
          )
        ).token;
        assert.ok(token);
      } else same(care.rows[0].hash, person.digest);
      if (person.revision && !fenced) {
        const ns = await mf.getDurableObjectNamespace("EmailAccount"),
          stub = ns.get(ns.idFromName(person.id));
        const { care: current } = await stub.exportCare();
        assert.equal(current.revision, person.revision);
        // A queued legacy snapshot with the pre-switch revision must lose the CAS.
        assert.equal(
          await stub.saveCareSnapshot(
            7,
            person.records,
            "",
            token,
            null,
            person.id,
          ),
          null,
        );
        const readback = await stub.readCareForSession(token, person.id);
        same(readback.records, person.records);
        const pending = await read(
          "EmailAccount",
          person.id,
          "reminder-update",
          null,
        );
        assert.equal(pending.value.owner, person.id);
        const accepted = await stub.saveCareSnapshot(
          person.revision,
          person.records,
          "",
          token,
          null,
          person.id,
        );
        assert.equal(accepted.revision, person.revision + 1);
      }
      const extra = await read(
        "EmailAccount",
        person.id,
        "future-extension",
        null,
      );
      same(Array.from(extra.value.bytes), [0, 255]);
    }
    if (e.postFamily) {
      const { rows: grants } = await read(
        "Families",
        "care-groups",
        null,
        "SELECT * FROM family_grants",
      );
      assert.equal(grants.length, 0);
      const { rows: invites } = await read(
        "Families",
        "care-groups",
        null,
        "SELECT id FROM family_invites WHERE status='pending'",
      );
      same(
        invites.map((r) => r.id),
        [e.postFamily.pending],
      );
      const { rows: operations } = await read(
        "EmailAccount",
        e.people[0].id,
        null,
        "SELECT operation FROM family_operations",
      );
      assert.ok(operations.some((row) => row.operation === e.postFamily.key));
      const { rows: audits } = await read(
        "Families",
        "care-groups",
        null,
        "SELECT action FROM family_audit",
      );
      assert.equal(
        audits.filter((row) => row.action === "record:water").length,
        1,
      );
    }
    const { rows: groups } = await read(
      "Families",
      "care-groups",
      null,
      "SELECT id FROM family_groups",
    );
    same(
      groups.map((row) => row.id),
      e.erased?.archived ? [] : [e.group],
    );
    same(
      (await read("MedicationReminders", e.device, "state", null)).value
        .revision,
      e.postReminders ? 3 : 2,
    );
    if (e.postReminders) {
      const { id, revision } = e.postReminders;
      const reminder = await read("MedicationReminders", id, "state", null);
      assert.equal(reminder.value.revision, revision);
      assert.equal(reminder.value.link.owner, e.people[0].id);
      const revoked = await read(
        "MedicationReminders",
        e.device,
        "state",
        null,
      );
      assert.equal(revoked.value.revoked, true);
      assert.ok(
        (await read("Operations", "operations", "reminder:" + id, null)).value,
      );
      assert.ok(
        (
          await read("EmailAccount", e.people[0].id, "reminder-devices", null)
        ).value.includes(id),
      );
    }
    same(
      (await read("Operations", "operations", "reminder:" + e.device, null))
        .value,
      true,
    );
    if (e.postRelease) {
      same(
        (await read("Operations", "operations", "release-batch", null)).value,
        e.postRelease,
      );
      same(
        (
          await read(
            "MedicationReminders",
            e.postReminders.id,
            "release-sent",
            null,
          )
        ).value,
        e.postRelease.version,
      );
    }
    if (e.postTicket) {
      const { rows: tickets } = await read(
        "Operations",
        "operations",
        null,
        "SELECT id,reply,status FROM tickets",
      );
      const ticket = tickets.find((row) => row.id === e.postTicket.id);
      assert.equal(ticket.reply, e.postTicket.reply);
      assert.equal(ticket.status, "closed");
      const { rows: audit } = await read(
        "Operations",
        "operations",
        null,
        "SELECT action FROM audit WHERE action='ticket_updated'",
      );
      assert.ok(audit.length);
      const notice = await read("Operations", "operations", "config", null);
      assert.equal(notice.value.notice.title, "Fixture notice");
      assert.ok(
        (
          await read(
            "Operations",
            "operations",
            null,
            "SELECT action FROM audit WHERE action='sessions_revoked'",
          )
        ).rows.length,
      );
    }
    if (e.postCampaign) {
      const ns = await mf.getDurableObjectNamespace("Promotions"),
        store = ns.getByName("home");
      const { current } = await store.current();
      const campaign = e.postCampaign;
      assert.equal(current.id, campaign.id);
      assert.equal(current.creativeId, campaign.creativeId);
      const asset = await store.mediaMeta(campaign.mediaId);
      const bytes = await store.mediaBytes(campaign.mediaId, 0, asset.size - 1);
      assert.equal(
        createHash("sha256").update(bytes).digest("hex"),
        campaign.hash,
      );
      assert.equal(
        (await store.dashboard(campaign.id)).promotion.stats.impression,
        1,
      );
      assert.equal((await store.preview()).mediaId, campaign.mediaId);
    } else
      same((await read("Promotions", "home", "campaigns", null)).value, []);

    same((await read("PushPilot", "medora-push-pilot", "pilot", null)).value, {
      recent: [],
    });
    console.log(
      "Restarted seven legacy classes against restored physical databases.",
    );
  } finally {
    await mf.dispose();
  }
  process.exit(0);
}
try {
  const people = [
      randomBytes(32).toString("hex"),
      randomBytes(32).toString("hex"),
    ],
    group = randomUUID(),
    device = randomBytes(16).toString("hex");
  const credentials = [],
    families = [
      [
        "INSERT INTO family_groups(id,name,owner,icon) VALUES(?,?,?,?)",
        [group, "Synthetic household", people[0], "group"],
      ],
    ];
  for (const [i, person] of people.entries()) {
    const salt = randomBytes(16).toString("hex"),
      email = "fixture" + i + "@example.test";
    credentials.push([
      "INSERT INTO credentials_v1(username,email_id,email,salt,proof,created_at,password_key) VALUES(?,?,?,?,?,?,?)",
      [
        "fixture" + i,
        person,
        email,
        salt,
        await passwordProof("a".repeat(64), "synthetic fixture password", salt),
        1700000000011,
        "legacy",
      ],
    ]);
    families.push([
      "INSERT INTO family_members VALUES(?,?,?,?)",
      [randomUUID(), group, person, "Member " + i],
    ]);
    const water = Array.from({ length: i ? 1 : 1600 }, (_, n) => ({
      id: "w-" + n,
      day: 20000 + (n % 32),
      time: "08:30",
      amount: 250,
    }));
    const token = randomBytes(32).toString("hex");
    const digest = await sessionHash(token);
    if (!i) water[0].futureField = "preserve";
    const records = {
      medicines: {},
      doses: {},
      visits: {},
      routines: {},
      routineLogs: {},
      water,
      settings: { waterGoal: 2500 },
    };
    if (!i) {
      records.visits.sample = {
        id: "sample",
        name: "Fixture",
        day: 20001,
        time: "09:30",
        note: "synthetic private note",
      };
      records.cycleDays = {
        20002: { flow: "light", symptoms: {}, note: "synthetic cycle note" },
      };
    }
    const snapshot = i
      ? records
      : await sealPrivateCare(
          records,
          await importRecoveryKey(expected.recovery),
        );
    expected.people.push({
      id: person,
      records: snapshot,
      digest,
      token,
      credential: credentials.at(-1)[1],
      member: families.at(-1)[1],
    });
    expected.group = group;
    expected.device = device;
    await seed(
      "EmailAccount",
      person,
      {
        "care-sync": { revision: 7, records: snapshot },
        "care-zone": "Asia/Tehran",
        "reminder-devices": [device],
        "future-extension": { bytes: new Uint8Array([0, 255]) },
      },
      [
        [
          "INSERT INTO sessions(hash,email,expires) VALUES(?,?,?)",
          [digest, email, 1900000000000],
        ],
        [
          "INSERT INTO family_operations VALUES(?,?)",
          [randomUUID(), 1900000000000],
        ],
      ],
    );
  }
  families.push([
    "INSERT INTO family_grants VALUES(?,?,?,?,?)",
    [
      group,
      people[0],
      people[1],
      JSON.stringify({ sections: ["water"], record: false, add: false }),
      1900000000000,
    ],
  ]);
  await seed("Credentials", "medora-credentials-v1", {}, credentials);
  await seed("Families", "care-groups", {}, families);
  await seed("MedicationReminders", device, {
    state: { revision: 2, enabled: false },
  });
  await seed(
    "Operations",
    "operations",
    { ["reminder:" + device]: true, config: { notice: null } },
    [["INSERT INTO counters VALUES(?,?,?)", [20000, "synthetic", 10]]],
  );
  await seed("Promotions", "home", { campaigns: [], assets: [] });
  await seed("PushPilot", "medora-push-pilot", { pilot: { recent: [] } });
} finally {
  await mf.dispose();
}
await writeFile(join(output, "expectations.json"), JSON.stringify(expected), {
  mode: 0o600,
  flag: "wx",
});
await writeFile(join(output, "census.json"), JSON.stringify(census), {
  mode: 0o600,
  flag: "wx",
});
await writeFile(join(output, "identity.json"), JSON.stringify(identity), {
  mode: 0o600,
  flag: "wx",
});
console.log(
  "Stopped synthetic Worker. Wrote the independent census for",
  classes.length,
  "namespaces.",
);
