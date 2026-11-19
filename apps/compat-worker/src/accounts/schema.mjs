export function initializeEmailAccount(sql) {
  sql.exec(`
      CREATE TABLE IF NOT EXISTS deliveries (id TEXT PRIMARY KEY, sent INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS challenge (id TEXT PRIMARY KEY, proof TEXT NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS reset_challenge (id TEXT PRIMARY KEY, proof TEXT NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS pending_password_reset
        (id TEXT PRIMARY KEY REFERENCES reset_challenge(id) ON DELETE CASCADE, salt TEXT NOT NULL, proof TEXT NOT NULL, version TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS password_sources (source TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS password_attempts (id INTEGER PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS account_reset (id INTEGER PRIMARY KEY, epoch TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS family_operations (operation TEXT PRIMARY KEY, expires INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS family_operations_expiry ON family_operations(expires);
    `);
}
