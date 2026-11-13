import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { link, open, readFile, unlink } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { advanceHash, emptyHash, maxPartBytes, openPart, partsMagic } from "../src/operations/backup-parts-format.mjs";

const [mode, origin, file, ...flags] = process.argv.slice(2);
const token = process.env.MEDORA_MIGRATION_TOKEN;
const password = process.env.MEDORA_BACKUP_PASSWORD;
const url = URL.parse(origin ?? "");
if (!["backup", "verify", "restore", "backup-keys", "restore-keys"].includes(mode) || !file || !url || url.username || url.password ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) ||
    !/^[a-f0-9]{64}$/.test(token ?? "") || !password || password.length < 24 || password.length > 128 ||
    (flags.length && (mode !== "restore" || flags.length !== 1 || flags[0] !== "--resume-reminders"))) {
  throw new Error("Usage: node scripts/migrate-care.mjs backup|verify|restore|backup-keys|restore-keys https://host archive.medbackup [--resume-reminders]");
}
const keysMagic = Buffer.from("MEDKEY02");
const idSize = 36;
const saltSize = 16;
const headerSize = partsMagic.length + idSize + saltSize;
const phase = flags.length ? "reminders" : "data";

function check(valid) {
  if (!valid) throw new Error("Invalid or incomplete Medora archive.");
}

function keyFor(salt) {
  return scryptSync(password, salt, 32, { N: 65536, r: 8, p: 1, maxmem: 96 * 1024 * 1024 }).toString("hex");
}

async function call(action, body, metadata) {
  const headers = { Authorization: "Bearer " + token, ...metadata,
    "Content-Type": metadata ? "application/octet-stream" : "application/json" };
  const path = new URL("/api/migration/parts/" + action, url);
  for (let attempt = 0; ; attempt++) {
    let response;
    try {
      response = await fetch(path, { method: "POST", headers, body: metadata ? body : JSON.stringify(body),
        redirect: "error", signal: AbortSignal.timeout(90_000) });
    } catch (error) {
      if (attempt === 4) throw error;
      await sleep(1000 * (attempt + 1));
      continue;
    }
    if (response.ok) return response;
    const { error } = await response.json().catch(() => ({}));
    if (attempt === 4 || (response.status < 500 && response.status !== 429 && error !== "restore_in_progress")) {
      throw new Error(`Migration ${action} failed: HTTP ${response.status} ${error ?? ""}`);
    }
    await sleep(error === "restore_in_progress" ? 30_000 : 1000 * (attempt + 1));
  }
}

function readFramePrefix(length) {
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(length);
  return prefix;
}

async function writeAll(handle, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const { bytesWritten } = await handle.write(bytes, offset, bytes.length - offset);
    if (!bytesWritten) throw new Error("Could not write the archive.");
    offset += bytesWritten;
  }
}

async function readExactly(handle, length) {
  const buffer = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const { bytesRead } = await handle.read(buffer, offset, length - offset, offset);
    check(bytesRead > 0);
    offset += bytesRead;
  }
  return buffer;
}

async function* frames(handle, header, size) {
  let offset = headerSize;
  let index = 0;
  while (offset < size) {
    const prefix = Buffer.alloc(4);
    check((await handle.read(prefix, 0, 4, offset)).bytesRead === 4);
    offset += 4;
    const length = prefix.readUInt32BE();
    check(length >= 28 && length <= maxPartBytes && offset + length <= size);
    const frame = Buffer.alloc(length);
    let read = 0;
    while (read < length) {
      const { bytesRead } = await handle.read(frame, read, length - read, offset + read);
      check(bytesRead > 0);
      read += bytesRead;
    }
    offset += length;
    const record = await openPart(frame, header.key, header.id, index);
    yield { frame, index, record, last: offset === size };
    index++;
  }
}

const rank = new Map(["start", "accounts", "reminders", "media", "ads", "operations", "end"].map((type, index) => [type, index]));

