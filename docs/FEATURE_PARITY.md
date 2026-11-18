# Feature parity ledger

The release branch is the behavioral reference. Verified legacy workflows cannot count as rebuilt workflows. The following inventory traces each product surface to its original implementation.

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
