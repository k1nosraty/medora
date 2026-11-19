# Rollback

## Frontend-only changes

An approved rollback of the frontend assets must preserve the public origin, `/medication/` service-worker scope and existing IndexedDB namespace. Use the verified previous asset set as a unit so its scripts, styles and cache manifest agree. Rehearse interrupted updates and offline operations locally before considering a release rollback. The React appointments, routine, period and preference editors and the backup panel use the existing schema and write contracts. Keep pending restore acknowledgements and device sync metadata intact during rollback.

## PostgreSQL and object storage handoff

**Before commit.** Keep the source and target fenced during verification. For an interrupted copy or failed reconciliation, use `abort` with the original source and private transfer directory. This reopens only the source for that transfer ID. The partial target remains fenced. Retain it for diagnosis and use a new database, bucket and transfer directory for a clean retry. The tool does not delete either installation.

**While committing.** The tool retires the source for exactly one destination installation ID before enabling writes at the destination. If it stops between these two steps, repeat `commit` with the same source, verified destination and transfer directory. A stale or different target fails. A retired source does not support `abort`.

**After destination writes begin.** Treat the destination as authoritative. Freeze it and use the same handoff process to move to a fresh recovery installation if returning to the other runtime. Reconcile the latest writes and files first. Routing reads or writes to a stale copy would lose updates. The synthetic fixture exercised partial-copy abort, idempotent commit and post-write return into a fresh Worker database and R2 bucket.

## Legacy Durable Objects

The legacy-to-PostgreSQL migration has a separate journal and writer fence. Follow the reverse care and identity procedure in [migration](MIGRATION.md). Account challenges, unmatched data or unresolved object reservations can prevent publication of a legacy recovery tree. Preserve both stores until reconciliation establishes a usable authoritative copy.
