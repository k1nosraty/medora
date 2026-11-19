# Rebuild verification

**NOT READY. Production NOT DEPLOYED.** The verification branch is `codex/medora-2-full-rebuild`. The design and behavior reference is `5ee5e47cafe7644b5dd15ae7408e909c755ee211`. No hosted deployment or production access occurred. The Git commit and local release manifest identify the candidate and its fixture evidence.

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

## Local gateway layout regression

The Caddy run exposed a collapsed Today calendar that the previous browser fixture missed. The gateway blocks inline style attributes. The React mount points now use a versioned, precached stylesheet. The family icon uses SVG presentation attributes for the original accent colors, and a successful first launch leaves the startup retry button hidden. The browser fixture now enforces the inline-style restriction and checks the mount points, calendar geometry, and family gradient.

The web service was rebuilt on the existing loopback stack at `127.0.0.1:8808`. Synthetic first-run screenshots matched the design reference exactly at widths of 457 and 565 in Persian and 1280 in English using Chromium, and at 565 in Persian using WebKit. Chromium also exercised day navigation, reports, account access, and an offline reload with the new stylesheet served from the service-worker cache. The full visual run against the same image's assets matched all 160 screenshots and layouts and reported zero candidate violations across 64 Axe samples. The reference commit and pixel thresholds stayed the same.

All 69 Chromium product cases passed in the combined run. After the new regression test distinguished WebKit's native select styling from application style violations, the focused rerun passed in both engines and the WebKit project completed with 69 passes.

## Repository audit follow-up

The audited starting checkout was `ea90f73` on `codex/medora-2-full-rebuild`. The compatibility Worker and test fixtures moved into the pnpm workspace. Shared browser rules, backup crypto and server helpers moved to their respective packages. The primary product keeps its own shell and the Journal keeps a separate entry. The old root `web/` has no tracked files. Existing ignored local state stayed in place.

| Verification | Completed result |
| --- | --- |
| `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm build` and `bundle-worker.mjs` | Frozen installation, frontend and Node production builds, and both the combined and portable Worker bundles completed. |
| `pnpm test` with a dedicated loopback PostgreSQL database | 26 tests passed across 16 files. Included all 940 generated image hashes, evidence contract checks, fixture-target refusal, and the read-only release endpoint. Reapplying migration verified all 20 checksums. |
| `pnpm test:compat` and `node scripts/verification/product-runtime.mjs` | 44 compatibility tests, 13 care tests, alarm behavior and the standalone Workerd product runtime. |
| `pnpm test:incumbent` | 41 cases per engine passed. 60 candidate-only cases were skipped as configured. |
| `pnpm test:product` | 71 cases per engine passed. Included historical IndexedDB v1–v3, the encrypted Android archive, delegated dose retry, access revocation, the lost Workerd acknowledgement, and the route matrix. An earlier parallel run hit a trace-output collision in teardown. Each suite now has its own output directory. |
| `node scripts/verification/frontend-independence.mjs --offline` | Frozen install from the populated store, production frontend build and 60 cases per engine passed with both `web/` and `apps/compat-worker/` physically absent. Included the RTL/LTR route matrix, zero forbidden legacy requests, offline IndexedDB edits, encrypted Web backup and service-worker upgrade. |
| `node scripts/verification/visual-parity.mjs` | 160 exact layouts and captures, zero remaining mismatches, and zero candidate violations in 64 Axe samples. Compared 1,243 identical public design files and one verified gallery markup change. |
| `pnpm test:e2e` and `node scripts/verification/pwa-update.mjs` | Nine Journal cases per engine passed. Interrupted upgrade, old-shell offline recovery, update retry and Journal persistence passed. |
| `node scripts/verification/rehearse.mjs` in all three modes | Reconciled the mapped synthetic source, verified rollback after writes, blocked unsupported reverse publication and recovered deferred cleanup of the erased fixture account. |
| `pnpm test:handoff` | 48 tables, nine sequences and 109 constraints matched in this PostgreSQL 17 fixture. Two accounts replayed eight named offline writes, retained sessions and the family grant, and independently decrypted the transferred backup. The test verified reverse recovery after writes, writer drain, failed object-copy recovery, outbox resume and two-tab worker upgrade. |
| Isolated Compose, `runtime.mjs`, `accounts.mjs`, `worker.mjs` and `restore-compose.sh` | Loopback Node/Caddy and Workerd passed PostgreSQL, R2/S3, identity, scheduled mail and family grant workflows. The restore verified database rows, sequences and one encrypted object. Used a new Compose project and left the original local stack independent. |
| `pnpm audit --prod --audit-level high` | No known advisories were reported for the installed production graph at verification time. |

