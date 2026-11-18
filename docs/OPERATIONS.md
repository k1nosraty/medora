# Operations and recovery

## Device recovery

Keep the original origin, IndexedDB database and push registration. An earlier app database can be inspected in Device data. The rebuilt reader opens the existing version read-only and hashes its rows before and after copying. A failed capture can be retried. Preserve the browser profile and its original tab if family actions are pending. Do not clear site storage to resolve a migration error.

An encrypted Android, web or cycle file can be opened in Device data. A restored profile has its own namespace. Reopening the same file with the same projection reuses the existing profile. The ciphertext remains available in the local device archive. Account ownership and reminder enrollment require independent confirmation before any cloud import. Device-local records stay on the original device until the owner takes an explicit action.

## Server recovery

Use private storage for the census, archive, key file and database backups. Operate against an isolated restored database first. Run the independent verify and verify-projection commands in MIGRATION.md. Check group and permission identity, legacy session expiry, device references, grants, row counts and signed digests. Preserve the source and quarantine a divergent target. Investigate with aggregate counts and error codes. Keep account identifiers, records, salts, tokens, cookies and endpoint details out of logs.

The v2 health route opens the migrated PostgreSQL schema. The runtime smoke test performs authenticated incremental push/pull, backup write, download digest comparison and logout in an isolated database. A successful health response alone provides no storage or authorization evidence.

The Docker stack keeps separate named PostgreSQL and object volumes. Stop services with docker compose stop. Retain volumes and original namespaces for rollback. Before a future release, rehearse a PostgreSQL backup restore, object storage restore, and transfer of post-cutover writes back to the previous system. Traffic rollback alone cannot recover new records. Release traffic must stay on the incumbent until that rehearsal succeeds.

## Verified portable recovery drill

On a loopback-only fixture project, scripts/verification/restore-compose.sh pauses the API while collecting a PostgreSQL custom dump, all object-volume files with their extended attributes and deterministic per-table row hashes and sequence values. A trap resumes the fixture API on failure. The script verifies archive hashes, creates a unique second project, restores into fresh volumes in a single SQL transaction and reads each ready encrypted object through signed S3 requests. A private output directory retains the dump, object tar, checksum inventory, new project name and the fixture's app key references. The recovery containers are stopped and their volumes are retained. This fixture-only utility produces plaintext database recovery media. A real operator backup requires approved encrypted media and independently controlled key storage.

The rehearsal matched all 25 table/sequence inventory lines and read each cataloged object with the original size and SHA-256. The newer migration rehearsal covers reverse care and household writes on synthetic namespaces. The current Docker rehearsal restored the compatibility namespace volume, PostgreSQL and an encrypted object on an isolated network. Real-user recovery and unsupported reverse mappings remain release gates. Monitor the health endpoint, rejected logins, aggregate outbox age, sync conflicts and unfinished backup reservations. Investigate stalled jobs using aggregate statuses and keep recipient and care details out of shared logs.

An interrupted shell installation was exercised with a 503 from a precache asset. The old shell reloaded offline and retained its journal. A subsequent complete shell waited for the open client to close, activated, and read the same journal offline. The test uses the built service worker and a loopback HTTP fixture.

The source fence also suspends side-effecting reads, scheduled jobs and RPC accepted by a previous ingress. Alarm handlers defer their wake-up while frozen. Rehearse on a separate native namespace copy. The destination recovery procedure, including process interruption and retry, is in [migration and reconciliation](MIGRATION.md).
