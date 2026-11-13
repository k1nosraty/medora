import { randomUUID } from "node:crypto";
import { link, readFile, unlink, open, stat } from "node:fs/promises";
import { maxBackupBytes } from "../public/medication/features/backups/crypto.js";

const [mode, origin, file, ...flags] = process.argv.slice(2);
const token = process.env.MEDORA_MIGRATION_TOKEN;
const password = process.env.MEDORA_BACKUP_PASSWORD;
const url = URL.parse(origin ?? "");
if (!["backup", "verify", "restore"].includes(mode) || !file || !url || url.username || url.password ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) ||
    !/^[a-f0-9]{64}$/.test(token ?? "") || !password || password.length < 24 || password.length > 128 ||
    (flags.length && (mode !== "restore" || flags.length !== 1 || flags[0] !== "--resume-reminders"))) {
  throw new Error("Usage: node scripts/migrate-care.mjs backup|verify|restore https://host archive.medbackup [--resume-reminders]. Set MEDORA_MIGRATION_TOKEN and MEDORA_BACKUP_PASSWORD.");
}

async function send(action, bytes) {
  const headers = { Authorization: "Bearer " + token };
  let body;
  if (action === "backup") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({ password });
  } else {
    headers["Content-Type"] = "application/octet-stream";
    const passphrase = Buffer.from(password, "utf8");
    const length = Buffer.alloc(2);
    length.writeUInt16BE(passphrase.length);
    body = Buffer.concat([length, passphrase, bytes]);
    passphrase.fill(0);
    if (action === "restore" && flags.length) headers["X-Medora-Restore-Reminders"] = "yes";
  }
  try {
    const response = await fetch(new URL("/api/migration/" + action, url), {
      method: "POST", headers, body, redirect: "error", signal: AbortSignal.timeout(10 * 60_000)
    });
    if (!response.ok) {
      const { error } = await response.json().catch(() => ({}));
      throw new Error(`Migration ${action} failed: HTTP ${response.status} ${error ?? ""}`);
    }
    return response;
  } finally {
    if (Buffer.isBuffer(body)) body.fill(0);
  }
}

async function saveVerified(bytes) {
  const temp = file + "." + randomUUID() + ".partial";
  const handle = await open(temp, "wx", 0o600);
  try {
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    // Atomic publication that also refuses to replace an existing recovery copy.
    await link(temp, file);
  } finally {
    await unlink(temp);
  }
}

if (mode === "backup") {
  const response = await send("backup");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > maxBackupBytes) throw new Error("Backup exceeds the server archive limit.");
  const report = await (await send("verify", bytes)).json();
  await saveVerified(bytes);
  console.log(report);
} else {
  if ((await stat(file)).size > maxBackupBytes) throw new Error("Backup exceeds the server archive limit.");
  console.log(await (await send(mode, await readFile(file))).json());
}
