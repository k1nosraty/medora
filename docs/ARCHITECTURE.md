# Application architecture

The repository contains a production-line web/ application and an isolated pnpm rebuild workspace. The two APIs have separate routes and authentication cookies. An account defaults to sync generation 1. The incremental writer accepts only accounts explicitly assigned to generation 2 in the target database. Production cutover must first fence writes from legacy clients. Setting the generation alone cannot fence a separate Worker.

The Hono application in apps/api/src/app.ts consumes a repository and a password verifier. Node and Workers use the same handlers, rate limits and SQL transactions. The Worker adapter accepts a Hyperdrive binding. PostgreSQL owns account ordering and change history. The database migration runner verifies the ordered SHA-256 history while holding a transaction lock. Contracts publish a versioned water operation, validated requests, cursor responses and an OpenAPI sync description.

A per-account row lock serializes changes with their feed and receipt. The immutable change log contains operation ID, base revision, committed cursor and payload. SQL NULL represents a tombstone. Replaying an operation with the same contents returns its original result. Reusing an operation ID with different data, or writing against a stale revision, returns 409. Client-supplied account IDs never select the owner.

The original application retains the other live services documented in FEATURE_PARITY.md. A passing water sync transaction does not certify those services for cutover.

## Running application

React, React Router, React Hook Form, TanStack Query and Dexie implement the device application in apps/web. Routes load on demand and share locale, calendar and active owner context. The local journal separates guest, restored and account namespaces. A revision check protects edits to structured care plans. Incremental sync commits a queued operation and local row together. A pulled competing edit goes into a separate conflicts store. Choosing a newer server value or resubmitting the local value clears that conflict transactionally. Reports query a date range in the compound owner/day index. Personal care plans have local persistence and encrypted backups. The account water feed is the implemented incremental network contract.

Portable domain rules for doses, routines, appointments, sleep, and cycle reuse the legacy application's pure scheduling and validation functions. The Hono API uses the same PostgreSQL transactions and credential proof in its two adapters. Node crypto compatibility is required by the Worker adapter and the password KDF. S3 signing and R2 bindings implement the same object interface. Storage upload remains pending until a content digest check succeeds. Family water totals require current membership and a directional grant.

Verification codes have bounded attempts and expiry. PostgreSQL commits the challenge and encrypted mail job together. A Node interval or Worker cron leases jobs to a mail adapter. Mailpit provides local delivery. Hosted deliveries use the configured provider. Docker runs PostgreSQL, the Node service, S3, a mail sink and Caddy. Static Worker hosting uses the same app build.

To add a feature, put pure rules in packages/domain, validated API inputs in packages/contracts, durable data handling in a migration and service, and views under apps/web/src/features. Include a workflow test for retries, ownership or offline changes when those behaviors apply.
