# Application architecture

The repository contains a production-line web/ application and an isolated pnpm rebuild workspace. The two APIs have separate routes and authentication cookies. An account defaults to sync generation 1. The incremental writer accepts only accounts explicitly assigned to generation 2 in the target database. Production cutover must first fence writes from legacy clients. Setting the generation alone cannot fence a separate Worker.

The Hono application in apps/api/src/app.ts consumes a repository and a password verifier. Node and Workers use the same handlers, rate limits and SQL transactions. The Worker adapter accepts a Hyperdrive binding. PostgreSQL owns account ordering and change history. The database migration runner verifies the ordered SHA-256 history while holding a transaction lock. Contracts publish a versioned water operation, validated requests, cursor responses and an OpenAPI sync description.

A per-account row lock serializes changes with their feed and receipt. The immutable change log contains operation ID, base revision, committed cursor and payload. SQL NULL represents a tombstone. Replaying an operation with the same contents returns its original result. Reusing an operation ID with different data, or writing against a stale revision, returns 409. Client-supplied account IDs never select the owner.

The original application retains the other live services documented in FEATURE_PARITY.md. A passing water sync transaction does not certify those services for cutover.
