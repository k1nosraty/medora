import { isDeepStrictEqual } from "node:util";

export async function identityReplay(client, snapshot) {
  // A live challenge cannot be translated to the original key and wire format.
  const {
    rows: [checks],
  } = await client.query(
    `SELECT
    EXISTS(SELECT 1 FROM medora.rollback_exceptions WHERE relation_name NOT IN ('challenges','mail_outbox')) AS unsupported,
    EXISTS(SELECT 1 FROM medora.challenges WHERE expires_at>now()) AS pending,
    EXISTS(SELECT 1 FROM medora.legacy_session_access l WHERE NOT EXISTS
      (SELECT 1 FROM medora.legacy_sessions s WHERE s.snapshot=$1 AND (s.owner,s.digest,s.expires_at)=(l.owner,l.digest,l.expires_at))) AS invalid_session`,
    [snapshot],
  );
  if (checks.unsupported || checks.pending || checks.invalid_session)
    throw Error("A committed change requires a different reverse projection");

  const { rows: accounts } =
    await client.query(`SELECT a.id,a.email,a.username,a.created_at,r.proof AS registration,
    jsonb_build_array(a.password_salt,a.password_proof,a.password_key) AS proof
    FROM medora.accounts a LEFT JOIN medora.cutover_accounts c ON c.owner=a.id
     LEFT JOIN medora.account_registrations r ON r.owner=a.id
     WHERE a.sync_generation=2 AND (r.owner IS NOT NULL OR c.owner IS NOT NULL) ORDER BY a.username COLLATE "C"`);
  const history = new Map(
    accounts.map((account) => [
      account.id,
      { account, history: [], sessions: [], revoked: [] },
    ]),
  );
  const resets = await client.query(
    "SELECT owner,previous,following FROM medora.password_resets ORDER BY sequence",
  );
  for (const reset of resets.rows) {
    const item = history.get(reset.owner);
    if (
      !item ||
      (item.history.length &&
        !isDeepStrictEqual(reset.previous, item.history.at(-1).following))
    )
      throw Error("Credential history diverged");
    item.history.push(reset);
  }
  const sessions = await client.query(
    `SELECT s.owner,s.digest,s.expires_at::float8 AS expires_at,l.digest IS NULL AS revoked
    FROM medora.legacy_sessions s LEFT JOIN medora.legacy_session_access l ON l.owner=s.owner AND l.digest=s.digest
    WHERE s.snapshot=$1 ORDER BY s.digest COLLATE "C"`,
    [snapshot],
  );
  for (const row of sessions.rows) {
    const item = history.get(row.owner);
    if (!item || (item.history.length && !row.revoked))
      throw Error("Session revocation diverged");
    item.sessions.push([row.digest, row.expires_at]);
    if (row.revoked) item.revoked.push(row.digest);
  }
  return history;
}