The visual fixture independently compares the incumbent design. Its normalized water chart uses the historical two-row control for that comparison. The product test and direct loopback screenshots also exercise the actual single-row control in Persian RTL and English LTR, verify a single labelled select between the two date arrows and test day, week, month and year navigation. The compiled artwork and its public URLs are byte-identical for all 940 activity colors.

A separate fresh-WebKit probe behind the Caddy gateway intermittently timed out before or during the welcome interaction when opening `?view=insights` with service workers enabled. The same probe reproduced the timeout on the starting build and the candidate with the same gateway configuration. The direct mobile and desktop screenshots used service workers blocked for that WebKit check. The standalone fixtures passed service-worker update and IndexedDB persistence on WebKit. The gateway timeout remains unclassified and needs a Safari device and network trace before release.

Release status now reads the configured version. Only scheduled work queues a notification. Synthetic receipts and provider doubles cover retry and replay. The source snapshot, independent namespace census, authorized key-version references and historical backup corpus remain required. Source reconciliation is **BLOCKED** and production is **NOT READY**.

## Final architecture and quality review

This run started from clean `9f8a92b` on `codex/medora-2-full-rebuild`. The candidate and starting benchmark build both used the frozen pnpm lockfile. Browser and backend checks used newly provisioned loopback fixtures and synthetic records.

| Verification | Fresh result |
| --- | --- |
| `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, both `bundle-worker.mjs` entries | Passed. The dependency audit reported zero known production dependency advisories. |
| Two `pnpm db:migrate` invocations, then `pnpm test` | All 20 migration checksums verified. 26 tests passed across 16 files, zero failed or skipped. |
| `pnpm test:compat`, `product-runtime.mjs` | 44 compatibility and 13 care tests passed, zero failed or skipped. The encrypted closed-client alarm and standalone Workerd product scenarios completed. |
| `pnpm test:product` | 72 Chromium and 72 WebKit passed, zero failed or skipped. Included the additional delayed-bundle Insights case, historical IndexedDB, lost acknowledgement, delegated grants, archive recovery, offline upgrade and the RTL/LTR and responsive Axe matrix. |
| `pnpm test:incumbent` | 41 per engine passed. 62 candidate-only cases were skipped and zero failed. |
| `frontend-independence.mjs --offline` | 61 per engine passed with both `web/` and `apps/compat-worker/` physically absent. No forbidden request appeared in the primary browser matrix. |
| `pnpm test:e2e`, `pwa-update.mjs` | Nine Journal tests per engine passed, zero failed or skipped. The interrupted update, retry, cached shell and persistence scenario completed. |
| `visual-parity.mjs` | First run failed on one English 390 px WebKit Cycle screenshot. The 3,143 changed pixels had a maximum channel delta of 3. The complete unchanged rerun passed 80 layouts and captures per engine, and all 64 Axe samples had zero candidate violations. No thresholds or baselines were changed. |
| `postgres-handoff.mjs` | Final frontend build passed Workerd/R2 to Node/S3 and reverse handoff. 48 tables, nine sequences and 109 constraints matched. Two accounts retained all eight offline writes, the family grant, sessions and an independently decrypted object. |
| `rehearse.mjs` in all three modes | The mapped rollback, unsupported recovery refusal and imported-account erasure drills passed against separately created fixture databases. |
| Compose, `runtime.mjs`, `accounts.mjs`, `worker.mjs`, `restore-compose.sh` | Node/Caddy, loopback registration and mail, owner-bound sync, Caddy policy coverage and signed object restore passed. The first standalone Workerd attempt failed to start. A fresh invocation passed real PostgreSQL and R2, scheduled mail and browser recovery. Restore matched database rows, sequences, compatibility state and the encrypted catalog object. |

The primary build no longer uses fourteen obsolete resolver aliases. Its browser matrix and compiler now check the same incumbent module paths. The new deliberate dashboard delay on a fresh Insights link produced one expected failing Chromium control against the baseline. The final build passed both engines. The [ownership ledger](FRONTEND_PORT.md) and [performance results](PERFORMANCE.md#final-architecture-review) describe the scope.

### Fresh WebKit and Caddy controls

The independent Caddy matchers now deliver the existing HTTPS media policy on the medication, administration and campaign preview routes. The previous default header overwrote that policy. The worker, Journal and design paths retain the default policy. This header correction and the quicker Insights onboarding were verified separately from the timeout.

Playwright 1.64.1 WebKit 27.2 ran at 390 × 844 with fresh contexts and the same local Caddy configuration. Three worker-enabled trials each timed out on the incumbent `5ee5e47`, the starting build `9f8a92b`, and the final candidate. The incumbent stopped at welcome interaction or Reports. The starting build stopped at welcome visibility or interaction. All three candidate trials reached Insights and then stopped at the Reports click. The committed probe also reproduced a candidate timeout at welcome interaction. One worker-blocked control per build passed. The same final candidate served directly by the Node browser fixture passed all three worker-enabled attempts, including worker activation and the offline Insights reload.

Caddy logged zero static HTTP errors in these traces. The longest static request took at most 9 ms on the server, and the only non-success page response was the expected anonymous family `401`. The failing traces contained responses from the worker. In a separate candidate run, even a bounded page-side read stopped responding after onboarding. The Caddy and worker combination reproduced the symptom in this environment. The evidence cannot distinguish WebKit process or automation behavior from a browser interaction with the gateway and worker lifecycle. The original check remains a nonzero exit on timeout.

Run `timeout 35s node scripts/verification/insights-gateway.mjs http://127.0.0.1:<fixture-port>` against a local Caddy fixture. Use `--block-worker` for the separate control. Repeat with a clean browsing profile in native macOS Safari and on an iPhone, including Safari and the installed web app. Serve the same synthetic fixture over trusted isolated HTTPS. Open the Insights link from a fresh origin and again with an active worker, then verify offline reload. Collect Web Inspector network timings, worker registration and controller transitions, cache state, and the matching Caddy request log from a failing run. [Playwright WebKit platform scope](https://playwright.dev/docs/browsers#webkit)

