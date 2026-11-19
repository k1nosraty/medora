# Migration and reconciliation

## Browser

The rebuild reads the existing device database without specifying a new version. Opening a missing database aborts creation. A single read transaction captures every store, primary key, index definition, key path and value. Persistent Medora-prefixed browser preferences enter the private local archive. Session-only family actions retain their existing tab lifetime. A second Dexie database holds content-addressed manifests and 128-row checkpoints. Activation of a manifest requires re-reading its metadata, row count, keys and values, and verifying SHA-256 fingerprints. Unsupported structured values fail before activation. The source remains available for recovery. Capture currently holds the source image in memory.

The independent journal currently supports account-scoped water operations and guest entries. Copies of legacy records are available for reconciliation. Promoting a copied archive to the live store for all features requires explicit mappings and write fencing. A device archive may contain credentials and must stay on the original device.

The React onboarding, appointment and routine forms, cycle period editor and backup panel continue to use the canonical database in place. The frontend change uses the existing device schema, archive formats and sync protocol. The [device preservation notes](DATA_PRESERVATION.md) describe the on-origin update and retry boundaries.

## Frozen server copies

The CLI accepts a stopped, consistent **copy** of a Wrangler/workerd SQLite namespace tree and an independent census. Cloudflare hosted namespaces require their own complete acquisition procedure. A locally constructed file list alone cannot establish hosted source coverage.

For each namespace the census maps its directory name to the exact list of SQLite filenames, including metadata.sqlite if present. Include all seven classes and any additional namespaces. A misspelled or missing file, unexpected directory or dangling WAL fails inventory validation. SQLite backup incorporates committed WAL contents. The exporter checks SQLite integrity and counts every table, including unknown tables. It seals each image using AES-256-GCM with per-object nonce and associated identity. The authenticated manifest includes the SHA-256 of each plaintext database image. Import stores encrypted objects in PostgreSQL using a composite checkpoint key. A conflict never overwrites an existing archive. Verify decrypts the target, compares hashes and inventories, reopens each SQLite image and recounts its tables.

Use a separate private hex key file. The output directory must be new. Keep the census and key outside the repository.

```sh
pnpm db:migrate
node scripts/migration/objects.mjs export "$FROZEN_DO_COPY" "$INDEPENDENT_CENSUS" "$NEW_ARCHIVE"
node scripts/migration/objects.mjs import "$NEW_ARCHIVE"
node scripts/migration/objects.mjs verify "$NEW_ARCHIVE"
```

Set MEDORA_ARCHIVE_KEY_FILE for all three object commands and DATABASE_URL for the isolated PostgreSQL target. A verified physical archive preserves original schemas, including data an application export might exclude. The normalized application tables require separate semantic verification before any cutover.

## Logical Durable Object archives

The incumbent Worker also supports logical encrypted archives through `/api/migration`. Use `web/scripts/migrate-care.mjs` for `MEDSRV02` and `web/scripts/migrate-care-v1.mjs` for `MEDSRV01`. Each reader has a `verify` command that accepts an isolated compatibility Worker origin and archive path. Pass a dedicated migration token and the archive's password via `MEDORA_MIGRATION_TOKEN` and `MEDORA_BACKUP_PASSWORD`. Keep the archive and its credentials private. Logical archive verification covers the records and format the exporter enumerates. Complete namespace reconciliation requires the independent census described above.

## Evidence scope

Synthetic server rehearsal used seven namespaces, fourteen SQLite files and twenty-eight rows, including a relationship, blob and large timestamp in an unfamiliar table. Truncating the last archive part interrupted an import. Restoring that part, rerunning twice and independently verifying the target succeeded. Deliberate corruption of target ciphertext failed verification. Device fixtures checked v1 capture, binary and pending fields, a 301-row interrupted import, repeated import and detection of altered target values.

Repository discovery found the committed Android compatibility fixture and local Wrangler development state. Both Medora worktrees, the available environment variable names, Documents and Downloads yielded no identified complete authorized production snapshot. The empty and metadata-only local namespaces cannot certify hosted coverage.

Full authorized source reconciliation is **BLOCKED**. This workspace has no identified, explicitly authorized complete source snapshot, independent namespace census, key-version references, or historical backup corpus. Local synthetic reconciliations cover their fixture namespaces and objects.

## Relational rehearsal

A second rehearsal starts the actual legacy classes in Workerd, populates synthetic records and stops the process. Its census is derived from object IDs allocated during setup. The exporter authenticates a separately supplied mapping of opaque SQLite filenames to logical object names. Pass the identity JSON path after NEW_ARCHIVE to enable semantic projection. Do not infer an account owner from a filename.

```sh
node scripts/migration/objects.mjs project "$NEW_ARCHIVE"
node scripts/migration/objects.mjs verify-projection "$NEW_ARCHIVE"
```

