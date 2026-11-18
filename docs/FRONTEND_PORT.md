# Frontend port status

The canonical product route is `/medication/`. The React and Dexie journal at `/journal/` has separate UI and local storage. It is not a replacement for the canonical product or its existing user database.

`apps/web/src/product` owns the product's TypeScript entry, startup, route coordination, writer-aware account transport, and React features. `apps/web/scripts/product.mjs` builds these modules and checks esbuild's input graph for replaced modules. The build still consumes the original HTML, CSS, translations, art, PWA shell and unported controllers from `web/`. `web/` also builds the incumbent app and supplies legacy server fixtures and historical public module URLs.

| Product surface | React or TypeScript in the canonical build | Remaining browser dependency |
| --- | --- | --- |
| Startup, onboarding, install and navigation | TypeScript bootstrap, browser history, date/time coordination, gestures and update checks. React onboarding, week strip, month grid and time picker. | Static shell, localization, calendar formatting and Workbox service-worker script. |
| Today | React empty/completed state and same-time navigation controls. | Story timer, populated timeline cards, reminder onboarding, header and program-card shell. |
| Medicines | Shared React deletion confirmation and TypeScript entry routing. | Schedule editor, phases, stock and units, appearance, cabinet search, dose logging, snooze and dose history. |
| Appointments | Shared React confirmation and calendar grid. | Appointment editor and list, specialty and appearance, clinic timezone, attendance and cancellation. |
| Routines | Shared React confirmation and TypeScript entry routing. | Editor, category catalog, schedule, steps, quantities and routine cards. |
| Water | TypeScript entry and tracking controller, React date/time form and history. Editing preserves existing record metadata. | Summary templates, IndexedDB and account sync. |
| Sleep | React history and trend. | Sleep editor, quick actions, settings, timing and summary controller. |
| Cycle | React week, trend, history and shared confirmation. | Daily health form, settings, companion preferences, estimates, print and cycle archive flows still use legacy controllers or shared helpers. |
| Insights | React statistics, water chart and calendar grid. TypeScript water chart model. | Report filters, calendar agenda, other program graphs and report orchestration. |
| Account, settings and households | Lazy React credential forms for sign-in, registration, email verification and password reset. TypeScript writer-aware API transport and route coordination. | The signed-in session and sync panels, profile, theme and notification settings, family panels, invitations and scoped actions. |
| Sync and backups | React conflict difference rows and emergency IndexedDB export form. | Synchronization loop, IndexedDB schemas, encryption, conflict decisions, device and cloud archives and restore intent. |
| Support, notices and sponsored messages | React support form and ticket history, campaign banner and media dialog. TypeScript support API and campaign scheduling. | Shared translations, settings trigger, notice shell and storage for campaign history. |
| `/admin/`, `/admin/preview/`, `/design/`, `/pilot/` | Served alongside the product through their original public routes. | Existing administration, campaign preview, design gallery and diagnostic pilot. The pilot also requires the legacy runtime in compatibility mode. |

The bundle guard covers the replaced entry points and controllers. Static compatibility files are still emitted at their historical paths for installed clients, the design gallery, direct import tests, or approved recovery.

## Dependency boundaries

- **Build inputs.** `apps/web/scripts/product.mjs` calls `web/scripts/build-web.mjs` for original templates, styles, assets, translations, and the Workbox precache. The Journal has its own Vite entry.
- **Immediate browser dependencies.** `product.ts` still imports the JavaScript medicine editor and view, family, reminders, backups and sync modules. `navigation.ts` wires the JS settings, appointment, sleep, cycle and insights controllers. `web/` also supplies shared focus, artwork, locale and domain helpers.
- **Indirect dependencies.** Unported controllers use the existing IndexedDB storage and schemas, care and scheduling rules, cryptography, and device recovery. Shared format and storage modules are still needed by the older client too. The typed account transport negotiates the PostgreSQL and compatibility APIs while retaining session and sync continuity.
- **Server runtime.** Node and Workerd tests against PostgreSQL exercise backend portability. Frontend independence remains open while `apps/web` consumes the original build inputs and controller modules.

## Local evidence

- Chromium and WebKit ran the eight program screens in all combinations of Persian RTL, English LTR, mobile and desktop. The screen matrix also checks horizontal overflow and runs Axe with WCAG 2.0 and 2.1 A/AA tags. The visual suite matched 104 reference captures and 1,244 static design assets. It exercised onboarding, populated forms and charts, and keyboard interactions.
- Product regressions cover sign-in, email verification, password recovery, water validation and editing with additional record fields, confirmation before deletion, support errors and drafts, and encrypted IndexedDB recovery. Smoke checks opened `/admin/`, `/admin/preview/`, `/design/` and `/pilot/` in both engines. PostgreSQL fixture checks exercised local sync, Workerd/R2, and transfer to Node and back after four offline edits from two accounts.
- Under the local 160 ms / 200 kB/s download profile, the three-trial median to usable onboarding increased from 5,996 ms at `0a82e7b` to 7,011 ms. Loading React for the migrated first paint is now on the critical path. The median transferred bytes increased from 1,132,481 to 1,331,510. Cold-start performance remains open.

All data and runtime checks used local fixtures. The release status remains **NOT READY**.
