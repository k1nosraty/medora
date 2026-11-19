import { initializeEmailAccount } from "../../apps/compat-worker/src/accounts/schema.mjs";
export { HouseholdRecovery } from "./reverse-family-object.mjs";
import { DurableObject } from "cloudflare:workers";
import { applyCareDelta } from "../../packages/domain/src/browser/care-delta.js";
import { equalCareValues } from "../../packages/domain/src/browser/care-contract.js";
import {
  validateCareRecords,
  careSnapshotFits,
} from "../../packages/domain/src/browser/care-records.js";

export class CredentialRecovery extends DurableObject {
  replay(entries, deleted) {
    this.ctx.storage.transactionSync(() => {
      const sql = this.ctx.storage.sql;
      for (const { id, archived } of deleted) {
        const match = sql
          .exec("SELECT 1 FROM credentials_v1 WHERE email_id=?", id)
          .toArray();
        if (Boolean(match.length) !== archived)
          throw Error("Deleted credential baseline mismatch");
        if (archived)
          sql.exec("DELETE FROM credentials_v1 WHERE email_id=?", id);
      }
      const originals = sql
        .exec("SELECT * FROM credentials_v1 ORDER BY username")
        .toArray();
      if (
        originals.length !==
        entries.filter((e) => !e.account.registration).length
      )
        throw Error("Credential census mismatch");
      const originalsById = new Map(
        originals.map((row) => [row.email_id, row]),
      );
      entries.forEach(({ account, history }) => {
        if (account.registration) {
          if (
            originalsById.has(account.id) ||
            !equalCareValues(
              account.registration,
              history[0]?.previous ?? account.proof,
            ) ||
            (history.length &&
              !equalCareValues(history.at(-1).following, account.proof))
          )
            throw Error("New credential history diverged");
          sql.exec(
            "INSERT INTO credentials_v1(username,email_id,email,salt,proof,created_at,password_key) VALUES(?,?,?,?,?,?,?)",
            account.username,
            account.id,
            account.email,
            account.proof[0],
            account.proof[1],
            Number(account.created_at),
            account.proof[2],
          );
          return;
        }
        const row = originalsById.get(account.id);
        const before = [row.salt, row.proof, row.password_key ?? "legacy"];
        if (
          !row ||
          row.email !== account.email ||
          row.username !== account.username ||
          (row.created_at === null
            ? account.created_at !== null
            : row.created_at !== Number(account.created_at)) ||
          !equalCareValues(before, history[0]?.previous ?? account.proof) ||
          (history.length &&
            !equalCareValues(history.at(-1).following, account.proof))
        )
          throw Error("Credential recovery mismatch");
        if (history.length)
          sql.exec(
            "UPDATE credentials_v1 SET salt=?,proof=?,password_key=? WHERE email_id=?",
            ...account.proof,
            account.id,
          );
      });
    });
  }
}

export class ReminderRecovery extends DurableObject {
  async replay(before, after) {
    await this.ctx.storage.transaction(async (storage) => {
      for (const key of ["state", "lastTest", "release-sent", "release-send"]) {
        if (
          !equalCareValues(
            { value: await storage.get(key) },
            { value: before?.values[key] },
          )
        )
          throw Error("Reminder state differs from the archived baseline");
        if (Object.hasOwn(after.values, key))
          await storage.put(key, after.values[key]);
        else await storage.delete(key);
      }
      if (after.wake === null) await storage.deleteAlarm();
      else await storage.setAlarm(after.wake);
    });
  }
  async alarm() {
    // The original worker resumes delivery after the verified tree is opened.
    await this.ctx.storage.setAlarm(Date.now() + 60_000);
  }
}
function decodePromotion(row) {
  if (!row) return undefined;
  if (row.bytes === null) return row.value;
  return Uint8Array.from(row.bytes.slice(2).match(/.{2}/g) ?? [], (byte) =>
    parseInt(byte, 16),
  );
}
export class PromotionRecovery extends DurableObject {
  async replay({ key, previous, following }) {
    await this.ctx.storage.transaction(async (storage) => {
      const original = await storage.get(key),
        expected = decodePromotion(previous);
      const identical =
        expected instanceof Uint8Array && original instanceof Uint8Array
          ? original.length === expected.length &&
            original.every((byte, index) => byte === expected[index])
          : equalCareValues({ value: original }, { value: expected });
      if (!identical)
        throw Error("Campaign value differs from archived baseline");
      if (following) await storage.put(key, decodePromotion(following));
      else await storage.delete(key);
    });
  }
}