Physical verification of this fixture covered 15 SQLite images in seven namespaces and 25 physical table rows. The care snapshots stored in KV expanded into 1,603 care/settings rows. PostgreSQL comparison verified two credential records, two people, two legacy session digests/expiries, one family, two memberships, one directional grant, one device and two account-device references. Import ran twice. The verifier uses typed temporary tables and compares both directions with EXCEPT ALL, in addition to the encrypted image checks. Ordinary unknown fields, inactive tables and unprojected jobs remain in the physical archive. The projections are staged, and generation 1 accounts remain fenced from v2 sign-in.

Run scripts/verification/rehearse.mjs against a fresh synthetic PostgreSQL database. A new fixture gets new account IDs. Import into a database containing conflicting usernames aborts the transaction. The expanded rehearsal below adds household policies, invitations, audit events, encrypted fields and pending reminder work. Provider delivery, identity lifecycle, media changes and complete historical variants still require independent verification. Hosted acquisition and full authorized reconciliation remain open.

## Expanded recovery drill

The final Workerd fixture includes real legacy client-side encrypted appointment and cycle fields. The private fixture writer records its own inputs before export. A separate verifier compares those inputs with the PostgreSQL credential, health, session, device, household, membership and permission values. It also opens both private fields after projection with the fixture recovery key. Verification covered 1,607 care/settings/format rows, including 1,601 water rows, across the same 15 SQLite images and seven namespaces. Import and projection ran twice.

The restore-copy command verifies PostgreSQL's stored ciphertext, writes a new 0700 namespace directory, checks each written SQLite image against its authenticated digest, and removes its incomplete marker after success. The fixture booted all seven legacy classes from this reconstructed tree. Its original runtime read back sessions, account state, grants-related household identity, binary extension data, device state, operations, promotions and pilot storage. This restores the frozen point in time. It does not replay newer writes into legacy storage.

The device archive also reconciles Maps, Sets, cyclic and shared object references, typed arrays, dates and blobs where supported by IndexedDB. Record activation rejects a divergent manifest. A historical encrypted file retains its original bytes alongside the validated care projection. A normal user backup contains portable care data. Browser credentials and session-scoped pending actions have separate lifetimes and stay in their original storage.

Chromium and WebKit each opened actual IndexedDB versions 1, 2 and 3. The tests archived the databases, edited a restored water entry, then reopened the original databases and compared the old version, original value and extension field. A legacy extension store named file remained a legacy store during import.

## Writer transition and recovery after committed writes

1. Exercise only a fresh loopback PostgreSQL fixture and a stopped, independent namespace copy. Apply all twenty migrations. Start the generation 1 runtime with MEDORA_LEGACY_WRITES_FENCED=true and verify ingress, RPC, cron and pending alarms. A previously deployed unfenced Worker must be drained before any actual writer transition.
2. The rehearsal verifies the authenticated source manifest and complete fixture owner set, activates projected care, household, identity, reminder and operations state, and moves the writer from open to rehearsal. Browser and API writes use the ordinary product routes. An older SQL connection without the explicit source-fence setting loses write permission as soon as rehearsal begins. The SQL freeze waits for transactions holding the shared writer lock.
3. Leave both writers fenced while reconstructing to a fresh private directory. The fixture command is `node scripts/migration/objects.mjs restore-after-writes "$NEW_ARCHIVE" "$NEW_RECOVERY_ROOT"`. It authenticates the archive, replays acknowledged care, household, credential, reminder, operations and campaign writes in order, checks final values, receipts and revisions, and publishes the verified do/ tree by rename. It rejects a used destination, ambiguous identity, divergent base, or unmapped write. Retry an interrupted run in its original private directory using the same immutable archive and key.
4. Boot the original runtime against the recovered copy. Check scopes, ciphertext, delegated operation receipts, pending reminder work, denied stale revisions and accepted current revisions. Keep the original frozen copy and target database until an authorized recovery decision.

The tests use synthetic accounts and private fixture keys. Completed registrations and resets map to the original credential index. Recovery validates the source session census and removes revoked source sessions. The generation 2 session cookie is separate. Accounts created during the rehearsal can sign into the original runtime after recovery. Outstanding verification codes and encrypted outbox work retain their generation 2 format, so recovery refuses a snapshot with an unexpired challenge. Pending backup reservations, unsuccessful account object cleanup and unsupported mutations also block publication.

Recovery checks reminder tasks and wake times against the authenticated SQLite images and PostgreSQL journal. The recovered namespace includes newly registered devices and their operations and account references. Operational configuration, support tickets, metrics and audit changes replay into the original tables. Campaign media are replayed as binary chunks with their metadata. The native fixture reads the complete recovered media back and compares its SHA-256.

