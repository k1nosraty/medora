import { expect, it } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { identityService, type Mail } from "../../apps/api/src/identity";
import { repository } from "../../apps/api/src/repository";
import { verifier } from "../../apps/api/src/password";
import { createApp } from "../../apps/api/src/app";

it.skipIf(!process.env.MEDORA_TEST_DATABASE_URL)(
  "verifies registration, retries mail delivery, resets a password and revokes existing sessions",
  async () => {
    const pool = new Pool({
      connectionString: process.env.MEDORA_TEST_DATABASE_URL,
    });
    const settings = {
      passwordKey: "1".repeat(64),
      passwordKeyId: "local",
      codeKey: "2".repeat(64),
      mailKey: "3".repeat(64),
    };
    const delivered = new Map<string, Mail>();
    const store = repository(pool);
    let offline = true;
    const service = identityService(pool, store, settings, async (m, id) => {
      if (offline) throw Error("mail_offline");
      delivered.set(id, m);
    });
    const app = createApp(
      store,
      verifier({ local: settings.passwordKey }),
      undefined,
      undefined,
      service,
    );
    const origin = "https://local.test";
    const send = (path: string, data: unknown) =>
      app.request(origin + "/api/v2/" + path, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    const username = randomUUID().replaceAll("-", ""),
      email = username + "@example.test",
      password = "synthetic registration password";
    try {
      const id = (
        await (
          await send("identity/challenges", { email, purpose: "register" })
        ).json()
      ).challenge;
      expect(
        (
          await send("identity/verify", {
            challenge: id,
            code: "00000",
            username,
            password,
          })
        ).status,
      ).toBe(400);
      await expect(service.drain()).rejects.toThrow("mail_offline");
      offline = false;
      await pool.query(
        "UPDATE medora.mail_outbox SET available_at=now() WHERE challenge=$1",
        [id],
      );
      await service.drain();
      const code = delivered.get(id)!.code;
      expect(
        (
          await send("identity/verify", {
            challenge: id,
            code,
            username,
            password,
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await send("identity/verify", {
            challenge: id,
            code,
            username,
            password,
          })
        ).status,
      ).toBe(400);
      const signIn = await send("session", { username, password });
      expect(signIn.status).toBe(200);
      const cookie = signIn.headers.get("Set-Cookie")!.split(";")[0]!;
      const reset = (
        await (
          await send("identity/challenges", { email, purpose: "reset" })
        ).json()
      ).challenge;
      await service.drain();
      expect(
        (
          await send("identity/verify", {
            challenge: reset,
            code: delivered.get(reset)!.code,
            password: "new synthetic reset password",
          })
        ).status,
      ).toBe(200);
      expect(
        (await app.request(origin + "/api/v2/session", { headers: { cookie } }))
          .status,
      ).toBe(401);
      expect((await send("session", { username, password })).status).toBe(401);
    } finally {
      await pool.end();
    }
  },
);
