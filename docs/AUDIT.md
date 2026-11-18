# Rebuild audit · 18 November 2026

The initial checkout was clean on `feature/family-care`. HEAD, local `deploy`, and the live remote release ref all resolved to `5ee5e47cafe7644b5dd15ae7408e909c755ee211`. The rebuild branch starts at that exact commit. Origin is `https://github.com/k1nosraty/medora.git`. The default branch is `main`. Other worktrees include the remediation branch and a prunable frontend checkout. Both branch tips are ancestors of the base. Release tags run from v0.2.0 to v0.5.0-preview, alongside two web snapshots. The web package declares 0.5.0-preview.

There are 1,507 tracked files at baseline. `web/ui` contains HTML templates, SVG definitions, forms, design gallery, styles, and a service worker template. The Node build expands translations and includes, bundles ES modules with esbuild, and emits an offline asset manifest. Most artwork lives in the design gallery asset directories. The medication application is a browser DOM application with pure scheduling modules, indexed daily history, an IndexedDB transaction layer and feature controllers. Admin, pilot, and gallery have separate entry points.

`web/src/worker.mjs` dispatches authentication, care snapshots, family, promotions and media, reminders, support, operations and migration endpoints. Scheduled work includes retention and release notifications. Durable Object alarms deliver push and retry account work. SQLite and Durable Object KV coexist inside objects. The app requires the original browser origin for device data and push continuity.

CI on feature/fix and pull requests checks the legacy build, JS types, npm advisories, Node tests, care, alarms, and two Playwright engines. A push to deploy additionally publishes the Worker and queues a public release notification. That workflow is outside the rebuild path.

## Baseline verification

Node 24.18.0. Existing typecheck and build passed. Node tests 41/41. Care checks 13/13. Alarm checks exercised encrypted push for seven scheduling categories. npm reported zero known package advisories. Browser results and measured load are recorded in PERFORMANCE.md. The legacy jsconfig covers selected files only.

## Findings affecting migration

- Administrative NDJSON is deliberately redacted. The encrypted operational archiver also uses application enumerators and cannot certify every physical object, KV key, session, pending challenge or alarm.
- Device schema upgrades and recovery exports are separate paths. The recovery export strips account and reminder credentials. It cannot serve as a full-fidelity migration source.
- The shared IndexedDB writer reconstructs the state envelope and history buckets. Extension fields on those containers can disappear during ordinary writes.
- The portable health export uses an allowlist for privacy. Unknown device fields cannot be indiscriminately sent to cloud storage.
- Registration and support depend on external services. Browser-only static tests do not establish server or hosted parity.
