# Frontend port status

The canonical product route is `/medication/`. The React and Dexie journal at `/journal/` has separate UI and local storage. It is not a replacement for the canonical product or its existing user database.

`apps/web/src/product` owns the product's TypeScript entry, startup, route coordination, writer-aware account transport, and React features. `apps/web/scripts/product.mjs` builds these modules and checks esbuild's input graph for replaced modules. The pnpm build owns its dependencies and invokes the shared compiler in `packages/web-build`. It still consumes the original HTML, CSS, translations, art, PWA shell and unported controllers from `web/`. `web/` also builds the incumbent app and supplies legacy server fixtures and historical public module URLs.

The bundle guard covers the replaced entry points and controllers. Static compatibility files are still emitted at their historical paths for installed clients, the design gallery, direct import tests, or approved recovery.

## Dependency boundaries

- **Build inputs.** The product and Journal resolve esbuild and Workbox from `apps/web`. The product uses `packages/web-build/compile.mjs` with templates and styles under `web/ui` and runtime assets under `web/public`. The Journal has its own Vite entry and still reads several image and font assets from `web/public`. The repository's combined Docker build still installs the npm package for its compatibility image.
- **Immediate browser dependencies.** `product.ts` still imports the JavaScript medicine editor and view, family, reminders, backups and sync modules. `navigation.ts` wires the JS settings, appointment, cycle and insights controllers. `web/` also supplies shared focus, artwork, locale and domain helpers.
- **Indirect dependencies.** Unported controllers use the existing IndexedDB storage and schemas, care and scheduling rules, cryptography, and device recovery. Shared format and storage modules are still needed by the older client too. The typed account transport negotiates the PostgreSQL and compatibility APIs while retaining session and sync continuity.
- **Server runtime.** Node and Workerd tests against PostgreSQL exercise backend portability. Frontend independence remains open while `apps/web` consumes the original build inputs and controller modules.

### Migration inventory

The paths in the implementation column are relative to `web/public/medication` unless prefixed with `apps/` or a public route. Candidate and compatibility entry points compile HTML and CSS from `web/ui` with the shared compiler. The original public files, assets and independently served routes are copied alongside the candidate assets. `VERIFIED` requires an exercised workflow, including its storage or API boundary when relevant.

| Workflow and behavior to retain | Current implementation and boundary | Existing verification | Status |
| --- | --- | --- | --- |
| Launch, onboarding, navigation, install, locale and calendar | `apps/web/src/product/{bootstrap,startup,product,navigation,routes,Onboarding,Pickers,updates}`, plus `web/ui/{index,layout,forms/date-picker,pwa}` and shared locale, calendar and focus helpers. Uses the original IndexedDB namespace and static Workbox cache. | `frontend.spec.mjs`, `screen-matrix.spec.mjs`, `visual-parity.mjs`, `offline-shell.test.mjs` | IN PROGRESS |
| Today timeline, simultaneous items and fast actions | `apps/web/src/product/Today.tsx`; `features/today/story.js`, medicine/appointment/routine card DOM and `ui/screens/today.html`. Uses the projected current owner and care index. | Timeline, focus and same-minute browser scenarios | IN PROGRESS |
| Medicine schedules, stock, units, doses, snooze, edits and deletion | `features/medicines/{editor,view,appearance,quantity,next-dose}.js`, medication rule engine, screen and dialog templates. Shared React deletion. IndexedDB commits and revisioned care sync, with reminder updates. | Care engine, schedule editor, dose and stock browser scenarios | IN PROGRESS |
| Appointment schedule, clinic zone, specialties, attendance and reminders | `features/appointments/{editor,view}.js`, appointment screen and dialogs. React calendar grid and deletion. Original date/time conversion, day buckets, care sync and notification scheduling. | Browser appointments, timezone and attendance; PostgreSQL care fixture | IN PROGRESS |
| Routines, category artwork, scheduling, progress, quantities and steps | `features/routines/{view,card,catalog,illustration}.js`, routine screen and forms. React confirmation. Uses shared routine rules and IndexedDB. | Routine browser scenarios and reminder alarm checks | IN PROGRESS |
| Water entry, editing, amount presets, goal progress, undo and family records | `apps/web/src/product/{waterController,WaterLogForm,WaterEntries}` and water summary templates in `web/ui`. Existing care index, writes, reminder update and family scope. | Water validation, unknown record field, undo, historical view and handoff cases | VERIFIED |
| Sleep entries, naps, quick start/wake, pending wake draft and trends | React `SleepForm` and `SleepHistory` with `sleepController.tsx`. Reuses the original timezone and overlap rules, storage and sync. The shared screen and dialog shells and the settings editor remain in `web/`. | Chromium and WebKit nap create/edit, stored wake draft, incomplete input, offline quick wake and stale-edit rejection, plus `sleep-cycle.test.mjs` | VERIFIED |
| Cycle entry, symptoms, estimates, sharing, print and encrypted archive | `features/cycle/{controller,daily,settings}.js`, React `CycleOverview`, cycle screen/settings/forms. Original privacy rules, local store, companion permission and archive formats. | Cycle browser logging, privacy, print and bulk restore, cycle unit tests | IN PROGRESS |
| Reports, calendar, filters, date ranges and other care metrics | `features/reports/{controller,view}.js`, insights template and React chart/stats/calendar. Shared index and local readings. | Calendar and yearly chart browser tests | IN PROGRESS |
| Settings, theme, reminders, schedule preferences and profile | `features/settings/dialog.js`, `features/reminders/controller.js`, `ui/forms/settings` and shared preferences. IndexedDB, API config and subscription state. | Browser preference and backup screens, local Workerd, closed-client alarm checks | NOT STARTED |
| Account registration, sign-in, reset and session panel | React credentials and typed account transport. Session and sync markup under `web/ui/forms/account.html`, with the sync controller. Compatible writer endpoints and cookies. | Chromium and WebKit credentials, Mailpit registration/reset, session and revocation fixture | IN PROGRESS |
| Family invitations, permissions, member switching and scoped writes | `features/family/*.js`, family dialog/context templates; typed navigation coordinates owner changes. Backend grants, session storage for pending actions and IndexedDB for personal records. | Family integration and browser permission tests; offline handoff | IN PROGRESS |
| Offline synchronization, conflict choice, retries and private fields | `features/sync/{controller,merge,private-care}.js`, React difference table and typed account transport. Existing IndexedDB metadata and API revision/receipt checks. | Browser restore/sync, idempotence, failure/retry and handoff | IN PROGRESS |
| Device archives, old encrypted backup restore and emergency export | `features/backups/{dialog,android-format,web-format}.js`, shared crypto and compatibility fixture; React emergency export. Device stores, cloud recovery key and restore intent. | Browser recovery and independent decryption, old Android backup, legacy/mixed restore cases | IN PROGRESS |
| Support and sponsored media | React components and typed support transport, legacy triggers and notice shell. Existing endpoints, rollout and locally stored campaign history. | Browser support draft/authentication, campaign impressions and loopback API check | VERIFIED |
| Administration, campaign preview, diagnostic pilot and design gallery | Independent public routes `/admin/`, `/admin/preview/`, `/pilot/` and `/design/`; backend protections and pilot compatibility API remain relevant. | Preview, administration retry, pilot unit test and browser smoke | NOT STARTED |

