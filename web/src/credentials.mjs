import { DurableObject } from "cloudflare:workers";

export class Credentials extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS credentials_v1 (
      username TEXT PRIMARY KEY, email_id TEXT NOT NULL UNIQUE, email TEXT NOT NULL,
      salt TEXT NOT NULL, proof TEXT NOT NULL
    )`);
  }

  usernameFor(emailId) {
    return this.sql.exec("SELECT username FROM credentials_v1 WHERE email_id = ?", emailId).toArray()[0]?.username ?? null;
  }

  find(username) {
    return this.sql.exec("SELECT email_id, email, salt, proof FROM credentials_v1 WHERE username = ?", username).toArray()[0] ?? null;
  }

  register(username, emailId, email, salt, proof) {
    const inserted = this.sql.exec(
      "INSERT OR IGNORE INTO credentials_v1 VALUES (?, ?, ?, ?, ?) RETURNING username",
      username, emailId, email, salt, proof
    ).toArray().length;
    if (inserted) return null;
    return this.usernameFor(emailId) ? "already_registered" : "username_taken";
  }
}
