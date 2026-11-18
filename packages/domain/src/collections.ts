export type Fields = Record<string, unknown>;
export function collection(
  state: Fields,
  kind: string,
): Record<string, Fields> {
  const value = state[kind];
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("invalid_collection");
  return value as Record<string, Fields>;
}
