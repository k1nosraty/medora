# Architecture decisions

1. Branch from the verified release SHA and keep the existing Worker, routes, encryption readers and frontend runnable while the replacement is validated.
2. Keep device migration local. Preserve unknown fields, revisions, credentials and pending operations on the device. Separate any private migration copy from portable user backups.
3. Use PostgreSQL transactions for change ordering and retry receipts. Isolate runtime wiring so the same business logic can run in Node and Workers.
4. Require positive evidence of source coverage. Names found in an account registry alone cannot enumerate every Durable Object.
5. Use dedicated staging resources and a separate deployment manifest. A release branch push is a production action.
6. Use one release-compatible product route and design source. Keep the journal at its own explicit route. Move behavior at independently testable feature boundaries.
7. Coordinate the source fence and database writer transition separately. Reverse recovery requires an authenticated frozen base, a newly reconstructed destination and verification of every supported mutation. Unmapped writes invalidate the recovery attempt.
