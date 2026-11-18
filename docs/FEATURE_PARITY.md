# Feature parity ledger

The release branch is the behavioral reference. The default candidate entry is /medication/. The separate /journal/ route retains the earlier device migration and incremental journal workflows. The following inventory traces each product surface to its original implementation.

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
| Onboarding, Today and navigation | Original route, screen hierarchy, calendar, program cards, focus and notification deep links. React implements onboarding and the interactive week strip | Browser regression and direct release comparisons in both engines. Additional controllers still use the original JS |
| Medicines, appointments and routines | Original editors, appearance, stock, schedules, historical plans, attendance, quantity and steps | Exercised in browser regression and a mixed-program PostgreSQL commit. Closed-device reminders still depend on the native service |
| Water | Quick log, date controls, history, edits, delete, undo, goals and reminder pause. React implements history rows | Owner-checked document patches and per-entry feed reconcile together. A signed-in browser restored a source account and added water. Offline replay, idempotence, stale writes and scoped family writes exercised |
| Sleep, cycle and insights | Complete original screens, settings, privacy controls, print, backup and reports | Portable care commits include these domains and preserve unknown fields. The fixture reopens encrypted appointment and cycle fields. Complete historical variant coverage remains open |
| Account and cloud sync | Public account dialog and original conflict/recovery UX | Writer negotiation, signup, email confirmation, login, password reset, restore, owner scope, revisions and privacy proof. Session continuity, account lifecycle and reverse identity transfer remain open |
| Household | Original family panel, context, group management, invitations, scoped actions | PostgreSQL persists directional sections, expiry, member identifiers and replay receipts. Invitation, Mailpit delivery, accept, change, delegate, replay, revoke, delete and post-write recovery exercised. Full historical policy census is outstanding |
| Backups and installation | Original backup readers, cycle exports, service worker, cache strategy, install artwork, pilot and design gallery | Isolated browser upgrades, private archives, encrypted object round trips and interrupted updates exercised. Historical corpus, real provider/device and installed-origin upgrade sign-off are outstanding |
| Support, promotions, notifications and administration | Combined Worker routes these surfaces to the original native services. Compose provides a separate local compatibility runtime | The legacy writer fence stops these services too. Portable PostgreSQL processing, recovery of new operational writes, verified release notifications and physical-device delivery are open |

The compatibility runtime and the PostgreSQL rehearsal are separate operating modes. A test of an original UI workflow in compatibility mode establishes visual or behavioral continuity at that entry. It does not establish a portable implementation of its server-side operation. See [verification evidence](REBUILD_VERIFICATION.md).
