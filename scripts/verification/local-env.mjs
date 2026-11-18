import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
const path = process.argv[2];
if (!path) throw new Error("Supply a new private local environment file path");
const secret = () => randomBytes(32).toString("hex");
writeFileSync(
  path,
  [
    "MEDORA_DB_PASSWORD=" + secret(),
    "MEDORA_STORAGE_SECRET=" + secret(),
    "MEDORA_CODE_KEY=" + secret(),
    "MEDORA_MAIL_KEY=" + secret(),
    "MEDORA_PASSWORD_KEYS='" + JSON.stringify({ legacy: secret() }) + "'",
    "",
  ].join("\n"),
  { mode: 0o600, flag: "wx" },
);
console.log("Created isolated development configuration");