export class OperationsRecovery extends DurableObject {
  async replay({ events, previousConfig, nextConfig, changedConfig }) {
    await this.ctx.storage.transaction(async (storage) => {
      const currentConfig = (await storage.get("config")) ?? null;
      if (!equalCareValues(currentConfig, previousConfig))
        throw Error("Operations config baseline mismatch");
      if (changedConfig) await storage.put("config", nextConfig);
      for (const {
        table: { native, keys, fields },
        before,
        after,
      } of events) {
        const where = keys.map((key) => key + "=?").join(" AND ");
        const keyValues = keys.map((key) => (before ?? after)[key]);
        const current =
          this.ctx.storage.sql
            .exec(
              "SELECT " +
                fields.join(",") +
                " FROM " +
                native +
                " WHERE " +
                where,
              ...keyValues,
            )
            .toArray()[0] ?? null;
        if (!equalCareValues(current, before))
          throw Error("Operations row baseline mismatch");
        if (!after)
          this.ctx.storage.sql.exec(
            "DELETE FROM " + native + " WHERE " + where,
            ...keyValues,
          );
        else if (before)
          this.ctx.storage.sql.exec(
            "UPDATE " +
              native +
              " SET " +
              fields.map((field) => field + "=?").join(",") +
              " WHERE " +
              where,
            ...fields.map((field) => after[field]),
            ...keyValues,
          );
        else
          this.ctx.storage.sql.exec(
            "INSERT INTO " +
              native +
              "(" +
              fields.join(",") +
              ") VALUES(" +
              fields.map(() => "?").join(",") +
              ")",
            ...fields.map((field) => after[field]),
          );
      }
    });
  }
  async alarm() {
    await this.ctx.storage.setAlarm(Date.now() + 60_000);
  }
  async restoreRelease(batch) {
    const storage = this.ctx.storage;
    if (
      !equalCareValues(
        (await storage.get("release-batch")) ?? null,
        batch.previous,
      )
    )
      throw Error("Release batch baseline mismatch");
    await storage.put("release-batch", batch.following);
    if (batch.following.done) await storage.deleteAlarm();
    else
      await storage.setAlarm(
        Math.max(
          Date.now() + 1000,
          batch.following.readyAt ?? 0,
          batch.following.runningUntil ?? 0,
        ),
      );
  }
  async restoreReminderIds(ids) {
    if (ids.length)
      await this.ctx.storage.put(
        Object.fromEntries(ids.map((id) => ["reminder:" + id, true])),
      );
  }
}

