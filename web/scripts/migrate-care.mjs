import { readFile, writeFile } from "node:fs/promises";

const [mode, origin, file] = process.argv.slice(2);
const token = process.env.MEDORA_MIGRATION_TOKEN;
const password = process.env.MEDORA_BACKUP_PASSWORD;
const url = URL.parse(origin ?? "");
if (!["backup", "restore"].includes(mode) || !file || !url ||
    (url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) ||
    !/^[a-f0-9]{64}$/.test(token ?? "") || !password || password.length < 24 || password.length > 128) {
  throw new Error("Usage: node scripts/migrate-care.mjs backup|restore https://host archive.medbackup. Set MEDORA_MIGRATION_TOKEN and MEDORA_BACKUP_PASSWORD.");
}
const headers = { Authorization: "Bearer " + token };
let body;
if (mode === "backup") {
  headers["Content-Type"] = "application/json";
  body = JSON.stringify({ password });
} else {
  headers["Content-Type"] = "application/octet-stream";
  headers["X-Medora-Backup-Password"] = encodeURIComponent(password);
  if (process.argv.includes("--resume-reminders")) headers["X-Medora-Restore-Reminders"] = "yes";
  body = await readFile(file);
}
const response = await fetch(new URL("/api/migration/" + mode, url), { method: "POST", headers, body, redirect: "error" });
if (!response.ok) throw new Error(`Migration ${mode} failed: HTTP ${response.status} ${(await response.json()).error}`);
if (mode === "backup") {
  await writeFile(file, new Uint8Array(await response.arrayBuffer()), { flag: "wx", mode: 0o600 });
  console.log("Encrypted archive saved.");
} else console.log(await response.json());
