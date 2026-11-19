// Verification suites create records and may reset tables. The operator's
// migration command has a separate, explicit DATABASE_URL contract.
export function fixtureDatabase(value) {
  if (!value) return undefined;
  const url = new URL(value);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !/^\/medora_(?:fixture|test|transition|unmapped|erase_imported|handoff)(?:_[a-z0-9]+)*$/.test(url.pathname) ||
    url.search || url.hash
  ) throw Error("Verification requires a dedicated loopback PostgreSQL fixture database");
  return value;
}
