import { fixtureDatabase } from "../../scripts/verification/fixture-database.mjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { repository } from "../../apps/api/src/repository";
import { createApp } from "../../apps/api/src/app";
import { digest, token } from "../../apps/api/src/auth";
import { operationService } from "../../apps/api/src/operations";
import { administrativeExport } from "../../apps/api/src/admin-export";
const url = fixtureDatabase(process.env.MEDORA_TEST_DATABASE_URL);
describe.skipIf(!url)("session and encrypted archive boundaries", () => {
  const pool = new Pool({ connectionString: url }),
    repo = repository(pool),
    bytes = new Map<string, Uint8Array<ArrayBuffer>>(),
    domain = "https://medora.test";
  const app = createApp(repo, async () => false, {
    storage: {
      put: async (k, b) => {
        bytes.set(k, b);
      },
      get: async (k) => bytes.get(k)?.buffer ?? null,
      delete: async (k) => {
        bytes.delete(k);
      },
    },
  });
  const owners = [crypto.randomUUID(), crypto.randomUUID()],
    tokens = [token(), token()];
  const req = (
    path: string,
    method: string,
    who: number,
    expectedOwner = owners[who],
    body?: Uint8Array<ArrayBuffer>,
  ) =>
    app.request(domain + "/api/v2/" + path, {
      method,
      headers: {
        Cookie: "__Host-medora_v2=" + tokens[who],
        Origin: domain,
        "X-Medora-Owner": expectedOwner!,
        "Content-Type": "application/octet-stream",
      },
      ...(body && { body }),
    });
  beforeAll(async () => {
    for (const [i, id] of owners.entries()) {
      await pool.query(
        "INSERT INTO medora.accounts(id,email,username,password_key,password_salt,password_proof,sync_generation) VALUES($1,$2,$1,'fixture','fixture','fixture',2)",
        [id, id + "@example.test"],
      );
      await repo.createSession(
        id,
        await digest(tokens[i]!),
        Date.now() + 60000,
        "fixture",
      );
    }
  });
  afterAll(() => pool.end());
  it("keeps account backup catalogs and content private and refuses uncommitted objects", async () => {
    const data = crypto.getRandomValues(new Uint8Array(80));
    data.set([77, 69, 68, 79, 82, 65, 87, 1]);
    expect((await req("backups", "POST", 0, owners[1], data)).status).toBe(409);
    const saved = await req("backups", "POST", 0, owners[0], data);
    expect(saved.status).toBe(200);
    const { id } = await saved.json();
    expect((await req("backups/" + id, "GET", 1)).status).toBe(404);
    expect(await (await req("backups", "GET", 1)).json()).toEqual({
      backups: [],
    });
    expect(
      (await req("backups/" + id, "GET", 0)).headers.get("Cache-Control"),
    ).toBe("private, no-store");
    const key = [...bytes.keys()][0]!;
    const content = bytes.get(key)!;
    content[18] = content[18]! ^ 1;
    const corrupted = await req("backups/" + id, "GET", 0);
    expect(corrupted.status).toBe(503);
    expect(await corrupted.json()).toEqual({ error: "unavailable" });
  });
  it("enforces the persisted family write budget for the authenticated account", async () => {
    await pool.query(
      "INSERT INTO medora.login_attempts VALUES ($1,100,now()+interval '15 minutes')",
      ["write:/api/v2/families:" + owners[1]],
    );
    const limited = await req("families", "POST", 1);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("900");
  });
  it("authorizes administrative export metadata without starting or logging an export", async () => {
    const admin = owners[0] + "@example.test";
    const operations = operationService(pool, repo, { ADMIN_EMAIL: admin });
    const exportApp = createApp(repo, async () => false, {
      operations,
      exportOperations: administrativeExport(pool, operations),
    });
    const url = domain + "/api/v2/admin/operations/export";
    const read = (method: "HEAD" | "GET", who: number) =>
      exportApp.request(url, {
        method,
        headers: { Cookie: "__Host-medora_v2=" + tokens[who] },
      });
    const audit = async () => {
      const result = await pool.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM medora.operations_audit WHERE actor=$1 AND action='operations_exported'",
        [admin],
      );
      return result.rows[0]!.count;
    };
    expect((await read("HEAD", 1)).status).toBe(403);
    const head = await read("HEAD", 0);
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();
    expect(head.headers.get("Content-Type")).toBe("application/x-ndjson");
    expect(head.headers.get("Cache-Control")).toContain("no-store");
    expect(await audit()).toBe(0);

    const download = await read("GET", 0);
    expect(download.headers.get("Content-Disposition")).toBe(
      head.headers.get("Content-Disposition"),
    );
    expect(await download.text()).toContain('"type":"end"');
    expect(await audit()).toBe(1);
  });
});