## Scope of the remaining `web/` tree

| Path | Current use |
| --- | --- |
| `web/ui/{index.html,assets,layout,screens,forms,styles,pwa}` | Candidate and incumbent HTML, styles, SVGs and service-worker source. Native product views and dialog shells still need migration. |
| `web/ui/gallery`, `web/public/design` | Design gallery and shared artwork at established URLs. |
| `web/public/medication` | Remaining candidate controllers and shared care, locale, crypto, IndexedDB and compatibility modules. Replaced source is still used by the incumbent and retained at published compatibility URLs. |
| `web/public/{admin,pilot}`, `web/public/pilot.js` | Separately served administration, promotion preview and pilot applications. The diagnostic pilot uses the compatibility API. |
| Other root files in `web/public` | Manifests, install icons, shared styles, font and license, root pilot worker, redirects and headers. |
| `web/src`, `web/wrangler.jsonc` | Incumbent API and compatibility infrastructure. Some shared service modules also support the portable backend. |
| `web/scripts/{build-web,workbox}.mjs`, package files and JS config | Native build and dependency entry points. The candidate uses the shared compiler and its own pnpm dependencies. |
| Other `web/scripts`, `web/browser`, `web/test`, Playwright config | Synthetic fixtures, legacy verification, benchmark, migration tools and backup compatibility tests. |
| `web/.gitignore`, `web/README.md` | Incumbent generated-file rules and usage documentation. |

## Local evidence

- Chromium and WebKit ran the eight program screens in all combinations of Persian RTL, English LTR, mobile and desktop. The screen matrix also checks horizontal overflow and runs Axe with WCAG 2.0 and 2.1 A/AA tags. The visual suite matched 104 reference captures and 1,244 static design assets. It exercised onboarding, populated forms and charts, and keyboard interactions.
- Product regressions cover sign-in, email verification, password recovery, water validation, delete confirmation, support drafts, and encrypted IndexedDB recovery. The new browser tests hold the dashboard bundle during onboarding and verify sleep edit preservation and stale-write rejection. The PostgreSQL handoff exercised Workerd/R2, Node/S3, two accounts and four offline edits, including replay and failed-copy recovery.
- An isolated checkout built the product and Journal with `pnpm --filter @medora/web build`. That checkout omitted `web/package.json`, `web/node_modules` and `web/scripts`. Its generated product HTML matched the regular build byte for byte. A second probe omitted the entire `web/` tree and failed at the import of `messages-fa.js`. The templates, asset files and browser imports in the inventory remain required.
- The three-trial cold onboarding median decreased from 7,078 to 4,993 ms at 160 ms latency and 200 kB/s download. A separate immediate-click measure reached the dashboard in 7,499 ms versus 7,056 ms at `58883c8`. See the [performance record](PERFORMANCE.md#canonical-product) for the separate measurements and tested preload tradeoffs.

All data and runtime checks used local fixtures. The release status remains **NOT READY**.
