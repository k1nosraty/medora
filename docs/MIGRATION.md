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
