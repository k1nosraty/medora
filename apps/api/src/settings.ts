export function passwordKeys(raw: string | undefined): Record<string, string> {
  if (!raw) throw new Error("MEDORA_PASSWORD_KEYS is required");
  const keys: unknown = JSON.parse(raw);
  if (
    !keys ||
    typeof keys !== "object" ||
    Array.isArray(keys) ||
    !Object.keys(keys).length ||
    !Object.entries(keys).every(
      ([id, value]) =>
        /^[a-z0-9-]{1,32}$/.test(id) &&
        typeof value === "string" &&
        /^[a-f0-9]{64}$/i.test(value),
    )
  )
    throw new Error("Invalid password key registry");
  return keys as Record<string, string>;
}
