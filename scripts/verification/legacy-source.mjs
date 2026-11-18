// Generates a stopped, synthetic local Workerd copy and an independent inventory.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { passwordProof } from "../../web/src/accounts/auth-crypto.mjs";
const require = createRequire(
  new URL("../../web/package.json", import.meta.url),
);
const { build } = require("esbuild"),
  { Miniflare, convertV4MiniflareOptions } = require("miniflare");
const output = process.argv[2];
if (!output) throw new Error("Supply a fresh private fixture directory");
await mkdir(output, { mode: 0o700 });
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
}`;
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
      "\nexport default { fetch(){return new Response(null,{status:404});} };",
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
    durableObjects: Object.fromEntries(
      classes.map((c) => [c, { className: c, useSQLite: true }]),
    ),
    outboundService: () => {
      throw Error("Fixture network disabled");
    },
  }),
);
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
    await seed(
      "EmailAccount",
      person,
      {
        "care-sync": {
          revision: 7,
          records: {
            medicines: {},
            doses: {},
            visits: {},
            routines: {},
            routineLogs: {},
            water,
            settings: { waterGoal: 2500 },
          },
        },
        "care-zone": "Asia/Tehran",
        "reminder-devices": [device],
        "future-extension": { bytes: new Uint8Array([0, 255]) },
      },
      [
        [
          "INSERT INTO sessions(hash,email,expires) VALUES(?,?,?)",
          [randomBytes(32).toString("hex"), email, 1900000000000],
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
