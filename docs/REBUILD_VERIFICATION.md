# Rebuild verification

**NOT READY. Production NOT DEPLOYED.** Work was performed on the local branch `codex/medora-2-full-rebuild`. The design and behavior reference is `5ee5e47cafe7644b5dd15ae7408e909c755ee211`. No push, hosted deployment or production access occurred. The exact candidate commit, file inventory and hashes are recorded in the generated release manifest.

## Product and portability

The default entry opens /medication/. It includes the release screen and dialog templates, styles, art, fonts, translations, offline shell and other public surfaces. Onboarding, the week selector and the water history have typed React presentations. Controls on a cold load work before React DOM finishes downloading. Other feature controllers still use the original modular JavaScript. The separate /journal/ entry retains device migration and journal workflows.

The canonical product negotiates its account writer. The native compatibility runtime preserves the original API and services while its writer is active. The PostgreSQL rehearsal uses the same care, identity and household services on Node and Workerd. Its changes include medicines, doses, appointments, routines, water, sleep, cycle, settings and sealed private fields. The release ledger identifies functionality that still depends on compatibility mode.

## Observed on local fixtures

| Verification | Result |
| --- | --- |
| Static checks and builds | Strict workspace TypeScript, original JS typecheck, ESLint with zero allowed warnings, production web and Node builds, and local Wrangler bundle passed |
| Product browser regression | 80 of 80 original scenarios passed against the built candidate, across Chromium and WebKit |
| Visual reference | 1,244 public design files matched byte for byte. The complete application HTML matched after normalizing release and JS bundle identifiers. All 40 pairs matched visible geometry, styling and screenshot bytes. The matrix covers onboarding, all eight program screens and the populated water editor in Persian/light at 390 × 844 and English/dark at 1280 × 850 |
| Canonical accessibility | Axe reported zero WCAG 2/2.1 A or AA violations on onboarding, Today and the open water editor in all 12 browser, language and viewport combinations tested |
| Product behavior outside the browser | 44 of 44 Node tests and 13 of 13 care checks passed. The isolated alarm suite exercised medication, water, routine, sleep, cycle, snooze and appointment notifications |
| PostgreSQL and journal | 11 migration checksums verified on initial application and repeat. All 19 Vitest checks passed across 12 files. All 18 journal Playwright scenarios passed across both engines, including historical IndexedDB upgrades. A separate interrupted service-worker installation recovered the journal offline |
| Native product fixture | Actual signup and local email, sign-in, care edits, invitations, delegated write, retry, revocation, support and restart with the fence enabled passed |
| Workerd and PostgreSQL | Local Hyperdrive, R2, browser identity, scheduled fixture email, encrypted backup and grant revocation passed. During writer transition the aligned Worker accepted a replay and rejected the old protocol. The Worker without the source fence refused the v2 mutation |
| Portable deployment assets | Three Docker images built. The temporary loopback stack ran Caddy, Node, PostgreSQL, S3, Mailpit and the native compatibility service. Restoration into a second fixture matched 33 SQL inventory lines, the compatibility volume and a signed read of the cataloged encrypted object |
| Dependency audit | The pnpm production audit and original npm production audit reported zero known advisories during this run |
| Cold-start comparison | The three-trial median time to usable onboarding was 5,997 ms. The reference was 5,995 ms under the same network profile. The candidate precache grew by 232,542 bytes |

The visual comparison requires an exact stable reference paint. For composited surfaces it can request a new paint on both sides. A persistent difference fails the check. The reference asset and full-document checks run before the browser captures. The matrix and its accessibility results are recorded in the candidate archive. Complete manual screen-reader, real-device install and large-history field checks remain open.

## Data and rollback

The source was generated with seven genuine Workerd namespace classes on loopback. The stopped snapshot contained 15 SQLite images, 25 physical rows and two synthetic account owners. The PostgreSQL projection included 1,607 care, settings and format rows, sessions, memberships, a grant, device state and references. The rehearsal imported and projected twice, compared values, reopened private fields with the fixture key and booted the original runtime against the recovery copy.

Six acknowledged care revisions across both owners were reversed. They included creation, editing, deletion, an encrypted mixed-program update, a delegated write and a write from the normal browser UI. Household operations covered grant changes, a duplicate invitation, acceptance, group edits, deletion, revocation and replay protection. A stale legacy object call was rejected after PostgreSQL accepted its first write. The database freeze waited for a transaction already holding the shared writer lock. A process was killed after copying SQLite images. Retrying reconstructed the same state and published a single bootable namespace tree. The old runtime rejected a stale revision and accepted the recovered current revision.

A separate fresh database committed a real password reset through the HTTP API and the in-memory mail sink. It revoked the session. A new database connection detected the persisted identity and delivery changes after the freeze. Recovery refused to publish an obsolete credential or create a destination. The frozen target remains authoritative for unsupported mutations. Miniflare emitted an RPC stub disposal warning during the positive rehearsal. Both runtime readbacks and the aggregate comparisons passed.

## Outstanding release evidence

- A complete authorized source snapshot, independent namespace census, key-version references and historical backup corpus. Device upgrades and fixture reconciliation do not demonstrate coverage of real accounts, provider registrations or pending jobs.
- Complete removal of the remaining legacy UI controllers and PostgreSQL equivalents for operational services, administration, promotions, account lifecycle and reminder processing. Full identity/session continuity and reverse recovery of unsupported writes are open.
- A verified fleet drain, hosted staging using dedicated resources, real-device push and installation checks, and production-scale performance. The owner’s explicit approval is required before any future push or deployment.

The fixture commands, required bindings, abort conditions and archived candidate identity are in [the deployment checklist](DEPLOYMENT.md). Recovery semantics and approved inputs are in [the migration guide](MIGRATION.md).