async function withArchive(handle, process) {
  const { size } = await handle.stat();
  const raw = await readExactly(handle, headerSize);
  check(raw.subarray(0, 8).equals(Buffer.from(partsMagic)));
  const header = { id: raw.toString("ascii", 8, 8 + idSize), key: keyFor(raw.subarray(8 + idSize)) };
  check(/^[a-f0-9-]{36}$/.test(header.id));
  let previousRank = -1;
  let hash = emptyHash;
  let total = 0;
  let final = false;
  let consistent = false;
  let previousAccount = "", previousReminder = "";
  const assets = new Map();
  const stats = { accounts: 0, media: 0, reminders: 0 };
  for await (const { record, frame, index, last } of frames(handle, header, size)) {
    const position = rank.get(record.type);
    check(position !== undefined && position >= previousRank && !final && ((index === 0) === (record.type === "start")));
    if (index === 0) consistent = record.consistent === true;
    if (position === previousRank) check(["accounts", "reminders", "media", "operations"].includes(record.type));
    if (record.type === "accounts") for (const { row } of record.accounts) {
      check(row.username > previousAccount);
      previousAccount = row.username;
      stats.accounts++;
    }
    if (record.type === "reminders") for (const { id } of record.reminders) {
      check(id > previousReminder);
      previousReminder = id;
      stats.reminders++;
    }
    if (record.type === "media") {
      const { id, size, type } = record.asset;
      check(!assets.has(id));
      assets.set(id, { size, type });
      stats.media++;
    }
    if (record.type === "ads") {
      check(record.ads.assets.length === assets.size && record.ads.assets.every(({ id, size, type }) =>
        assets.get(id)?.size === size && assets.get(id)?.type === type));
    }
    if (record.type === "operations") check([rank.get("ads"), rank.get("operations")].includes(previousRank));
    if (record.type === "end") {
      check(last && previousRank === rank.get("operations"));
      final = true;
    }
    hash = await advanceHash(hash, frame);
    previousRank = position;
    total++;
  }
  check(final && total >= 4);
  const info = { chainSha256: hash, parts: total, bytes: size, consistent, ...stats };
  if (process) await process(header, size, info);
  return info;
}

async function publish(work) {
  const temp = file + "." + randomUUID() + ".partial";
  const handle = await open(temp, "wx+", 0o600);
  try {
    const report = await work(handle);
    await handle.sync();
    await link(temp, file);
    return report;
  } finally {
    await handle.close();
    await unlink(temp);
  }
}

async function backup() {
  return publish(async handle => {
    const id = randomUUID();
    const salt = randomBytes(saltSize);
    const key = keyFor(salt);
    await writeAll(handle, Buffer.concat([partsMagic, Buffer.from(id), salt]));
    let cursor = null;
    let index = 0;
    do {
      const response = await call("backup", { id, index, cursor, key });
      const part = Buffer.from(await response.arrayBuffer());
      check(part.length <= maxPartBytes);
      const record = await openPart(part, key, id, index);
      await writeAll(handle, readFramePrefix(part.length));
      await writeAll(handle, part);
      cursor = record.next;
      check((record.type === "end") === (cursor === null));
      index++;
    } while (cursor);
    return withArchive(handle);
  });
}

async function openArchive(action) {
  const handle = await open(file, "r");
  try {
    return await withArchive(handle, async (header, size, info) => {
      async function run(step) {
        let next = 0;
        for await (const { frame, index } of frames(handle, header, size)) {
          if (step === "restore" && index < next) continue;
          const body = Buffer.concat([Buffer.from(header.key, "hex"), frame]);
          try {
            const res = await call(step, body, { "X-Medora-Archive": header.id, "X-Medora-Index": String(index),
              "X-Medora-Total": String(info.parts), "X-Medora-Digest": info.chainSha256, "X-Medora-Phase": phase });
            if (step === "restore") next = (await res.json()).next;
          } finally {
            body.fill(0, 0, 32);
          }
        }
      }
      await run("verify");
      if (action === "restore") await run("restore");
    });
  } finally {
    await handle.close();
  }
}

async function backupKeys() {
  return publish(async handle => {
    const id = randomUUID();
    const salt = randomBytes(saltSize);
    const key = keyFor(salt);
    const response = await call("keys", { id, key });
    const part = Buffer.from(await response.arrayBuffer());
    const data = await openPart(part, key, id, 0);
    check(data.type === "keys");
    await writeAll(handle, Buffer.concat([keysMagic, Buffer.from(id), salt, part]));
    return { encryptedKeyBundle: true };
  });
}

if (mode === "backup") {
  console.log(await backup());
} else if (mode === "backup-keys") {
  console.log(await backupKeys());
} else if (mode === "restore-keys") {
  const bytes = await readFile(file);
  check(bytes.length <= 8192 && bytes.subarray(0, 8).equals(keysMagic));
  const record = await openPart(bytes.subarray(headerSize), keyFor(bytes.subarray(8 + idSize, headerSize)),
    bytes.toString("ascii", 8, 8 + idSize), 0);
  check(record.type === "keys");
  if (process.stdout.isTTY) throw new Error("Pipe the key bundle directly into the isolated Worker's secret import.");
  process.stdout.write(JSON.stringify(record.continuity));
} else {
  console.log(await openArchive(mode));
}
