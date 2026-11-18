import { createHmac, scrypt, timingSafeEqual } from "node:crypto";
import type { VerifyPassword } from "./auth";

export function verifier(keys: Record<string, string>): VerifyPassword {
  return async (password, salt, id, expected) => {
    const secret = Object.hasOwn(keys, id) ? keys[id] : undefined;
    const input = createHmac("sha256", secret ?? "0".repeat(64))
      .update("password-v1:" + password)
      .digest("hex");
    const proof = await new Promise<Buffer>((resolve, reject) =>
      scrypt(
        input,
        salt,
        32,
        { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 },
        (err, key) => (err ? reject(err) : resolve(key)),
      ),
    );
    return (
      !!secret &&
      /^[a-f0-9]{64}$/.test(expected) &&
      timingSafeEqual(proof, Buffer.from(expected, "hex"))
    );
  };
}