The reverse path reconciles the rebuilt backup catalog from the empty cutover baseline and checks the size and SHA-256 of every retained encrypted object. For the source object read, use its dedicated, authorized S3-compatible credentials. Recovery places an authenticated catalog and its encrypted objects in the private recovery copy. The incumbent has no matching server-side backup catalog. To reconstruct that catalog in a separate rebuilt installation, provision the reconciled owner IDs, set the separate target database and bucket bindings, retain the archive key reference and run:

```sh
node scripts/migration/objects.mjs restore-backup-catalog "$RECOVERED_DO_ROOT"
```

The restore checks authentication, owner IDs, metadata and object bytes before committing the catalog. Repeating it verifies existing catalog entries. The fixture exercised an independent PostgreSQL target and object store with a second readback.

An administrator deletion revokes live credentials, diminishes the reverse owner census, detaches linked reminders and clears the archived account's usable state from the recovered native copy. A valid recovery image will not reactivate the removed owner. Retain the original sealed migration snapshot under the authorized backup retention policy.

Full authorized source reconciliation, existing key continuity, release notification delivery and historical storage variants remain open.

## Move an established PostgreSQL installation between runtimes

This runbook is for a dedicated portable PostgreSQL installation. The older Durable Object import is a separate prerequisite for existing legacy users. An initialized empty installation does not represent migration or reconciliation of incumbent accounts.

After the normal checksum-checked SQL migrations, `postgres-handoff.mjs initialize` enables PostgreSQL mode only on an empty compatible database. It does not promote a legacy rehearsal. The following commands must be run with separately authorized isolated resources. Configure `MEDORA_SOURCE_DATABASE_URL` and `MEDORA_TARGET_DATABASE_URL` as direct PostgreSQL connections, and the prefixed `MEDORA_SOURCE_S3_*` and `MEDORA_TARGET_S3_*` values for R2's S3 endpoint and the target S3 storage. Required suffixes are `ENDPOINT`, `BUCKET`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`; set `REGION` when it differs from `auto`. Keep the dump, credentials and copy ledger on private encrypted storage. Select the source server's client major version with `MEDORA_PG_BIN` if necessary.

```sh
node scripts/migration/postgres-handoff.mjs prepare "$NEW_PRIVATE_TRANSFER_DIR"
node scripts/migration/postgres-handoff.mjs commit "$NEW_PRIVATE_TRANSFER_DIR"
```

1. `prepare` requires an empty, distinct destination database and a dedicated empty bucket. It freezes the source through the same database row lock used by API mutations and provider jobs. The freeze drains in-flight transactions and includes their final writes. It rejects pending backup reservations or outstanding erasure objects. A request during the freeze receives a temporary failure and the client keeps its local changes.
2. Take a custom `pg_dump` of the dedicated database, including the application schema and migration checksums, then run a single-transaction `pg_restore`. The restored application starts fenced. The script checks table counts and hashes of complete rows, sequence positions, indexes and foreign-key definitions. Sessions, private values, account IDs, grant direction, operation receipts and pending encrypted outbox rows travel in this copy.
3. The source R2 inventory must match the application backup catalog. Copy the ciphertext to the destination and check key, length and SHA-256. The application file metadata is in PostgreSQL. Unexpected objects are a hard failure. Additional untracked object headers or arbitrary external buckets are outside this catalog.
4. `commit` verifies the receipt again before permanently retiring the source for the selected target identity and enabling the target writer. Keep the public origin, configuration references, keys and both stores. The orchestration performs no DNS or traffic change. See [rollback](ROLLBACK.md) for the failure boundaries.

The automated rehearsal switches one origin from an isolated Workerd Hyperdrive/R2 backend to Node with an independent PostgreSQL database and a separate local Versity gateway. It includes a failed copy, a late transaction, two disconnected clients, an encrypted fixture object with a successful decryption readback and delivery of a restored pending identity job. After Node accepts the offline writes, the drill freezes Node and returns the new authoritative data to a separate Worker database and R2 bucket. This is synthetic evidence. The hosted R2 S3 endpoint, provider credentials and full authorized legacy snapshot have not been exercised.

### Reproduce on local fixtures

Build with `pnpm build` and start a loopback PostgreSQL server with the same major version as the local `pg_dump` and `pg_restore`. Provision four fresh databases whose names begin with `medora_`. Provide their private URLs through `MEDORA_HANDOFF_SOURCE`, `MEDORA_HANDOFF_TARGET`, `MEDORA_HANDOFF_ABORTED`, and `MEDORA_HANDOFF_RECOVERY`. Only the source is initialized by the test. Run `pnpm test:handoff` with the installed Playwright Chromium or `MEDORA_CHROMIUM` pointing to a local executable. The test starts its own mail sink, Workerd and Node runtime. The default object destination is a loopback S3-protocol fixture. To exercise a dedicated empty local Versity bucket, set `MEDORA_HANDOFF_TEST_S3_ENDPOINT`, `MEDORA_HANDOFF_TEST_S3_BUCKET` and the corresponding access-key and secret-key variables outside the repository.
