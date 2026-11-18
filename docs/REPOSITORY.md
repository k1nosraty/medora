# Repository map

Start with the [root README](../README.md) for setup and test commands.

| Path | Responsibility |
| --- | --- |
| `apps/web/src`, `apps/web/scripts` | React and Dexie journal, product React components, and the Vite product build. |
| `apps/api/src` | Shared Hono routes, application services, PostgreSQL persistence, and the outbox. |
| `apps/api/src/adapters` | Cloudflare Workers and Node entry points and runtime writer settings. |
| `packages/contracts`, `packages/domain` | Shared API payloads and routines used by the UI, API, and tests. |
| `migrations/server`, `scripts/migration` | Append-only PostgreSQL migrations, data mapping, verification, and recovery. |
| `infrastructure/cloudflare`, `infrastructure/docker`, `compose.yaml` | Local Workerd and candidate configuration, and the container build and reverse proxy for Node. |
| `web/ui`, `web/public` | Original templates and assets, active browser controllers, and versioned public paths. The rebuild consumes these sources. |
| `web/src`, `web/scripts`, `web/wrangler.jsonc` | Incumbent Worker, compatibility and reference build tools, and historical logical archive tools. |
| `tests`, `web/test`, `web/browser`, `scripts/verification` | Unit, integration, browser and migration tests, synthetic fixtures, and isolated rehearsal entry points. |
| `branding` | Canonical icon sources and licensing. The build emits `ICON-LICENSE.txt` at the established public URL. |
| `docs`, `CHANGELOG.md`, `AGENTS.md` | Architecture, operations, release evidence and controls. `AUDIT.md` records the original audit baseline. |
| `.github`, root package, compiler and test configuration | CI, workspace entry points, linting and test orchestration. `web/` keeps its independent npm lockfile for the reference build. |

## Compatibility files to preserve

- `web/public/medication/shared/storage.js` opens and upgrades historical IndexedDB versions. `apps/web/src/storage` reads and stages legacy data, including pending operations and fields the current application does not recognize.
- `web/public/medication/features/backups` includes a historical `crypto.js` URL used by earlier unbundled builds. Keep it along with the active backup readers and the synthetic Android fixture under `web/test/fixtures`.
- The incumbent Worker and its Durable Object classes supply the format and runtime required for recovery. `web/scripts/migrate-care.mjs` and `migrate-care-v1.mjs` handle two generations of logical encrypted archives. The PostgreSQL tools process authenticated snapshots separately. [Migration and reconciliation](MIGRATION.md)
- Keep committed SQL migrations in order and byte-for-byte stable because the migration runner validates their checksums. Keep the browser asset URLs needed by older clients and the fixtures used by compatibility tests.

## Generated and private files

`dist/`, app builds, test results, local `.local/` fixture scratch space, Wrangler development state, and dependency installations are generated locally and ignored. The reference build also emits HTML, CSS, bundles, the service worker and the icon license into `web/public` alongside versioned sources. `.env.example` lists required local settings without secret values. Create private fixture credentials with the local environment generator. Keep data snapshots, operational backups and secrets out of Git.

The pnpm workspace and the incumbent npm package declare their own build and test dependencies. The incumbent package explicitly pins Miniflare because the fixture and compatibility tests import it directly. The lockfile resolves that pin to the same installed copy Wrangler uses.
