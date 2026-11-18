# Rebuild verification

**NOT READY. Production NOT DEPLOYED.** Work was performed on the local branch `codex/medora-2-full-rebuild`. The design and behavior reference is `5ee5e47cafe7644b5dd15ae7408e909c755ee211`. No push, hosted deployment or production access occurred. The local Git commit identifies this revision. The release manifest records hashes for the separately archived candidate.

## Product and portability

The default entry opens /medication/. It includes the release screen and dialog templates, styles, art, fonts, translations, offline shell and other public surfaces. The [frontend port ledger](FRONTEND_PORT.md) records current React and TypeScript ownership, dependencies on the original modules, and the browser checks. The separate /journal/ entry retains device migration and journal workflows.

The canonical product negotiates its account writer. The native compatibility runtime preserves the original API and services while its writer is active. The PostgreSQL rehearsal uses the same care, identity and household services on Node and Workerd. Its changes include medicines, doses, appointments, routines, water, sleep, cycle, settings and sealed private fields. The release ledger identifies functionality that still depends on compatibility mode.

## Observed on local fixtures

| Verification | Result |
| --- | --- |
| Static checks and builds | Strict workspace TypeScript, original JS typecheck, ESLint with zero allowed warnings, production web and Node builds, a local Worker bundle, and standalone Wrangler development mode passed |
| Product browser regression | 80 of 80 original scenarios passed against the built candidate, across Chromium and WebKit |
| Visual reference | 1,244 public design files matched byte for byte. The complete application HTML matched after normalizing release and JS bundle identifiers. All 104 pairs matched visible geometry, styling and screenshot bytes. The matrix covers onboarding, all eight program screens, the populated water editor and the yearly water report, same-time plans with keyboard input and populated cycle history in Persian/light at 390 × 844 and English/dark at 1280 × 850 |
| Canonical accessibility | Axe reported zero WCAG 2/2.1 A or AA violations on onboarding, Today and the open water editor in all 24 browser, language and viewport observations |
| Product behavior outside the browser | 44 of 44 Node tests and 13 of 13 care checks passed. The isolated alarm suite exercised medication, water, routine, sleep, cycle, snooze and appointment notifications |
| PostgreSQL and journal | 20 migration checksums verified on initial application and repeat. All 20 Vitest checks passed across 13 files. All 18 journal Playwright scenarios passed across both engines, including historical IndexedDB upgrades. A separate interrupted service-worker installation recovered the journal offline |
| Native product fixture | Actual signup and local email, sign-in, care edits, invitations, delegated write, retry, revocation, support and restart with the fence enabled passed |
| Workerd and PostgreSQL | Local Hyperdrive, R2, browser identity, scheduled fixture email, encrypted backup and grant revocation passed. During writer transition the aligned Worker accepted a replay and rejected the old protocol. The Worker without the source fence refused the v2 mutation |
| Portable deployment assets | Three Docker images built. The temporary loopback stack ran Caddy, Node, PostgreSQL, S3, Mailpit and the native compatibility service. Restoration into a second fixture matched 58 SQL inventory lines, the compatibility volume and a signed read of the cataloged encrypted object. The isolated build used a prewarmed cache for pinned npm inputs after direct acquisition inside Docker timed out |
| Dependency audit | The pnpm production audit and original npm production audit reported zero known advisories during this run |
| Cold-start comparison | The three-trial median time to usable onboarding was 5,991 ms. The reference was 5,995 ms under the same network profile. The candidate precache grew by 244,385 bytes |

The visual comparison requires an exact stable reference paint. For composited surfaces it can request a new paint on both sides. A persistent difference fails the check. The reference asset and full-document checks run before the browser captures. The matrix and its accessibility results are recorded in the candidate archive. Complete manual screen-reader, real-device install and large-history field checks remain open.

## Data and rollback

The source was generated with seven genuine Workerd namespace classes on loopback. The stopped snapshot contained 15 SQLite images, 25 physical rows and two synthetic account owners. The PostgreSQL projection included 1,607 care, settings and format rows, sessions, memberships, a grant, device state and references. The rehearsal imported and projected twice, compared values, reopened private fields with the fixture key and booted the original runtime against the recovery copy.

Seven acknowledged care revisions across three owners were reversed, including one account created after cutover. They included creation, editing, deletion, an encrypted mixed-program update, a delegated write and a write from the normal browser UI. Household operations covered grant changes, a duplicate invitation, acceptance, group edits, deletion, revocation and replay protection. A stale legacy object call was rejected after PostgreSQL accepted its first write. The database freeze waited for a transaction already holding the shared writer lock. A process was killed after copying SQLite images. Retrying reconstructed the same state and published a single bootable namespace tree. The old runtime rejected a stale revision and accepted the recovered current revision.

The candidate accepted a live legacy session, committed a password reset and revoked the old cookie. The recovered runtime accepted the new credential and rejected the old password. It also opened the newly registered account and its first care record. The administrative path rejected an outdated confirmation tag, then revoked the fresh session with the current tag.

The rollback restored two changed reminder devices, a closed support ticket and its reply, a rollout notice, audit events and an impression. It reopened a campaign and its preview and matched the media bytes across a storage-chunk boundary. Local Workerd used the same reminder and campaign endpoints as Node, and its scheduled test deferred a due reminder under the fixture's pause setting. Provider delivery for the portable service and real-device behavior remain unverified.

