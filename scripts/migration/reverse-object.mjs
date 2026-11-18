export { HouseholdRecovery } from "./reverse-family-object.mjs";
import { DurableObject } from "cloudflare:workers";
import { applyCareDelta } from "../../web/public/medication/domain/care-delta.js";
import { equalCareValues } from "../../web/public/medication/domain/care-contract.js";
import {
  validateCareRecords,
  careSnapshotFits,
} from "../../web/public/medication/domain/care-records.js";

export class Recovery extends DurableObject {
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
