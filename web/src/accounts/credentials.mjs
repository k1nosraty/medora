import { DurableObject } from "cloudflare:workers";

export class Credentials extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS credentials_v1 (
      username TEXT PRIMARY KEY, email_id TEXT NOT NULL UNIQUE, email TEXT NOT NULL,
      salt TEXT NOT NULL, proof TEXT NOT NULL, created_at INTEGER
    )`);
    if (!this.sql.exec("PRAGMA table_info(credentials_v1)").toArray().some(column => column.name === "created_at")) {
      this.sql.exec("ALTER TABLE credentials_v1 ADD COLUMN created_at INTEGER");
    }
  }

  usernameFor(emailId) {
    return this.sql.exec("SELECT username FROM credentials_v1 WHERE email_id = ?", emailId).toArray()[0]?.username ?? null;
  }

  find(username) {
    return this.sql.exec("SELECT email_id, email, salt, proof FROM credentials_v1 WHERE username = ?", username).toArray()[0] ?? null;
  }

  list(after, query) {
    return this.sql.exec(`SELECT username, email, email_id, salt, created_at FROM credentials_v1
      WHERE username > ? AND (instr(username, ?) > 0 OR instr(email, ?) > 0)
      ORDER BY username LIMIT 26`, after, query, query).toArray();
  }

  remove(username, emailId, salt) {
    return this.sql.exec("DELETE FROM credentials_v1 WHERE username = ? AND email_id = ? AND salt = ? RETURNING username",
      username, emailId, salt).toArray().length > 0;
  }

  replacePassword(emailId, salt, proof) {
    return this.sql.exec("UPDATE credentials_v1 SET salt = ?, proof = ? WHERE email_id = ? RETURNING username",
      salt, proof, emailId).toArray().length > 0;
  }

  register(username, emailId, email, salt, proof) {
    const inserted = this.sql.exec(
      "INSERT OR IGNORE INTO credentials_v1 VALUES (?, ?, ?, ?, ?, ?) RETURNING username",
      username, emailId, email, salt, proof, Date.now()
    ).toArray().length;
    if (inserted) return null;
    return this.usernameFor(emailId) ? "already_registered" : "username_taken";
  }
}