export class Recovery extends DurableObject {
  async eraseDeletedAccount() {
    await this.ctx.storage.deleteAll();
    await this.ctx.storage.deleteAlarm();
  }
  restoreSessions({ account, sessions, revoked, history }) {
    this.ctx.storage.transactionSync(() => {
      const sql = this.ctx.storage.sql;
      if (account.registration) initializeEmailAccount(sql);
      const rows = sql
        .exec("SELECT hash,expires FROM sessions ORDER BY hash")
        .toArray()
        .map((row) => [row.hash, row.expires]);
      if (!equalCareValues(rows, sessions))
        throw Error("Legacy session census mismatch");
      for (const digest of revoked)
        sql.exec("DELETE FROM sessions WHERE hash=?", digest);
      if (history.length)
        sql.exec(
          "DELETE FROM reset_challenge; DELETE FROM pending_password_reset; DELETE FROM password_attempts; DELETE FROM password_sources",
        );
    });
  }
  async restoreReminderIds(ids) {
    if (!ids.length) return;
    const original = (await this.ctx.storage.get("reminder-devices")) ?? [];
    await this.ctx.storage.put("reminder-devices", [
      ...new Set([...original, ...ids]),
    ]);
  }
  async restore(id, revision, seeds, history, live, job, receipts) {
    await this.ctx.storage.transaction(async (storage) => {
      const source = (await storage.get("care-sync")) ?? {
        revision: 0,
        records: null,
      };
      if (source.revision !== revision) throw Error("Source revision mismatch");
      const original = source.records?.water ?? [];
      const rows = new Map(original.map((row) => [row.id, row]));
      if (rows.size !== original.length || rows.size !== seeds.length)
        throw Error("Baseline census mismatch");
      for (const op of seeds) {
        const row = rows.get(op.id);
        if (
          !row ||
          !op.body ||
          op.baseRevision !== 0 ||
          ["amount", "time", "day"].some((k) => row[k] !== op.body[k])
        )
          throw Error("Seed value mismatch");
      }
      let records = source.records ?? {
        medicines: {},
        doses: {},
        visits: {},
        routines: {},
        routineLogs: {},
        settings: {},
        water: [],
      };
      let next = revision,
        zone = (await storage.get("care-zone")) ?? null;
      for (const change of history) {
        if (
          Number(change.revision) !== next + 1 ||
          change.request.baseRevision !== next
        )
          throw Error("Divergent care history");
        records = applyCareDelta(records, change.request.changes);
        zone = change.request.zone ?? zone;
        next++;
      }
      if (
        !equalCareValues(records, live.records) ||
        next !== Number(live.revision) ||
        zone !== live.zone
      )
        throw Error("Recovered care differs from frozen writer");
      for (const { before, after } of receipts) {
        const operation = (before ?? after).operation;
        const sql = this.ctx.storage.sql;
        const stored = sql
          .exec(
            "SELECT expires FROM family_operations WHERE operation=?",
            operation,
          )
          .toArray()[0];
        const previous = await storage.get(operation);
        const expires =
          stored?.expires ??
          (previous === undefined ? undefined : previous + 7 * 86400000);
        if (expires !== before?.expires)
          throw Error("Delegated receipt baseline mismatch");
        if (after)
          sql.exec(
            "INSERT OR REPLACE INTO family_operations(operation,expires) VALUES(?,?)",
            operation,
            after.expires,
          );
        else
          sql.exec(
            "DELETE FROM family_operations WHERE operation=?",
            operation,
          );
      }
      if (!history.length) return;
      validateCareRecords(records);
      const epoch = this.ctx.storage.sql
        .exec("SELECT epoch FROM account_reset WHERE id=1")
        .toArray()[0]?.epoch;
      const owner = epoch ? id + "." + epoch : id;
      if (
        !Number.isSafeInteger(next) ||
        !careSnapshotFits(owner, next, records, zone ?? "Asia/Tehran")
      )
        throw Error("Legacy reader capacity exceeded");
      await storage.put("care-sync", { ...source, revision: next, records });
      if (zone) await storage.put("care-zone", zone);
      if ((await storage.get("reminder-devices"))?.length) {
        const at = Date.now() + 60_000;
        await storage.put("reminder-update", { owner, at, id: job });
        const alarm = await storage.getAlarm();
        if (alarm === null || alarm > at) await storage.setAlarm(at);
      }
    });
  }
  // Keep an existing alarm pending until the normal worker boots the output.
  async alarm() {
    await this.ctx.storage.setAlarm(Date.now() + 60_000);
  }
}
export default {
  fetch() {
    return new Response(null, { status: 404 });
  },
};
