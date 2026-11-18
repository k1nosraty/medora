import Dexie, { type Table } from "dexie";
import {
  waterEntry,
  type WaterEntry,
  type Operation,
  type Change,
} from "@medora/contracts";

export const guest = "device";
export interface WaterRow {
  owner: string;
  id: string;
  body: WaterEntry | null;
  revision: number;
  day: number;
  pending?: string;
  original?: Record<string, unknown>;
}
export interface Pending extends Operation {
  owner: string;
  created: number;
}
interface Cursor {
  owner: string;
  value: number;
}

export class Journal extends Dexie {
  water!: Table<WaterRow, [string, string]>;
  queue!: Table<Pending, string>;
  cursors!: Table<Cursor, string>;
  profiles!: Table<
    {
      owner: string;
      source: string;
      settings: Record<string, unknown>;
      revision: number;
    },
    string
  >;
  conflicts!: Table<WaterRow, [string, string]>;
  constructor(name = "medora-journal-v2") {
    super(name);
    this.version(1).stores({
      water: "[owner+id],[owner+day]",
      queue: "operation,[owner+created]",
      cursors: "owner",
    });
    this.version(2).stores({ conflicts: "[owner+id],owner" });
    this.version(3).stores({ profiles: "owner" });
  }
  async profile(owner: string) {
    return (
      (await this.profiles.get(owner)) ?? {
        owner,
        source: "",
        revision: 0,
        settings: {} as Record<string, unknown>,
      }
    );
  }
  async updateProfile(
    owner: string,
    expected: number,
    change: (settings: Record<string, unknown>) => void,
  ) {
    await this.transaction("rw", this.profiles, async () => {
      const record = await this.profile(owner);
      if (record.revision !== expected) throw Error("conflict");
      change(record.settings);
      await this.profiles.put({ ...record, revision: record.revision + 1 });
    });
  }
  async unresolved(owner: string) {
    return this.conflicts.where("owner").equals(owner).toArray();
  }
  async entries(owner: string, day: number) {
    return (
      await this.water.where("[owner+day]").equals([owner, day]).toArray()
    ).filter((r) => r.body !== null);
  }
  async save(
    owner: string,
    id: string,
    body: WaterEntry | null,
    expected: number,
  ) {
    const local = owner === guest || owner.startsWith("restore:");
    if (body) waterEntry.parse(body);
    return this.transaction("rw", this.water, this.queue, async () => {
      const before = await this.water.get([owner, id]);
      if (
        (before?.revision ?? 0) !== expected ||
        (!before && !body) ||
        before?.pending
      )
        throw new Error("conflict");
      const op: Pending = {
        owner,
        id,
        body,
        baseRevision: expected,
        operation: crypto.randomUUID(),
        kind: "water",
        created: Date.now(),
      };
      await this.water.put({
        ...before,
        owner,
        id,
        body,
        revision: local ? expected + 1 : expected,
        day: body?.day ?? before!.day,
        ...(!local && { pending: op.operation }),
      });
      if (!local) await this.queue.add(op);
    });
  }
  async apply(owner: string, rows: Change[], after: number) {
    await this.transaction(
      "rw",
      this.water,
      this.cursors,
      this.queue,
      this.conflicts,
      async () => {
        const cursor = (await this.cursors.get(owner))?.value ?? 0;
        if (cursor !== after) return;
        let last = after;
        for (const change of rows) {
          if (change.cursor !== last + 1) throw new Error("cursor_gap");
          const old = await this.water.get([owner, change.id]);
          const remote = {
            owner,
            id: change.id,
            body: change.body,
            revision: change.cursor,
            day: change.body?.day ?? old?.day ?? 0,
          };
          if (old?.pending && old.pending !== change.operation)
            await this.conflicts.put(remote);
          else {
            await this.water.put(remote);
            if (old?.pending) await this.queue.delete(old.pending);
            await this.conflicts.delete([owner, change.id]);
          }
          last = change.cursor;
        }
        if (last !== after) await this.cursors.put({ owner, value: last });
      },
    );
  }
  async resolve(
    owner: string,
    id: string,
    remoteRevision: number,
    choice: "local" | "remote",
  ) {
    await this.transaction(
      "rw",
      this.conflicts,
      this.queue,
      this.water,
      async () => {
        const key: [string, string] = [owner, id];
        const remote = await this.conflicts.get(key),
          local = await this.water.get(key);
        if (!remote || remote.revision !== remoteRevision || !local?.pending)
          throw new Error("conflict");
        await this.queue.delete(local.pending);
        if (choice === "remote") await this.water.put(remote);
        else {
          const operation = crypto.randomUUID();
          await this.queue.add({
            owner,
            id,
            operation,
            kind: "water",
            body: local.body,
            baseRevision: remoteRevision,
            created: Date.now(),
          });
          await this.water.put({
            ...local,
            revision: remoteRevision,
            pending: operation,
          });
        }
        await this.conflicts.delete(key);
      },
    );
  }
}

export const journal = new Journal();
