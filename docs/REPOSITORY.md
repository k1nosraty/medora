# Repository map

Start with the [root README](../README.md) for setup and test commands.

| Path | Responsibility |
| --- | --- |
| `apps/web/src/product`, `apps/web/src/journal`, `apps/web/scripts` | Primary React product, independent React/Dexie Journal and their build entry points. |
| `apps/api/src` | Shared Hono routes, application services, PostgreSQL persistence, and the outbox. |
| `apps/api/src/adapters` | Cloudflare Workers and Node entry points and runtime writer settings. |
| `packages/contracts`, `packages/domain` | Shared API payloads and pure rules consumed by the UI, API and tests. |
| `packages/server-shared`, `packages/web-build` | Server helpers shared by both API runtimes and the static resource compiler used by both frontend builds. |
| `migrations/server`, `scripts/migration` | Append-only PostgreSQL migrations, data mapping, verification, and recovery. |
| `infrastructure/cloudflare`, `infrastructure/docker`, `compose.yaml` | Local Workerd and candidate configuration, and the container build and reverse proxy for Node. |
| `apps/web/product-assets/{ui,public}` | Canonical frontend layout, styles, translations, assets, shared and compatibility modules, and separately served resources. |
| `apps/web/tools` | Independent administration, campaign preview, pilot and design gallery source. |
| `apps/compat-worker` | Native compatibility Worker, alarms, fixture startup and reference frontend build. |
| `tests`, `tests/compatibility`, `scripts/verification` | Unit, integration, browser and migration tests, synthetic fixtures, and isolated rehearsal entry points. |
| `branding` | Canonical icon sources and licensing. The build emits `ICON-LICENSE.txt` at the established public URL. |
| `docs`, `CHANGELOG.md`, `AGENTS.md` | Architecture, operations, release evidence and controls. `AUDIT.md` records the original audit baseline. |
| `.github`, root package, compiler and test configuration | CI, workspace entry points, linting and test orchestration. The workspace pins one dependency graph. The reference visual tool builds a historical Git archive with those installed build dependencies. |

## Compatibility files to preserve

- `apps/web/product-assets/public/medication/shared/storage.js` opens and upgrades historical IndexedDB versions. `apps/web/src/storage` reads and stages legacy data, including pending operations and fields the current application does not recognize.
- `apps/web/product-assets/public/medication/features/backups` includes a historical `crypto.js` URL used by earlier unbundled builds. Keep it along with the active backup readers and the synthetic Android fixture under `tests/compatibility/fixtures`.
- The incumbent Worker and its Durable Object classes supply the format and runtime required for recovery. `scripts/migration/migrate-care.mjs` and `migrate-care-v1.mjs` handle two generations of logical encrypted archives. The PostgreSQL tools process authenticated snapshots separately. [Migration and reconciliation](MIGRATION.md)
- Keep committed SQL migrations in order and byte-for-byte stable because the migration runner validates their checksums. Keep the browser asset URLs needed by older clients and the fixtures used by compatibility tests.

## Generated and private files

`dist/`, app builds, test results, local `.local/` fixture scratch space, Wrangler development state, and dependency installations are generated locally and ignored. The reference build also emits HTML, CSS, bundles, the service worker and the icon license into ignored `apps/compat-worker/public` from the workspace sources. `.env.example` lists required local settings without secret values. Create private fixture credentials with the local environment generator. Keep data snapshots, operational backups and secrets out of Git.

Use the root pnpm lockfile for both applications. Miniflare, Wrangler and the archived reference build tooling are pinned at the workspace root. The old root `web/` is absent from Git. Its generated `node_modules/` and `public/` can be removed after checking that no process uses them. Keep legacy Wrangler state and private local configuration when they contain recovery inputs.
