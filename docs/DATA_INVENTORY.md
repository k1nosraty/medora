# Data inventory

| Source | Identity and contents | Preservation boundary |
| --- | --- | --- |
| IndexedDB `medora-medication-prototype` v1 | `care["state"]`, including day history inside the state | Read at existing version. Keep original keys and raw value |
| Same database v2–v3 | `care["state"]` with settings and history revision, `days[day]` with doses, water and routine logs | Settings contain additional record collections, private local fields, sync base, pending intents and device state. Local revision alone does not identify every settings change |
| Web Storage | Language, rollout, daily activity, promotion limits, pilot test ID, selected family and session-scoped quick actions | Keep origin and tab lifetime. Copying session data to a server or long-lived backup changes privacy properties |
| Browser platform | HttpOnly account session, service worker registration, push subscription, permission, shell/artwork caches | Browser-managed. Preserve origin, scope, cookie semantics, signing and VAPID keys |
| Credentials | Singleton credentials_v1, unique email ID, username, email, salt, proof, pepper version, creation date | Preserve original identifiers, hash parameters and key versions |
| EmailAccount | Per account, including accounts without a credential row. SQLite deliveries, challenge, reset_challenge, pending_password_reset, sessions, password_sources, password_attempts, account_reset, family_operations. KV care-sync, care-zone, reminder devices, deletion and retry state | Preserve epoch, revocation, replay, outstanding jobs, alarm time and private envelopes |
| Families | care-groups and per-group objects. Groups, members, invites, grants, audit, owner/recipient scope and expiry | Preserve composite keys, tombstones where present, grant policy and identity scope |
| MedicationReminders | Per device. Push endpoint and keys, enrollment, schedule, deduplication, revocation and alarms | Account device list and operations index can be incomplete. Preserve per-object state |
| Operations | Singleton operations. SQLite counters/audit/tickets. KV config, reminder registry, release batches and restore journals | Includes diagnostics, replies, pending work and leases |
| Promotions | Singleton home. Legacy promotion, campaigns, preview, event counters, asset index, metadata and media byte chunks | Preserve binary content and referenced IDs |
| PushPilot | Singleton medora-push-pilot. Recent/pending test, cached authorization, alarm | Sensitive device data outside normal care scope |
| User archives | Android MEDORA 00 01 (JSON schema 2–8), web MEDORAW 01, separate MDORCYC1 cycle archive | Keep original ciphertext and authenticate before interpreting records |
| Server archives | MEDSRV01 and multipart MEDSRV02. Operational NDJSON exports are another artifact | Keep bytes, fingerprint, part order, hash chain and key continuity separately |

The namespace list is in the tagged migrations in `web/wrangler.jsonc`. Data outside the listed stores or fields requires inspection. Absence from an application export does not demonstrate absence from storage.

The target adds writer_transition, cutover_accounts, rollback_exceptions, care_state, the care commit history, family_operations and household_changes. These contain sensitive documents, relationship identifiers or digests. Keep them under the same isolation and retention controls as the corresponding source records. The recovery fixture independently compares the archive, PostgreSQL projections and reopened native state. No complete authorized source was available.
