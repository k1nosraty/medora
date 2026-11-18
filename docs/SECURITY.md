# Security review

Accounts, family grants, recovery keys, pending writes, health history and reminder endpoints are sensitive. Treat browsers, other household members, backup input and the network as separate trust boundaries.

The existing Worker uses signed HttpOnly session cookies, server-side token digests, password salts and versioned peppers, per-account throttling, same-origin changes, family section/role checks, bounded inputs and redacted error diagnostics. Private care text has its own recovery mechanism. Device backups use PBKDF2-SHA-256 (600,000 iterations, 16-byte salt), AES-256-GCM with a 12-byte nonce and 128-bit tag. The 36-byte header is authenticated. The multipart server format additionally authenticates archive identity and sequence.

The portable API keeps the original password proof derivation, generates random 256-bit session tokens and stores SHA-256 digests. It checks same-origin mutation requests, bounds request size, scopes reads and writes to the current session, checks sync generation, and commits mutation and receipt atomically. Integration tests cover two owners, CAS, concurrent changes, tombstones, duplicate delivery, logout, missing origin and anonymous requests. API responses disable caching. Exceptions return a fixed public code.

Before cutover, verify registration, password reset and revocation across both systems, legacy private envelopes, delegated grants and consent, isolated remote bindings, storage retention, session expiry, distributed abuse controls, and each backup's access boundary. The legacy test suite covers several of these boundaries in its original runtime. No production security test is authorized by this run.
