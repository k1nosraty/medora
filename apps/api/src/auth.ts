import type { Repository } from "./repository";

const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
export const digest = async (value: string) =>
  hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
export const token = () =>
  hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
export type VerifyPassword = (
  password: string,
  salt: string,
  pepperId: string,
  expected: string,
) => Promise<boolean>;

export async function login(
  store: Repository,
  verify: VerifyPassword,
  username: string,
  password: string,
) {
  if (
    !(await store.loginBudget("service")) ||
    !(await store.loginBudget(await digest(username)))
  )
    return { status: 429 as const };
  const row = await store.credential(username);
  const matched = await verify(
    password,
    row?.password_salt ?? "0".repeat(32),
    row?.password_key ?? "legacy",
    row?.password_proof ?? "0".repeat(64),
  );
  if (!matched || !row) return { status: 401 as const };
  const value = token();
  const saved = await store.createSession(
    row.id,
    await digest(value),
    Date.now() + 86400000,
    row.password_proof,
  );
  return saved ? { status: 200 as const, value } : { status: 401 as const };
}
