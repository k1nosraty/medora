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

## Medication and dose React verification

The production medication route now uses React for its cabinet, schedule wizard, appearance, history, daily dose controls, snooze preference and delegated dose form. Today and the calendar agenda use the same React dose implementation. The build rejects the three old medication UI controllers in the input graph. The standalone product probe generated the same application HTML, bundles and service worker after omitting those controllers and the seven old medication templates. The probe isolated the separately built design gallery, which still uses the incumbent editor templates.

The workspace suite passed 23 tests with isolated PostgreSQL. The compatibility run passed its JavaScript type check, 44 Node tests, 13 care checks and the closed-client alarm drill. The strict TypeScript check, ESLint, production frontend and Node bundles and both local Worker bundles completed successfully.

On synthetic data, the medication browser tests exercise English LTR and Persian RTL at mobile and desktop widths, keyboard use, Axe, recurrence controls, stock, dose actions, custom snooze duration and navigation. Canonical IndexedDB versions 1, 2 and 3 reopened and retained dose IDs, plan and slot extensions, account metadata and stock after edits. A stale edit did not overwrite a newer revision. The product read the encrypted Android v1 fixture and displayed the restored dose history. The offline test added, edited and deleted plans, logged intake, reloaded without a network, and recovered a Workerd commit after a lost acknowledgement.

The final `pnpm test:product` runs completed with 61 passes in Chromium and 61 in WebKit when run by project. The focused recheck of offline recovery, family writes and concurrent edits completed with six passes across the two engines. The separate incumbent browser command, `npm --prefix web run test:browser`, finished with 80 passes and 42 candidate-only skips.

A focused Chromium visual run matched 28 exact medication screenshots and their visible layouts. Screenshots of WebKit medication dialogs differed in dimmed backdrop pixels by one RGB level. A reference-to-reference control reproduced the same 1,327 differences and the same two pixel digests as the English mobile candidate comparison. The full strict screenshot run and WebKit diagnostics still did not complete cleanly. A dialog-region check also measured 81 editor-header pixels that differed by one RGB level at the English mobile size. Exact pixel thresholds remain in place, and full visual verification remains open. The browser tests identified and fixed the mobile dose menu overlapping the navigation and the quick amount button’s accessible name omitting its visible digit.

