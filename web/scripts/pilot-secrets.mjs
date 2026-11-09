import { createECDH, randomBytes } from "node:crypto";
import { access, writeFile } from "node:fs/promises";
import { validSubject } from "../src/validation.mjs";

const input = process.argv[2] ?? "";
const subject = input.includes("@") && !input.includes(":") ? `mailto:${input}` : input;
if (!validSubject(subject)) {
  console.error("Usage: npm run pilot:secrets -- <email-or-https-url>");
  process.exit(1);
}

for (const file of [".dev.vars", ".pilot-secrets.json"]) {
  if (await access(file).then(() => true, () => false)) {
    console.error(`${file} exists. Keep the current keys or move both secret files before rotating.`);
    process.exit(1);
  }
}

const ecdh = createECDH("prime256v1");
ecdh.generateKeys();
const privateKey = Buffer.alloc(32);
const scalar = ecdh.getPrivateKey();
scalar.copy(privateKey, privateKey.length - scalar.length);
const secrets = {
  PILOT_ACCESS_CODE: randomBytes(18).toString("hex"),
  REMINDER_SIGNING_KEY: randomBytes(32).toString("hex"),
  VAPID_PUBLIC_KEY: ecdh.getPublicKey().toString("base64url"),
  VAPID_PRIVATE_KEY: privateKey.toString("base64url"),
  VAPID_SUBJECT: subject
};

const dotenv = Object.entries(secrets).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n");
await writeFile(".dev.vars", `${dotenv}\n`, { flag: "wx", mode: 0o600 });
await writeFile(".pilot-secrets.json", `${JSON.stringify(secrets, null, 2)}\n`, { flag: "wx", mode: 0o600 });
console.log("Created .dev.vars and .pilot-secrets.json. PILOT_ACCESS_CODE is for the separate /pilot/ tool.");
