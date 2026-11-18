# Deployment checklist

**NOT READY · Production NOT DEPLOYED.** The release branch is `deploy`. The local candidate is on `codex/medora-2-full-rebuild`, based on `5ee5e47cafe7644b5dd15ae7408e909c755ee211`. Pushing the release branch publishes the incumbent Worker and queues a public release notification.

The owner requires separate explicit approval for every push or deployment, including staging and preview. This hold applies to subsequent work. All verification in this revision is local.

## Candidate identity and verification

Build from a clean candidate checkout with Node 24.18.0, pnpm 10.32.1 and the pinned Wrangler installed under web/. The generated release-manifest.json identifies the exact Git commit and branch and records the size and SHA-256 of every web, API and Worker output. These files are reproducible verification inputs for this candidate. Freeze a new manifest when code, bindings or build inputs change.

```sh
pnpm install --frozen-lockfile
npm ci --prefix web
pnpm typecheck && pnpm lint
pnpm build
mkdir -p dist
web/node_modules/.bin/wrangler deploy --dry-run --config infrastructure/cloudflare/local.json --outdir "$PWD/dist/worker"
# Supply a separate fresh loopback fixture database for each drill.
MEDORA_TEST_DATABASE_URL="$MAPPED_FIXTURE_URL" node scripts/verification/rehearse.mjs > dist/reconciliation.json
MEDORA_TEST_DATABASE_URL="$UNMAPPED_FIXTURE_URL" node scripts/verification/rehearse.mjs --unmapped > dist/recovery-refusal.json
MEDORA_TEST_DATABASE_URL="$ERASURE_FIXTURE_URL" node scripts/verification/rehearse.mjs --erase-imported > dist/imported-account-erasure.json
node scripts/verification/visual-parity.mjs > dist/visual-parity.json
node web/browser/measure.mjs apps/web/dist 3 > dist/performance-product.json
node scripts/verification/artifacts.mjs dist/worker > dist/release-manifest.json
```

The static app is in apps/web/dist, the portable Node server is apps/api/dist/server.mjs and the dry-run Worker bundle is in dist/worker. The local Worker configuration has no production routes and declares seven separate local Durable Object bindings.

## Isolated database and migration

1. Establish a private, authorized frozen copy, its independent object census, identity mapping and source time. Confirm completeness for all seven namespaces, including accountless devices, unknown data and pending operations. Save the current Worker version, code, configuration references, object inventories and encrypted backups for recovery. Preserve each device's original origin, IndexedDB, active tab and push registration.
2. Set DATABASE_URL to the isolated PostgreSQL target and MEDORA_ARCHIVE_KEY_FILE to a private key file outside the checkout. Apply `pnpm db:migrate` twice. Both runs must verify all migration checksums. In order the migrations are 001_care, 002_archives, 003_legacy_projection, 004_identity, 005_families, 006_writer_transition, 007_care_documents, 008_transition_state, 009_household_policies, 010_invitation_history, 011_require_source_fence, 012_identity_recovery, 013_portable_reminders, 014_portable_operations, 015_portable_promotions, 016_registration_recovery, 017_backup_recovery, 018_account_deletion and 019_release_notifications.
3. Run the following against the frozen **copy**. Export writes a fresh archive. The importer authenticates parts and checkpoints each object. The verifier independently reads the target. The final restore command creates a new private directory and refuses an existing destination.

```sh
node scripts/migration/objects.mjs export "$FROZEN_DO_COPY" "$INDEPENDENT_CENSUS" "$NEW_ARCHIVE" "$OBJECT_IDENTITIES"
node scripts/migration/objects.mjs import "$NEW_ARCHIVE"
node scripts/migration/objects.mjs import "$NEW_ARCHIVE"
node scripts/migration/objects.mjs verify "$NEW_ARCHIVE"
node scripts/migration/objects.mjs project "$NEW_ARCHIVE"
node scripts/migration/objects.mjs verify-projection "$NEW_ARCHIVE"
node scripts/migration/objects.mjs restore-copy "$NEW_ARCHIVE" "$NEW_RECOVERY_COPY"
```

