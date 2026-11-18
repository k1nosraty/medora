# Feature parity ledger

The release branch is the behavioral reference. The default candidate entry is /medication/. The separate /journal/ route retains the earlier device migration and incremental journal workflows. The following inventory traces each product surface to its original implementation. The [frontend port ledger](FRONTEND_PORT.md) records current React and TypeScript ownership and remaining browser dependencies.

| Capability | Source under web/ | Essential behavior to retain |
| --- | --- | --- |
| Today, onboarding and calendar | ui/layout, features/today, app/day-navigation, shared/ui | Daily timeline, focus, program cards, selected date, local timezone, notification deep links |
| Medicines | features/medicines, domain/medicine-command, domain/medication-rules | Phases, stock balances/debits, units, dose history, appearance, snooze, pause |
| Appointments | features/appointments | Clinic timezone, specialty, offsets, cancel/edit, contact privacy |
| Water | features/water | Quick logging, edit/undo, history, goal and reminder pause |
| Routines | features/routines, domain/routine-plan | Done, quantity and steps, scheduling and historical plans |
| Sleep | features/sleep | Main sleep, naps, overlaps, notes, quick actions and reminder settings |
| Cycle | features/cycle | Daily logs, settings, privacy, estimates, companion sharing, print and independent encrypted backup |
| Insights | features/reports | Date ranges, water/dose and program history |
| Account and settings | features/account, features/settings, src/accounts | Guest mode, register, verify, sign in, reset, change profile, delete, localization, settings |
| Household | features/family, src/family | Invitations, multi-group context, grants, scoped quick writes and replay protection |
| Cloud sync | features/sync, src/sync | Revision check, three-way conflict resolution, recovery keys, field protection, restore intent |
| Archives | features/backups, shared/crypto, src/operations | Web/Android readers, local confirmation, migration archive validation and recovery |
| Notifications | features/reminders, src/reminders | Enrollment, closed-client push, retries, stale revision rejection and privacy |
| Support, promotions, operations | features/operations, features/promotions, public/admin, src/operations | Rollouts, announcements, campaign media, tickets, release updates, audit |
| Pilot, design gallery and install | public/pilot, public/design, ui/gallery, ui/pwa | Diagnostic push, previews, offline install/update and artwork |

Feature paths in this table are relative to public/medication when prefixed with features/, app/, shared/ or domain/. No rebuilt parity sign-off has been issued.

## Candidate coverage

| Surface | Delivery at the normal product entry | Generation 2 evidence and open work |
| --- | --- | --- |
| Onboarding, Today and navigation | Original route, screen hierarchy, calendar, program cards, focus and notification deep links. React renders onboarding, the week strip, the month calendar, the date-picker grid, the Today empty/completed state and same-time navigation | Browser regression and direct release comparisons in both engines. Additional controllers still use the original JS |
| Medicines, appointments and routines | Original editors, appearance, stock, schedules, historical plans, attendance, quantity and steps | Exercised in browser regression and a mixed-program PostgreSQL commit. The portable scheduler shares the original rule engine and push payloads. Device and provider verification remains open |
| Water | Quick log, date controls, history, edits, delete, undo, goals and reminder pause. React implements the form and history rows | Owner-checked document patches and per-entry feed reconcile together. A signed-in browser restored a source account and added water. Offline replay, idempotence, stale writes and scoped family writes exercised |
| Sleep, cycle and insights | Complete original screens, settings, privacy controls, print, backup and reports. React renders sleep history, the sleep chart, cycle week, trend and history, report statistics and the water report chart | Portable care commits include these domains and preserve unknown fields. The fixture reopens encrypted appointment and cycle fields. Complete historical variant coverage remains open |
| Account and cloud sync | Public account dialog and original conflict/recovery UX with a typed React difference table | Writer negotiation, signup, email confirmation, login, password reset, restore, owner scope, revisions and privacy proof. Existing legacy sessions can authenticate in the fenced candidate. Completed registrations and resets reverse to the original credential store. Administrator deletion revokes both cookie generations and removes live account state. Pending challenges and the complete historical signing-key inventory remain open |
| Household | Original family panel, context, group management, invitations, scoped actions | PostgreSQL persists directional sections, expiry, member identifiers and replay receipts. Invitation, Mailpit delivery, accept, change, delegate, replay, revoke, delete and post-write recovery exercised. Full historical policy census is outstanding |
| Backups and installation | Original backup readers, cycle exports, service worker, cache strategy, install artwork, pilot and design gallery | Isolated upgrades, private archives and encrypted object round trips exercised. After freezing, the rebuilt backup catalog was replayed and restored into a second isolated PostgreSQL/S3 target. Historical corpus, provider, real-device and installed-origin upgrade sign-off are outstanding |
| Support, promotions, notifications and administration | The candidate routes support, promotions, operational settings, account listing, session revocation, account deletion, administrative export, release batches and reminder enrollment to PostgreSQL. React renders the support form and history, and the sponsored-message banner and dialog | Fixture rollback covers tickets, settings, counters, audits, media, campaign interactions and reminder jobs. Node and Workerd streamed the administrative NDJSON with chunked media. The release job retried a synthetic provider response and restored its batch and delivery receipt. The diagnostic pilot still uses the native implementation |

The compatibility runtime and the PostgreSQL rehearsal are separate operating modes. A test of an original UI workflow in compatibility mode establishes visual or behavioral continuity at that entry. It does not establish a portable implementation of its server-side operation. See [verification evidence](REBUILD_VERIFICATION.md).