Node and Workerd both streamed the administrative NDJSON export. The rehearsal checked access control and the original manifest and account fields. It reassembled the exported media chunks and matched the upload digest. Release notification integration covered a synthetic 429 response, retry, and a persisted acknowledgment under competing jobs. The rollback independently seeded a completed release batch and one device receipt, then read both through the recovered native runtime.

The ordinary post-write drill erased a newly registered account and verified that one retained encrypted backup was byte-for-byte identical in a separately provisioned PostgreSQL/S3 installation. A separate drill erased an imported account. It revoked both generations of session cookies, exercised an unavailable object store and successful retry, and booted the recovered native runtime to verify the account, care and household were absent. Recovery refused to publish when the authorized object source was absent or its bytes did not match the backup digest.

A separate fresh database delivered a password reset challenge and left it pending. Recovery detected the live challenge after freezing and refused to create a destination. Miniflare occasionally emitted an RPC stub disposal warning. Runtime readbacks and aggregate comparisons passed.

## Portable infrastructure rehearsal

The local PostgreSQL-primary Worker used Hyperdrive and R2 through Workerd without Durable Objects. A fresh compatible PostgreSQL retained the existing default until explicitly initialized. Node and Worker entry points now compose the same HTTP and background services.

The forward and reverse synthetic handoffs compared 48 tables with ordered row digests, 9 sequence positions and 109 constraints, including foreign keys, plus indexes and one backup object that was independently decrypted after transfer. The forward destination was a local Versity S3 gateway. Two independent accounts kept their sessions, four offline water actions, and directional family access. The browser kept the same origin, restarted offline across an update from the release service worker to the locally bundled Workbox router and opened a second tab. A cloned pending encrypted identity email resumed on Node. An injected S3 copy failure left the target fenced and allowed the original source to resume. A transaction holding the shared lock committed before the freeze. After Node accepted new data, the rehearsal successfully moved back to a fresh Workerd PostgreSQL/R2 target.

The hosted Hyperdrive and R2 endpoints, cloud resource quotas, real legacy snapshots and actual provider delivery are still unverified. No hosted action was performed.

## Repository cleanup re-verification

The cleanup reran the workspace and incumbent type checks, ESLint, Vite and Node builds, both local Worker bundles, 20 Vitest checks, and the incumbent's 44 Node tests, 13 care checks and alarm drill. Chromium and WebKit passed 80 scenarios on each product build and 18 journal scenarios. The 104 screenshot pairs and 24 Axe checks passed, as did interrupted service-worker recovery. The generated public icon license matched the canonical copy on disk and through Caddy.

All three legacy migration scenarios ran against fresh synthetic PostgreSQL databases. They exercised post-write rollback, refusal to publish an unsupported recovery, and imported-account erasure. The two-account PostgreSQL handoff used local Workerd, Node and Versity, preserving four offline edits, sessions, the pending outbox job, and one encrypted object. The transfer returned to Workerd after new writes.

All three Docker targets built using a private local cache of the same locked npm packages after the direct container download stalled. A separate localhost stack passed frontend and API smoke checks, account and offline replay checks, and an independent restore that matched 58 SQL inventory lines, the compatibility volume and one encrypted object read through S3. These results use synthetic data.

## Startup, sleep and frontend build verification

The candidate built with its own pnpm dependencies in a checkout that omitted the incumbent npm package and build scripts. The same checkout retained `web/ui` and `web/public`. The negative probe without `web/` failed at a translation import. The [frontend ledger](FRONTEND_PORT.md) identifies the templates, assets, controllers and compatibility paths that remain.

The startup and sleep slice passed 102 candidate browser checks in Chromium and WebKit. The exact visual comparison matched 104 reference captures. Keyboard checks opened onboarding and the nested Persian date picker, then checked Escape focus restoration. The sleep workflow exercised form validation, offline quick wake, a stored wake draft, extra record fields and a rejected stale edit. The [performance record](PERFORMANCE.md#canonical-product) records both the restored onboarding target and the separate cold dashboard handoff cost.

The local PostgreSQL checks exercised the synthetic Workerd/R2-to-Node/S3 handoff and return after four offline writes from two accounts. The separate legacy rehearsals exercised source reconciliation, refusal to publish an unsupported recovery, and imported-account erasure. No production snapshot was used.

## Outstanding release evidence

- A complete authorized source snapshot, independent namespace census, key-version references and historical backup corpus. Device upgrades and fixture reconciliation do not demonstrate coverage of real accounts, provider registrations or pending jobs.
- Remaining React and TypeScript controllers, the native-only diagnostic pilot and release delivery with actual providers. Production key continuity and pending challenge continuity remain open.
- A verified fleet drain, hosted staging using dedicated resources, real-device push and installation checks, and production-scale performance. The owner’s explicit approval is required before any future push or deployment.

The fixture commands, required bindings, abort conditions and archived candidate identity are in [the deployment checklist](DEPLOYMENT.md). Recovery semantics and approved inputs are in [the migration guide](MIGRATION.md).