4. Compare tenant-scoped counts, primary keys, original IDs, session expiry and revocation, owner epochs, family direction and expiry, encrypted values, settings, derived schedules and pending operations with evidence from the source. Require both SQL set comparisons to be empty. Restore the archive to a second isolated runtime and open it using the legacy application.
5. Exercise each supported source version, interrupted import and restart. Validate backup decryption and reconciliation against independently recorded values. Physical preservation also covers data lacking a promoted application mapping. Review those mappings before writer activation.

A stopped local Workerd database has a different acquisition procedure from a hosted namespace. The fixture exporter cannot acquire live Cloudflare databases. See MIGRATION.md for measured coverage.

## Docker and VPS

For a disposable rehearsal, use an unused private path and a unique Compose project name. The generator uses exclusive file creation and mode 0600. Keep the application origin on loopback. The local mail sink accepts only fixture traffic.

```sh
node scripts/verification/local-env.mjs "$PRIVATE_FIXTURE_ENV"
docker compose --env-file "$PRIVATE_FIXTURE_ENV" -p medora-fixture up -d --build --wait
set -a
. "$PRIVATE_FIXTURE_ENV"
set +a
MEDORA_TEST_COMPOSE_ENV="$PRIVATE_FIXTURE_ENV" MEDORA_TEST_COMPOSE_PROJECT=medora-fixture node scripts/verification/runtime.mjs http://127.0.0.1:8808
node scripts/verification/accounts.mjs http://127.0.0.1:8808 http://127.0.0.1:8810
bash scripts/verification/restore-compose.sh "$PRIVATE_FIXTURE_ENV" medora-fixture "$NEW_PRIVATE_RECOVERY_DIR"
docker compose --env-file "$PRIVATE_FIXTURE_ENV" -p medora-fixture stop
```

The stack serves the frontend and API through Caddy on port 8808 and Mailpit on loopback port 8810. PostgreSQL and S3 are reachable on the project network. MEDORA_PORT and MEDORA_MAIL_PORT override the host ports. MEDORA_PUBLIC_ORIGIN controls the external origin on a trusted reverse proxy. For a hosted VPS, terminate TLS on the approved origin, use the authorized database and S3 endpoint with a dedicated bucket-scoped identity, supply application keys through the host secret manager and configure the intended verified mail sender. The Compose gateway uses local development credentials and the Mailpit sink.

## Cloudflare staging

Local Workerd exercised PostgreSQL through the Hyperdrive simulator, R2, scheduled mail to Mailpit, two-account browser sharing, offline reconnection and password reset. The dry-run bundle includes frontend assets. Reproduce against an isolated loopback database by setting MEDORA_TEST_DATABASE_URL and running node scripts/verification/worker.mjs http://127.0.0.1:8810. Repository and environment discovery found no identified isolated remote PostgreSQL/Hyperdrive configuration or complete authorized source snapshot. A hosted staging deployment requires positive confirmation of the database, bucket, account and key registry boundaries.