The two-account PostgreSQL handoff passed with eight offline writes, including two plans and two dose logs. It retained the plans and doses across the service-worker update, compared them after Node replay and checked them again after transfer back to Workerd. The synthetic fixture also retained its sessions and encrypted object. The [medication benchmark](PERFORMANCE.md#medication-and-dose-phase) measured a 4,989 ms onboarding median and no resource requests during the three measured medication interactions.

## Appointments, routines and shared frontend work

This pass started at `676c472` on `codex/medora-2-full-rebuild`. Product React now owns appointment and routine editor and card workflows, the calendar and reports, the Today story, period and daily cycle forms, backup and restore, and the display, profile and sleep preference forms. The [migration inventory](FRONTEND_PORT.md) records the remaining family, sync, notification, settings and cycle dependencies.

| Local command | Result |
| --- | --- |
| `pnpm typecheck`, `pnpm lint`, `pnpm build` | Strict TypeScript, ESLint, Vite, canonical product and Node API builds passed. |
| `node scripts/verification/bundle-worker.mjs infrastructure/cloudflare/candidate.mjs <fixture-output>` and `node scripts/verification/bundle-worker.mjs apps/api/src/adapters/worker.ts <fixture-output>` | Both local Worker bundles completed. |
| `pnpm db:migrate` and `pnpm test` with a fresh loopback PostgreSQL database | 23 tests in 14 files passed, including PostgreSQL integration and device migration fixtures. |
| `pnpm test:compat` | Legacy JS typecheck, 44 Node tests, 13 care checks and the encrypted Web Push alarm drill passed. |
| `pnpm test:product --project=chromium` using the product Playwright config | 63 passed. The screen matrix checked all eight routes plus the reports panel in both languages and viewport sizes. |
| `pnpm test:product --project=webkit` using the product Playwright config | 63 passed. The same screens and Axe matrix completed in WebKit. |
| `pnpm test:product --grep 'exports an encrypted Web archive'` | One focused test passed in each engine. The React form downloaded a Web archive and restored it in a fresh browser profile. |
| `npm --prefix web run test:browser` | 80 incumbent checks passed and 46 candidate-only checks were skipped. |
| `pnpm test:e2e` | 18 journal browser tests passed across Chromium and WebKit. The journal store was tested separately. |
| `node scripts/verification/pwa-update.mjs` | Interrupted journal shell update, old offline shell, upgrade retry and persisted data passed. |
| `pnpm test:handoff` | Four loopback PostgreSQL databases, local Workerd/R2 and Node/S3 fixture. 48 tables, nine sequence positions, 109 constraints and one independently decrypted object reconciled. Two accounts retained eight offline medication, dose and water writes, sessions, family grants and the outbox job. The service worker updated, two tabs reopened, an injected copy failure recovered, and migration reversed after new writes. |
| `node scripts/verification/visual-parity.mjs --engine=chromium` | 1,244 static design files matched. All 80 layouts and screenshots matched exactly. 32 comparison Axe checks reported no new violations. |
| `node scripts/verification/visual-parity.mjs --engine=webkit` | The latest complete matrix had 80 matching layouts, 75 exact screenshots, one verified renderer variant and four flagged captures. All 32 comparison Axe checks reported no new violations. A subsequent diagnostic matched one of the four flagged captures to an incumbent renderer pattern. |

The product uses `web/playwright.config.mjs`, one worker and a loopback asset server. WebKit uses the iPhone 13 preset, with viewport overrides in the matrix. The Chromium tests used the installed system Chrome. The product exercised historical IndexedDB v1–3 reads and edits, offline visit edits and attendance with preserved fields, offline routine completion, quantity and checklist logging, encrypted Android v1 restore, lost Workerd acknowledgement, user sessions and delegated writes. The branch continues to use the same API contracts, IndexedDB, crypto and worker scopes.

The isolated build used the workspace dependency tree without `web/node_modules`, `web/package.json` or `web/scripts`. In the same fixture directory, builds with and without the nine replaced appointment, routine, backup, cycle period, report and Today story controllers produced byte-identical canonical HTML, bundles and service worker. The product screen matrix also aborts dynamic requests to these controllers. Serving the fixture with those files physically absent passed 14 focused browser checks across both engines, including offline appointment and routine writes, the encrypted Web archive round trip, and the bilingual Axe screen matrix. The probe retained the shared templates, locale, styles and assets under `web/`. A separate fresh build with the entire directory absent failed to resolve `care-plan.js` and the journal font.

WebKit 27.2 produced different paints with identical layout. The English mobile details backdrop matched the same two exact RGB digests in the candidate and an unchanged incumbent control. The comparison requires exact RGBA equality outside the affected area. English desktop details and editor also reproduced exact full-viewport per-channel difference digests in independent incumbent runs. The latest browser run accepted the 3,886-pixel desktop details case. Its 2,055-pixel desktop editor difference matched the header-only portion of the independently observed 4,949-pixel incumbent difference, with exact equality outside that portion. The final matcher was checked directly against both editor patterns and the other known renderer captures. The version, viewport and scene restrictions remain in place.

The latest complete browser run still flagged the English mobile editor (81 pixels), English mobile schedule (78 pixels) and English desktop schedule (2,824 pixels). Each had at most a one-level difference per RGB channel. Their exact difference patterns remain unverified. The validator exits with a failure for those captures, and a fresh full matrix with the final editor matcher has not been recorded.

The production release gate still requires reconciliation against a complete authorized source snapshot. The exact visual and handoff counts in the archive manifest script also need to be reconciled with the expanded fixtures. No release archive was generated in this pass.

The cold onboarding median was 4,541 ms versus 5,087 ms on a new baseline. In a separate run the focused dashboard median after an immediate click was 7,289 ms versus 7,555 ms. See the [performance measurements](PERFORMANCE.md#appointments-routines-and-shared-frontend-migration).

## Account, preferences, Cycle tools and frontend source independence

The rebuild started clean at `eb063ce`. A fresh typecheck, lint and frontend build passed. The baseline visual run matched 160 visible layouts, 155 exact screenshots and one previously established WebKit rendering variant. Four captures differed.

The canonical frontend now builds from `apps/web`, `packages` and branding. The compatibility build generates its own `web/public` from the shared source. The canonical JavaScript input guard rejects the top-level `web/` directory, the old account and sync controllers, and the other previously replaced UI controllers. Legacy family, notification and daily Cycle UI still run from the relocated workspace sources.

| Command or fixture | Completed result |
| --- | --- |
| `pnpm typecheck`, `pnpm lint`, `pnpm build` | Passed frontend and Node production build, lint and typecheck. Both Worker bundle commands and the local Docker compatibility image build also passed. |
| `pnpm test` after fixture PostgreSQL migration | 23 tests passed across 14 files. |
| `pnpm test:compat` | 44 compatibility tests, 13 care tests and the closed-client alarm check passed. |
| `pnpm test:product` | 65 Chromium and 65 WebKit tests passed. The run included the eight primary routes, reports, Axe, four RTL/LTR viewport combinations and the Workerd-backed workflows. |
| `pnpm test:product --grep 'cycle daily log\|cycle bulk history\|the product installs an updated worker'` | Three follow-up cases passed per engine with the final Cycle validation and worker upgrade check. |
| `npm --prefix web run test:browser` | 41 incumbent tests passed per engine. The 50 candidate-only cases were skipped as configured. |
| `pnpm test:e2e` and `node scripts/verification/pwa-update.mjs` | Nine journal browser tests passed per engine. Interrupted installation, previous offline shell, retry and device data checks passed. |
| `node scripts/verification/frontend-independence.mjs --offline` | Frozen install, production frontend build and 55 cases per engine passed in a temporary source copy that excluded all of `web/`. The route matrix recorded zero forbidden requests. The worker upgrade case compared the original IndexedDB water records before and after an offline reload. |
| `pnpm test:handoff` | Local PostgreSQL and loopback S3-protocol fixtures reconciled 48 tables, 9 sequences, 273 constraints and one decrypted backup object. Two accounts kept eight offline writes, sessions and a directional grant across a same-origin Workerd-to-Node switch and reverse recovery. The fixture also checked outbox delivery, a failed object copy, a concurrent writer drain and two-tab service-worker recovery. |
| `node scripts/verification/rehearse.mjs` with no flag, `--unmapped` and `--erase-imported` | All three fresh loopback rehearsals completed. They verified the legacy writer fence, mapped post-write rollback, refusal to publish an unsupported reverse mapping, and imported-account erasure with deferred backup cleanup. |
| `node scripts/verification/visual-parity.mjs` | Both engines passed the full run with 160 matching layouts, 157 exact captures, three incumbent renderer variants, zero remaining mismatches and zero candidate Axe violations in 64 samples. |

The earlier English mobile medication editor differed at 81 pixels by one channel level. An incumbent-only control matched the alternate paint under WebKit 27.2. The earlier English mobile and desktop schedule pairs differed at 78 and 2,824 pixels respectively, each by at most one channel level. Both schedules matched exactly in the completed run. The same run accepted the Persian and English desktop appearance captures only after independent incumbent paints matched. No pixel thresholds or reference images were changed. An additional incumbent-only replay still showed a desktop medicine-details raster mismatch with identical geometry. The controlled results establish compositor variability, while the exact cause of every individual differing schedule pixel remains unproven.

Synthetic device and Workerd cases exercised IndexedDB v1–v3 medication and dose edits with extensions, reconnect and lost acknowledgement, private recovery key rotation, encrypted Android and Web archives, and the separate encrypted Cycle archive. The production reconciliation gate still requires a complete authorized source snapshot, independent census, relevant key-version references and the backup corpus. The workspace contains synthetic evidence. The gate is **BLOCKED** and release stays **NOT READY**.

## Final React ownership verification

The starting checkout on `codex/medora-2-full-rebuild` was clean at `8052d1a`. A fresh checkout without the root `web/` directory passed its frozen install, frontend build and 110 baseline browser checks. The ownership changes replaced the incumbent Family, notification, Settings and Cycle controllers in the canonical graph. The remaining Today card factories now render their shared React card contents directly. The family and device protocol cases use isolated loopback fixtures. Their settings and family dialogs passed additional scoped Axe scans in both browser engines.

| Verification | Completed result |
| --- | --- |
| `pnpm typecheck`, `pnpm lint`, `pnpm build` | Passed typecheck, lint and frontend and API production builds. Both local Worker bundles completed. |
| `pnpm test` after migrating an isolated PostgreSQL fixture | 23 tests passed across 14 files. |
| `pnpm test:compat` | 44 compatibility tests and 13 care tests passed. The closed-client alarm fixture completed. |
| `pnpm test:product --project=chromium` and `--project=webkit` | 68 cases per engine passed, including the Family and device notification action fixtures, eight-route Persian and English desktop and mobile Axe matrix, encrypted restore and lost-acknowledgement recovery. A focused rerun added Axe assertions for the open Family and device settings dialogs and passed two cases per engine. |
| `node scripts/verification/frontend-independence.mjs --offline` | 57 cases per engine, 114 total, passed after a frozen install and production build with all of `web/` physically absent. The route matrix recorded zero forbidden requests. Both engines updated the worker and matched the original IndexedDB records after an offline reload. |
| `npm --prefix web run test:browser` | 41 incumbent cases per engine passed. 54 candidate-only cases were skipped as configured. |
| `pnpm test:e2e` and `node scripts/verification/pwa-update.mjs` | Nine Journal cases per engine passed. The interrupted install, old-shell offline recovery, update retry and journal persistence checks completed. |
| `pnpm test:handoff` | Synthetic Workerd/R2 and Node/S3 protocol fixture passed reconciliation of 48 tables, 9 sequences, 273 constraints and one independently decrypted backup object. Two accounts kept their sessions, directional access and eight offline changes. Reverse recovery after writes, failed copy recovery, writer drain, outbox resumption and worker update completed. |

The full reference visual run completed 160 exact layout comparisons, checked 1,244 design assets and produced zero candidate Axe violations in 64 samples. It recorded 155 exact captures, two verified reference paint variants and three strict WebKit screenshot mismatches. An isolated WebKit rerun matched 78 of 80 captures exactly and one through the existing reference-paint check. The remaining English desktop medication appearance capture differed at 243 pixels by at most one channel level. A fresh build of starting commit `8052d1a` produced byte-identical original and candidate images for that failing pair and the English mobile medication schedule pair. The original combined run also found a Persian desktop appearance difference at 118 pixels, which matched exactly on the rerun. The visual comparison thresholds and incumbent reference commit are unchanged. The frontend acceptance status remains **INCOMPLETE** while the strict visual command exits unsuccessfully.

Historical IndexedDB versions 1–3, encrypted Android and Web archive restore, separate Cycle archive import and export, and family revocation were exercised with synthetic fixtures. Device enrolment, permission denial, retry, private notification details and provider response were independently modeled by the browser fixture. Physical device delivery and a complete authorized source reconciliation remain separate release gates. See [performance](PERFORMANCE.md#family-notifications-today-settings-and-cycle-ownership) for the comparable cold benchmark.

## Outstanding release evidence

- A complete authorized source snapshot, independent namespace census, key-version references and historical backup corpus. Device upgrades and fixture reconciliation do not demonstrate coverage of real accounts, provider registrations or pending jobs.
- Remaining React and TypeScript controllers, the native-only diagnostic pilot and release delivery with actual providers. Production key continuity and pending challenge continuity remain open.
- A verified fleet drain, hosted staging using dedicated resources, real-device push and installation checks, and production-scale performance. The owner’s explicit approval is required before any future push or deployment.

The fixture commands, required bindings, abort conditions and archived candidate identity are in [the deployment checklist](DEPLOYMENT.md). Recovery semantics and approved inputs are in [the migration guide](MIGRATION.md).
