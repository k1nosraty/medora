# Device data preservation

The canonical product opens at `/medication/`. It retains the original IndexedDB database with its versioned care metadata and day buckets. The React/Dexie journal at `/journal/` has an independent database and operation queue. It can capture older device databases and validate the copied records before selecting the copy. Opening the journal does not move the canonical product to Dexie.

Onboarding reads the existing care database before offering the first-run screen. The primary application's normal write transaction records onboarding completion after the dashboard module is available. Sleep edits reuse the same record IDs, wall-clock conversion, overlap rules and write transaction. An unchanged wall time preserves the original offset during an ambiguous clock change. Existing extra fields are carried into an edit. A stale edit or deletion is rejected against the current record.

## Preserve the public origin

Keep the exact frontend scheme, host and port, the service-worker scope and the relative `/api` URLs. Update the upstream behind that origin when the backend moves. This keeps IndexedDB, cache, the installed PWA and the `__Host-` authentication cookie attached to the same site. Opening a different frontend origin creates a separate browser storage namespace. A different public API origin would require a new authentication and CORS design. A raw origin change cannot transfer browser data.

Keep the same closed-browser push keys and signing versions. A provider migration must preserve subscriptions and test notification delivery from the existing installation. Browser storage can also be evicted by the browser or cleared by the user. Keep the encrypted backup/export flow available before an origin change.

## Offline writes and replay

- The canonical app writes device edits locally before syncing. It retains account scope, base revision and the last acknowledged snapshot. Reconnecting retries the merge against the server. Freeze and transient errors leave the local edits intact.
- The portable care transport derives a stable UUID from the owner scope and exact commit payload. An identical retry returns the existing PostgreSQL receipt. If private-field re-encryption changes the payload, the canonical client reloads the remote revision and compares the decrypted records. The request uses an expected revision and the server refuses conflicting versions.
- The journal stores a local record and queued operation ID together in Dexie. Retries reuse the ID. Deletions are tombstones. The server enforces the authenticated owner and preserves the change feed and receipts when moved.
- A stale document version causes a conflict or retry. The canonical client retains unknown values through the merge on supported records and keeps local-only fields on the device. The archive copier treats unknown stores, fields and supported structured values as source data.
- A client that still sends the unversioned API remains fenced during and after the switch. Update the application at the same origin to use the v2 routes, then retry sync. Its local IndexedDB history stays available throughout.
- Multiple tabs share IndexedDB. Browser write transactions and the server's per-owner revision check protect committed data. Complete cross-tab coverage for every editor is still open.
- The service workers version static caches separately from IndexedDB. The journal's interrupted-update test checks the previous offline shell and a subsequent retry. Both service workers bundle Workbox routing locally for static assets. They retain their existing atomic shell installation and cache lifetimes. API traffic stays on the network. The canonical app retains its original IndexedDB implementation. The complete canonical React/TypeScript and Dexie port remains open.

## Evidence

The synthetic device matrix covers archive reads from schema versions 1 through 3, unknown fields, an interrupted checkpoint import and upgrade retry. The PostgreSQL handoff fixture keeps the normal product origin and two browser databases while switching the API upstream from Workerd to Node. It reloads offline across a service-worker update, opens a second tab, checks a local-only extension, then compares the server water records with the device by ID and value. An identical replay leaves the record set unchanged.

Historical state in every active user's device, the full range of private-field and multi-tab conflicts, real-device storage eviction, and the complete hosted server snapshot still need independent reconciliation.
