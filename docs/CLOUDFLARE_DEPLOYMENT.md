# Cloudflare architecture and capacity

**Local verification only. Cloudflare readiness remains open until an authorized dedicated hosted environment is verified.** Use external PostgreSQL from day one. The portable Worker entry is `apps/api/src/worker.ts`. The combined legacy-compatible Worker remains available for migration rehearsals. A fresh portable installation uses a dedicated database, after applying the checked SQL migrations and initializing it with `postgres-handoff.mjs initialize`.

## Bindings and local verification

- `ASSETS` points to `apps/web/dist`. Serve the existing product origin and relative `/api/v2` routes. The portable Worker fences unversioned API routes.
- `HYPERDRIVE` points to an independent PostgreSQL database with **query caching disabled**. Sessions, privileges, writer state and sync revisions require fresh reads. The runtime uses at most two driver connections per invocation. Hyperdrive pools origin connections across invocations. Size that pool against the provider's actual direct connection limit. [Query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/), [connection pooling](https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/).
- `BACKUPS` is a private dedicated R2 bucket for encrypted backup objects. Keep credentials and key versions in the secret manager. No D1, KV, Durable Objects or Cloudflare Queues are needed in the PostgreSQL-only configuration. The incumbent compatibility path still uses Durable Objects, including its diagnostic pilot.
- Cron invokes the shared job runner. PostgreSQL stores identity mail leases, reminder and release progress and backup erasure tasks. Provider delivery keys, password key versions, code and outbox encryption keys, signing keys and VAPID keys must be configured separately. The diagnostic pilot and all legacy acquisition are outside this standalone mode.
- The repository configuration `infrastructure/cloudflare/portable.local.json` is for loopback `wrangler dev --local` with a fixture Hyperdrive connection. The local renderer `node infrastructure/cloudflare/staging.mjs --portable` can fill in authorized dedicated resource references without connecting to Cloudflare. Hosted resource bindings require independent authorization. No deploy command is required for the local tests.

## Published limits

| Component | Provisioning and constraints |
| --- | --- |
| Workers Free | 100,000 invocations per day. 10 ms CPU per invocation, 128 MB memory, 50 subrequests per request, six simultaneous outgoing connections, and five cron triggers per account. Cron wall time and CPU are different. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) |
| Hyperdrive Free | 100,000 queries per day. SQL reads, writes and other statements count. This quota is separate from Worker invocations and the PostgreSQL provider's quotas. [Hyperdrive pricing](https://developers.cloudflare.com/hyperdrive/platform/pricing/) |
| R2 Standard Free | Monthly allowance of 10 GB-month, 1 million Class A and 10 million Class B requests. Standard storage and requests above the allowance are billed. The service supports a 5 TiB object limit. Medora enforces a much smaller 16 MiB per backup, 32 backups and 128 MiB per account. [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [R2 limits](https://developers.cloudflare.com/r2/platform/limits/) |
| External PostgreSQL | Neon is an example, with 100 CU-hours/month and 1 GB per project under its published Free offering. No provider account was provisioned. Limits, compute wake-up, connection capacity, retention, geography and service commitments must be confirmed for the selected project. Frequent polling may keep compute awake. [Neon pricing](https://neon.com/pricing) |

The Free allowances do not establish fit for Medora. Measure password hashing, private backups, NDJSON export and cron delivery under the actual Worker limits. If required flows exceed Free CPU, query or volume quotas, a paid tier or an independently verified design change is a release prerequisite. Monitor pool starvation and age of pending jobs. Email provider plans, backup retention and hosting costs are independent.
