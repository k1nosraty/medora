# Migration and reconciliation

## Browser

The rebuild reads the existing device database without specifying a new version. Opening a missing database aborts creation. A single read transaction captures every store, primary key, index definition, key path and value. Persistent Medora-prefixed browser preferences enter the private local archive. Session-only family actions retain their existing tab lifetime. A second Dexie database holds content-addressed manifests and 128-row checkpoints. Activation of a manifest requires re-reading its metadata, row count, keys and values, and verifying SHA-256 fingerprints. Unsupported structured values fail before activation. The source remains available for recovery. Capture currently holds the source image in memory.

The independent journal currently supports account-scoped water operations and guest entries. Copies of legacy records are available for reconciliation. Promoting a copied archive to the live store for all features requires explicit mappings and write fencing. A device archive may contain credentials and must stay on the original device.

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

## Evidence scope

Synthetic server rehearsal used seven namespaces, fourteen SQLite files and twenty-eight rows, including a relationship, blob and large timestamp in an unfamiliar table. Truncating the last archive part interrupted an import. Restoring that part, rerunning twice and independently verifying the target succeeded. Deliberate corruption of target ciphertext failed verification. Device fixtures checked v1 capture, binary and pending fields, a 301-row interrupted import, repeated import and detection of altered target values.

Repository discovery found the committed Android compatibility fixture and local Wrangler development state. Both Medora worktrees, the available environment variable names, Documents and Downloads yielded no identified complete authorized production snapshot. The empty and metadata-only local namespaces cannot certify hosted coverage. Full authorized source reconciliation remains open.

## Relational rehearsal

A second rehearsal starts the actual legacy classes in Workerd, populates synthetic records and stops the process. Its census is derived from object IDs allocated during setup. The exporter authenticates a separately supplied mapping of opaque SQLite filenames to logical object names. Pass the identity JSON path after NEW_ARCHIVE to enable semantic projection. Do not infer an account owner from a filename.

```sh
node scripts/migration/objects.mjs project "$NEW_ARCHIVE"
node scripts/migration/objects.mjs verify-projection "$NEW_ARCHIVE"
```

Physical verification of this fixture covered 15 SQLite images in seven namespaces and 25 physical table rows. The care snapshots stored in KV expanded into 1,603 care/settings rows. PostgreSQL comparison verified two credential records, two people, two legacy session digests/expiries, one family, two memberships, one directional grant, one device and two account-device references. Import ran twice. The verifier uses typed temporary tables and compares both directions with EXCEPT ALL, in addition to the encrypted image checks. Ordinary unknown fields, inactive tables and unprojected jobs remain in the physical archive. The projections are staged, and generation 1 accounts remain fenced from v2 sign-in.

Run scripts/verification/rehearse.mjs against a fresh synthetic PostgreSQL database. A new fixture gets new account IDs. Import into a database containing conflicting usernames aborts the transaction. Private media, audit history, challenge/delivery state, invitations, alarm scheduling, and encrypted client envelopes still require application-level cutover and behavioral checks. Hosted acquisition and full authorized reconciliation remain open.

## Expanded recovery drill

The final Workerd fixture includes real legacy client-side encrypted appointment and cycle fields. The private fixture writer records its own inputs before export. A separate verifier compares those inputs with the PostgreSQL credential, health, session, device, household, membership and permission values. It also opens both private fields after projection with the fixture recovery key. Verification covered 1,607 care/settings/format rows, including 1,601 water rows, across the same 15 SQLite images and seven namespaces. Import and projection ran twice.

The restore-copy command verifies PostgreSQL's stored ciphertext, writes a new 0700 namespace directory, checks each written SQLite image against its authenticated digest, and removes its incomplete marker after success. The fixture booted all seven legacy classes from this reconstructed tree. Its original runtime read back sessions, account state, grants-related household identity, binary extension data, device state, operations, promotions and pilot storage. This restores the frozen point in time. It does not replay newer writes into legacy storage.

The device archive also reconciles Maps, Sets, cyclic and shared object references, typed arrays, dates and blobs where supported by IndexedDB. Record activation rejects a divergent manifest. A historical encrypted file retains its original bytes alongside the validated care projection. A normal user backup contains portable care data. Browser credentials and session-scoped pending actions have separate lifetimes and stay in their original storage.

Chromium and WebKit each opened actual IndexedDB versions 1, 2 and 3. The tests archived the databases, edited a restored water entry, then reopened the original databases and compared the old version, original value and extension field. A legacy extension store named file remained a legacy store during import.