### Follow-up on the Insights timeout

Starting from `4b4f4ee`, Linux WebKit 27.2 reproduced the timeout with three fresh contexts against the isolated Caddy fixture. Changing only the push configuration from unavailable to available reproduced the timeout in three of three trials against both the synthetic response fixture and the proxied development API. All six unavailable controls completed through worker activation and offline reload. The platform returned a promise from `PushManager.getSubscription()` at startup, and none of the three traced promises resolved before the interaction timed out. A diagnostic that replaced only that call with a resolved empty result completed all three trials while keeping the real Service Worker and notification configuration enabled.

Reminder setup now reads the browser subscription only when an enrollment token is stored. Devices without an enrollment still initialize the notification controls, and subscription creation begins from the existing Enable gesture. The corrected build passed five consecutive Caddy runs with the Service Worker enabled, including an offline Insights reload in each run. An additional diagnostic confirmed the successful push configuration response and zero subscription reads on first visit. The strengthened notification regression failed on the starting build because it performed one read before enrollment. It passed in both test browsers with the fix and confirmed that subscription reads still occur after enrollment. Ten focused product cases and all 57 compatibility and care cases passed. The compatibility alarm verification and the production build, typecheck, and lint passed.

### Native iPhone Safari result

On 2026-11-19, the tester confirmed that Reports opened online and offline in a native Safari tab on an iPhone. The isolated HTTPS Caddy fixture served the corrected build from `599679b`. At 16:20:09 Tehran time, the corrected origin logged a `204` diagnostic with `secure=true`, `controlled=true`, `shell=true`, and `ios=true`. This confirms a secure context, page control by the medication Service Worker, and the presence of the shell cache. The offline result comes from the tester's observation because an offline view does not reach Caddy.

The iPhone requests reached the corrected origin. The access log contains no iPhone request for `?view=insights` or to the previous-build origin, so it does not establish direct-link timing or a prior-build comparison. macOS Safari and the iPhone Home Screen app remain untested. The iPhone Safari tab result passes. Release remains **NOT READY**, with the separate source reconciliation gate still open.

### Automated Safari coverage

