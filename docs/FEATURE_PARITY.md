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

## Candidate coverage

| Workflow | Rebuilt behavior exercised | Remaining parity work |
| --- | --- | --- |
| Today and calendar | Persian daily view, timezone-adjusted medicine/appointment/routine schedule, water total and program navigation | Onboarding, month navigation and notification deep links |
| Medicines | Daily schedule, fractional quantities, stock debit/refill, pause/resume with dated history, taken/skipped | Full phase editor, individual-date schedules, archive, snooze, historical plan edits and push |
| Appointments | Creation with clinic timezone, attendance/undo, cancellation/reinstatement, period counts and backup restoration | Rescheduling, offsets, contacts, private notes and push |
| Water | Date selection, create/edit/delete, paginated history, daily totals, offline queue and conflict choice | Goals, undo, reminder pause and parity of family quick actions |
| Routines | Daily completion plans, pause/resume and logs | Quantity/step editing, historical plan changes, flexible schedules |
| Sleep | Main sleep and naps, quality, interval validation, overlap rejection, notes and backup | Quick actions, reminders, sleep summaries |
| Cycle | Daily flow, notes, local-only preference, isolated cycle file export/import, cloud backup filtering | Cycle record editing, estimates, symptom trends, companion/print views |
| Reports | 7/30/90-day local report of water, recorded doses and appointments | Calendar-aligned periods and complete program/adherence metrics |
| Accounts and settings | Register, verify, sign in, reset, revoke sessions, language and calendar choice | Profile changes, deletion lifecycle, legacy session and identity cutover |
| Family | Groups, invitations and acceptance, directional water grant, totals and revocation | Scoped delegated writing, additional program grants, expiry/membership management, migration into live policies |
| Cloud sync | Replay-safe owner-scoped incremental water, conflict detection, tombstones and reconnect | Other care collections, private-field key continuity, pending legacy operations and writer-generation transition |
| Backups | Encrypted device/Android/web/cycle restore in a separate profile, enrolled-account backup download and hash verification | Complete historical corpus, operational backup promotion and full source reconciliation |
| Notifications | Legacy alarm suite remains green for seven categories | Rebuilt enrollment, closed-client delivery and retry lifecycle |
| Support, promotions, operations | Original source retained and byte images archived in fixture | Rebuilt support, campaign, media, administrative and release workflows |
| Pilot, gallery and installation | Rebuilt bilingual shell, offline asset caching and reload | Pilot operations, gallery parity, native platform install and transition from the production service worker |

Generation 1 stores and sessions stay authoritative until write fencing, rollback and semantic reconciliation pass. Imported accounts cannot sign into the v2 writer merely by existing in a staging table.