| Binding or setting | Purpose |
| --- | --- |
| MEDORA_LEGACY_WRITES_FENCED | Explicit source writer freeze during a coordinated rehearsal |
| PILOT, REMINDERS, EMAIL_ACCOUNTS, CREDENTIALS, PROMOTIONS, OPERATIONS, FAMILIES | Dedicated compatibility namespaces with their own SQLite migration, service keys and rate-limit bindings |
| EMAIL_SESSION_KEY | The authorized legacy signing-key reference for session continuity and admin confirmation tags |
| REMINDER_SIGNING_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT | Dedicated reminder enrollment and delivery keys. Rehearsals use independent synthetic keys and pause delivery |
| MEDORA_RELEASE | Version eligible for the release notice. Supply the deployed 40-character commit identifier for a separately approved rollout |
| ADMIN_EMAIL, SUPPORT_EMAILS, PROMOTION_MEDIA_HOSTS | Explicit administrator, support and approved external media host configuration |
| ASSETS | Vite distribution, static CSP and revisioned service worker |
| HYPERDRIVE | Isolated PostgreSQL connection with the nineteen migrations applied |
| BACKUPS | Private staging R2 bucket containing encrypted account backups |
| MEDORA_PASSWORD_KEYS, MEDORA_CURRENT_PASSWORD_KEY | Versioned pepper registry and current key name |
| MEDORA_CODE_KEY, MEDORA_MAIL_KEY | Independent challenge HMAC and outbox encryption keys |
| MEDORA_FROM, RESEND_API_KEY | Stage-specific verified sender and restricted delivery token |
| MEDORA_STAGE_ACCOUNT, MEDORA_STAGE_HYPERDRIVE, MEDORA_STAGE_BUCKET | References consumed by the staging configuration renderer |
| Node-only DATABASE_URL, S3_ENDPOINT, S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY | PostgreSQL and S3 adapters for VPS |
| Compose-only MEDORA_DB_PASSWORD, MEDORA_STORAGE_SECRET, MEDORA_MAILPIT | Development database, storage and mail sink |

Render with `node infrastructure/cloudflare/staging.mjs`. Validate with `web/node_modules/.bin/wrangler deploy --dry-run --config infrastructure/cloudflare/.staging.generated.json`. Hosted execution requires separate owner approval and verified dedicated resource and secret references. The generated configuration targets medora-v2-staging on workers.dev and a one-minute cron for delivery retries. Test registration, verification mail, revocation, sync, backup, service worker upgrade, security headers and recovery on its actual HTTPS origin. Record the hosted Worker version, binding identities, checksums and aggregate results.

## Rollback and abort criteria

- Before opening writes, retain the incumbent version ID, a consistent SQL dump, a verified object copy, all required secret version references, original namespace images and the authenticated source manifest. Preserve staged resources separately.
- For a hosted staging code rollback to a previously verified version, use `web/node_modules/.bin/wrangler rollback "$PREVIOUS_STAGE_VERSION" --config infrastructure/cloudflare/.staging.generated.json`. A code rollback alone cannot transfer records between databases.
- For the local pre-write recovery drill, stop the candidate services with the scoped Compose stop command above. Restore the frozen namespace copies into a fresh location with restore-copy. Reject a destination containing .incomplete. Exercise the incumbent against the restored copy and compare its source census. The Compose recovery script verifies a separate return to the rebuilt database and object store.
- After accepting new writes, retain both stores and freeze both writers. Reconcile the new durable journal, local pending edits, account changes and family policies before selecting an authoritative generation. Care, household, completed registration and password reset, administrator deletion, reminders, release state, support, operational settings, promotions and the rebuilt backup catalog have tested fixture reverse paths. Pending challenges, unfinished backup reservations or cleanup, unavailable backup bytes and unsupported mutations block publication. Returning traffic to the older writer before that reconciliation risks lost updates.
- Abort on any census or digest mismatch, missing or ambiguous identity, unauthorized target, duplicate primary key, nonempty reconciliation difference, changed migration checksum, missing production capability, unreadable backup, stale writer, incomplete rollback exercise or hosted smoke failure. Keep original and target evidence for investigation.

A future production release still requires feature parity, complete authorized source reconciliation, proven hosted staging, client-generation fencing, tested post-write rollback and explicit deployment approval. The current release branch and production data were untouched.

## Verification record for this candidate

[Rebuild verification](REBUILD_VERIFICATION.md) records tests against the candidate artifact and the exact boundary of the local data rehearsal. The archive and accompanying release manifest identify the candidate commit. No hosted CI run, staging rollout or production deployment occurred.