The browser suite exercises iPhone tab and Home Screen modes in Chromium and WebKit. It verifies the installation message or notification controls, checks that first launch performs zero subscription lookups, and reloads a direct Reports link offline with a real medication Service Worker and a synthetic IndexedDB record. The operating-system notification permission and push provider are simulated.

`pnpm verify:safari` can exercise the same direct route behind Caddy in native macOS Safari. Build the app first, make Caddy available on PATH, and enable Safari WebDriver with `safaridriver --enable`. The command starts loopback-only fixtures, checks for a controlling Service Worker, stops its own Caddy process and verifies the offline reload. Linux verified the Caddy configuration and the platform guard. Running the Safari session requires a Mac. [Apple Safari WebDriver](https://developer.apple.com/documentation/webkit/testing-with-webdriver-in-safari)

### Final local verification from `17c98c5`

All data and services used here were synthetic loopback fixtures. The browser commands used system Chrome and Playwright WebKit.

| Command or fixture | Fresh result |
| --- | --- |
| `pnpm install --frozen-lockfile`, `pnpm audit --prod --audit-level=high`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, compatibility build and both Worker bundles | Passed. No known production dependency vulnerability reported. |
| `pnpm db:migrate` twice, then `pnpm test` | All 20 migration checksums verified on both runs. 26 passed in 16 files. |
| `pnpm test:compat` | 44 compatibility and 13 care tests passed, plus the closed-client alarm verification. |
| `pnpm test:product` | Chromium 74 passed. WebKit 74 passed. No failures or skips. The new iPhone tab and installed-mode cases passed in both engines. The focused setup initially failed in WebKit because the page-scoped API mock did not reach a service-worker-controlled request. Moving the response to the loopback fixture fixed the test setup. |
| `pnpm test:incumbent` | Each engine passed 41 and skipped 33 candidate-only cases. No failures. |
| `pnpm test:e2e`, `node scripts/verification/pwa-update.mjs` | Journal and shared browser checks passed 9 per engine, including IndexedDB v1–v3 and encrypted backup. Interrupted Service Worker update and offline recovery passed separately. |
| `node scripts/verification/frontend-independence.mjs --offline` | Frozen install and production build succeeded with both root `web/` and `apps/compat-worker/` physically absent. Each engine passed 63 checks. The browser request guard passed. |
| `node scripts/verification/visual-parity.mjs` | Each engine matched all 80 screenshots and passed 32 accessibility comparisons. No mismatches, renderer allowances or threshold changes. |
| `node scripts/verification/insights-gateway.mjs <loopback-caddy-origin>` | Three of three fresh WebKit contexts completed direct navigation, Reports and offline reload with a controlling Service Worker. Online Reports took 678–1,223 ms on loopback. |
| `pnpm verify:source --synthetic …`, `node scripts/verification/rehearse.mjs` in normal, unmapped and erasure modes | Reconciled 7 namespaces, 15 images, 25 physical rows and 1,607 projected care records. Frozen source hashes stayed unchanged. Remote and occupied database targets and output inside the source tree were rejected. All three rollback modes completed on fresh databases with system Chrome after the initial local browser location error. |
| `pnpm test:handoff`, fixture runtime, Worker and Compose restore scripts | Two accounts replayed eight offline writes across Workerd and Node. Verified return after writes, outbox resumption, grants, sessions, Service Worker update and encrypted object reads. A separate Compose restore matched PostgreSQL rows and sequences and reopened the cataloged S3 object. |
| Staging renderer with `--check`, both modes | Passed with synthetic references. Refused a production-shaped bucket name. No generated configuration, hosted access or deployment. |

The first GitHub Actions run hit the 30-minute job limit during the product browser suite. Its partial output contained one failure at the Chromium restore position and did not include the failure details. The pinned product suite now runs before the longer rehearsals, with per-test output and live GitHub failure annotations. The job budget is 60 minutes. Browser test deadlines, assertions and comparison thresholds are unchanged. Local passes are recorded separately from hosted CI.

A single-CPU Chromium rerun reproduced the hidden conflict review. The trace showed an automatic read advancing the common base to the new cloud revision before the fixture made the device edit. The restore test now holds browser care reads during the two synthetic edits, asserts both edits still share the original base, and releases the reads before checking the conflict choices. The application sync engine is unchanged. The corrected case passed five single-CPU Chromium repetitions and three WebKit repetitions.

Hosted runs of `9946c9b` and `9873b77` each completed 143 product cases and hit the same five 30-second case limits on WebKit in the combined family and medication journeys. Chromium completed all 74 cases. The revised suite uses independent browser sessions and real IndexedDB fixtures for shorter scenarios and retains the prior validations, accessibility checks and 30-second case limit.

### Finalization from `9873b77`

| Local check | Result |
| --- | --- |
| Frozen workspace install, production dependency audit, TypeScript, lint, production builds and both Worker bundles | Passed. The production dependency audit reported no known vulnerabilities. |
| SQL migration checks and Vitest against isolated PostgreSQL | All 20 migrations verified twice. 28 tests passed across 16 files, including HEAD authorization and audit behavior, backup access, and checks for missing or slow startup evidence. |
| Product Playwright | Chromium 97 passed and WebKit 97 passed, with zero failures and skips. |
| Incumbent Playwright | 41 passed per engine and 56 candidate-only cases skipped per engine. |
| Frozen clean-room install and standalone browser suite | 66 passed per engine with `web/` and `apps/compat-worker/` physically absent. |
| Journal and PWA | 9 Journal cases passed per engine. Interrupted service-worker update, offline recovery and retry passed separately. |
| Compatibility and reminders | 44 compatibility and 13 care checks passed. The closed-client reminder fixture passed for all exercised categories. |
| Synthetic source and rollback | Compared 7 namespaces, 15 images and 25 physical rows. Source byte hashes matched before and after. A used PostgreSQL target was rejected before output creation. Fixture rehearsals completed normal, unsupported-mutation and imported-account removal recovery. |
| Workerd ↔ Node and Compose restore | Two accounts and eight offline writes survived handoff and return. Verified outbox, encrypted backup and the restored object catalog. The loopback account, invitation, provider-double and session-revocation checks passed. |
| Loopback Caddy HTTP and HTTPS | WebKit opened the direct Reports route, acquired a controlling service worker and reloaded Reports offline. The HTTPS preflight verified the dedicated fixture certificate and hostname through Node. The isolated browser granted a certificate exception for the synthetic loopback endpoint. |
| Strict visual parity and Axe | All 160 layout and viewport comparisons matched exactly on the complete serial rerun. All 64 accessibility samples reported zero candidate violations. The initial parallel run differed in one English desktop WebKit settings capture, with unchanged geometry and a maximum two-level channel difference. Comparison rules and references stayed the same. |
| Cold onboarding budget | Three Chromium runs per route passed the 6,000 ms median limit. Median 4,558 ms for the product entry and 4,561 ms for direct Insights. |

Browser verification uses one job per product or incumbent suite and browser engine. The standalone clean-room suite runs alongside those jobs. The final verify job waits for all five jobs, so manual candidate archival still requires all browser and clean-room checks to pass. The final job pins Ubuntu 24.04 to match the local reference comparison environment. Two hosted runs on Ubuntu 26.04 recorded different WebKit screenshot mismatches with identical layouts, while two local Ubuntu 24.04 runs matched all 80 WebKit captures. The test keeps the same reference and exact comparison rules, and product and incumbent browser journeys still run on the current hosted runner. The standalone suite, product, incumbent and benchmark servers use distinct or OS-assigned ports. Native macOS Safari and iOS Home Screen and provider delivery still require their own device or hosted checks.

## Outstanding release evidence

- A complete authorized source snapshot, independent namespace census, key-version references and historical backup corpus. Device upgrades and fixture reconciliation do not demonstrate coverage of real accounts, provider registrations or pending jobs.
- Real-device iPhone Home Screen installation and push delivery, plus direct navigation in native macOS Safari. The browser emulation and the reported native iPhone tab check cover different cases.
- A verified fleet drain, hosted staging with dedicated resources, actual notification and mail delivery, key and pending challenge continuity, and production-scale performance. Hosted deployment requires separate owner approval. Rebuild pushes run fixture verification. Candidate archive upload is available only by a separate manual workflow invocation.

The fixture commands, required bindings, abort conditions and archived candidate identity are in [the deployment checklist](DEPLOYMENT.md). Recovery semantics and approved inputs are in [the migration guide](MIGRATION.md).
