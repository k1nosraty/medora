# Operations and recovery

## Device recovery

Keep the original origin, IndexedDB database and push registration. An earlier app database can be inspected in Device data. The rebuilt reader opens the existing version read-only and hashes its rows before and after copying. A failed capture can be retried. Preserve the browser profile and its original tab if family actions are pending. Do not clear site storage to resolve a migration error.

An encrypted Android, web or cycle file can be opened in Device data. A restored profile has its own namespace. Reopening the same file with the same projection reuses the existing profile. The ciphertext remains available in the local device archive. Account ownership and reminder enrollment require independent confirmation before any cloud import. Device-local records stay on the original device until the owner takes an explicit action.

## Server recovery

Use private storage for the census, archive, key file and database backups. Operate against an isolated restored database first. Run the independent verify and verify-projection commands in MIGRATION.md. Check group and permission identity, legacy session expiry, device references, grants, row counts and signed digests. Preserve the source and quarantine a divergent target. Investigate with aggregate counts and error codes. Keep account identifiers, records, salts, tokens, cookies and endpoint details out of logs.

The v2 health route opens the migrated PostgreSQL schema. The runtime smoke test performs authenticated incremental push/pull, backup write, download digest comparison and logout in an isolated database. A successful health response alone provides no storage or authorization evidence.

The Docker stack keeps separate named PostgreSQL and object volumes. Stop services with docker compose stop. Retain volumes and original namespaces for rollback. Before a future release, rehearse a PostgreSQL backup restore, object storage restore, and transfer of post-cutover writes back to the previous system. Traffic rollback alone cannot recover new records. Release traffic must stay on the incumbent until that rehearsal succeeds.
