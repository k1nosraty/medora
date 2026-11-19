# Performance evidence

At base 5ee5e47, three cold Chromium runs at 390 × 844 simulated 160 ms latency, 200 kB/s download and 75 kB/s upload, with service workers blocked. The median time until the onboarding control became usable was 5,995 ms with 24 requests and 1,097,905 transferred bytes. Maximum of three was 5,999 ms. The generated offline shell listed 35 files totalling 1,316,425 bytes. The largest measured response was the main JS bundle at 261,105 transferred bytes.

Reproduce with `npm --prefix web run build && node tests/browser/measure.mjs web/public 3`. For system Chromium set MEDORA_CHROMIUM to its executable. Usable time is an application marker. LCP, INP, CLS, TTFB, route transitions and large-list timings require separate instrumentation. Compare the same feature, device, cache state and payload before claiming an improvement.

Baseline functional browser suite passed all 80 cases across Chromium and WebKit in 2.2 minutes.

## Separate device journal measurements

Three cold Chromium trials used a 390 × 844 viewport, 160ms artificial latency, 200kB/s download, 75kB/s upload and a blocked service worker. Each trial used a fresh browser profile. The shell was served from a Vite build preview on loopback. Each timing below is the median of the three trials.

| Measurement | Candidate |
| --- | ---: |
| Navigation response start (TTFB) | 161ms |
| Largest contentful paint | 1,864ms |
| Cumulative layout shift | 0.0058 |
| Today heading available | 1,513ms |
| Water route from navigation click to form control | 319ms |
| Longest observed qualifying interaction in trial | 16ms |
| Water route reload with 12,000 seeded rows, 2,001 on the selected day | 1,013ms |
| Initial JavaScript (raw / gzip at build time) | 500,752 / 154,530 bytes |

The large-history test renders 40 entries per page and verifies forward paging. The initial and large-list measurements use different cache conditions. INP at the population level needs field observations. The legacy timing ends at onboarding, while the rebuilt marker is Today. The available features differ between the two builds.

Use a fresh web build, start Vite preview and run `node scripts/verification/performance.mjs http://127.0.0.1:48821`. Set MEDORA_CHROMIUM when using a system Chrome executable. For this fixture the working budgets are a 2.5s cold LCP, CLS below 0.1, a 500ms water transition and 160KiB initial JS gzip. Re-evaluate with identical features, a slower physical device and the approved hosted origin before release.

## Canonical product

Three cold Chromium trials per build used the unchanged `/medication/` welcome-button marker, 390 × 844 viewport, 160 ms latency, 200 kB/s down and 75 kB/s up. Service workers were blocked for both builds. The earlier six-second result used the same definition.

| Measurement | Starting commit `58883c8` | Candidate |
| --- | ---: | ---: |
| Median to usable onboarding | 7,078 ms | 4,993 ms |
| Median requests at the marker | 24 | 21 |
| Median bytes at the marker | 1,331,510 | 879,563 |
| Static offline shell files and bytes | 37 / 1,568,732 | 40 / 1,575,475 |
| Median to focused dashboard when clicking immediately in a separate run | 7,056 ms | 7,499 ms |

The startup code now reads IndexedDB and presents React onboarding with a small, build-generated bilingual dictionary. The first visit defers the large dashboard graph and full translations until the controls paint or the user starts the workflow. The largest single JavaScript response on the onboarding path dropped from 386,121 to 223,374 transferred bytes. The same CSS, font, and installed cache policy remain in use. The delay test holds the dashboard bundle and verifies an enabled welcome button, an in-progress state, and a single transition to the focused dashboard after the bundle is released.

The immediate-click run exposes the remaining handoff cost. A local trial starting the full locale download in parallel measured 5,003 ms to onboarding and 7,535 ms to the dashboard. A low-priority HTML preload of the dashboard measured 6,048 ms to onboarding and 7,185 ms to the dashboard. The shipped split meets the six-second onboarding target. To reduce the remaining wait, split route-specific medication, family, settings and reports code away from the default dashboard entry and repeat both markers on the same network profile after each slice. Field latency, physical-device install and representative large histories remain open.

Reproduce with `node tests/browser/measure.mjs apps/web/dist 3` after a candidate build.

### Medication and dose phase

The canonical onboarding benchmark was repeated on `d95dd82` and the medication candidate using three cold Chromium trials, the same 390 × 844 viewport, 160 ms latency, 200 kB/s down, 75 kB/s up, and blocked service workers. The usable welcome button remained the timing marker.

| Cold startup marker | `d95dd82` | Medication candidate |
| --- | ---: | ---: |
| Median usable onboarding | 5,055 ms | 4,989 ms |
| Median requests at readiness | 21 | 21 |
| Median bytes transferred at readiness | 879,563 | 867,816 |
| Static shell count and bytes | 40 / 1,575,475 | 40 / 1,581,968 |

The medication benchmark kept the same network and viewport. It used a ready dashboard with 24 synthetic plans, each with one daily dose, and measured the cabinet render, details open, and one dose saved to IndexedDB. Each median uses three fresh Chromium contexts. These are loopback interaction samples with desktop hardware and mobile dimensions.

| Median measurement | `d95dd82` | Medication candidate |
| --- | ---: | ---: |
| Navigation to all 24 plans and doses in the DOM | 23 ms | 25 ms |
| Navigation through the next animation frame | 48 ms | 35 ms |
| Details dialog ready / next animation frame | 8 / 26 ms | 9 / 16 ms |
| Dose transaction and status update / next animation frame | 20 / 27 ms | 10 / 26 ms |
| Resource requests across those actions | 0 | 0 |
| All canonical JS chunks, raw / gzip | 841,893 / 240,890 bytes | 860,133 / 245,583 bytes |

Run `node tests/browser/measure.mjs apps/web/dist 3` for onboarding and `node tests/browser/measure-medication.mjs <baseline-assets> apps/web/dist` for the interaction comparison. Set `MEDORA_CHROMIUM` to the system executable if needed. Physical-device, hosted, and large-history observations remain open.

### Appointments, routines and shared frontend migration

Three fresh Chromium contexts per build repeated the same 390 × 844 loopback benchmark. Network settings were 160 ms latency, 200 kB/s download and 75 kB/s upload. Service workers were blocked. Onboarding readiness still means the first visible start control.

| Median measurement | Fresh `676c472` baseline | Rebuild candidate |
| --- | ---: | ---: |
| Usable onboarding | 5,087 ms | 4,541 ms |
| Requests at onboarding readiness | 21 | 19 |
| Bytes at onboarding readiness | 867,816 | 770,738 |
| Static shell files and bytes | 40 / 1,581,968 | 40 / 1,584,255 |
| Medication navigation with 24 synthetic plans, through next frame | 34 ms | 36 ms |
| Medication details, through next frame | 16 ms | 16 ms |
| Dose commit and status, through next frame | 42 ms | 26 ms |
| Resource requests during those three medication interactions | 0 | 0 |
| Total canonical JS, raw / gzip | 860,133 / 245,583 bytes | 909,647 / 257,651 bytes |

`node tests/browser/measure.mjs apps/web/dist 3` measured onboarding. `node tests/browser/measure-medication.mjs <baseline-assets> apps/web/dist` measured the three warm interactions. A separate run used the same throttle and clicked immediately after the welcome control appeared. With `--dashboard` added to the onboarding command, the three-trial median from navigation to the focused dashboard moved from 7,555 ms to 7,289 ms. Larger routine and appointment histories and physical devices remain open.

A separate unthrottled loopback fixture used 120 synthetic appointments at 390 × 844 with the service worker enabled. In three fresh Chromium contexts the warm first-page route through the next frame moved from 67 to 53 ms. The cached offline reload until the first 20 cards were ready moved from 111 to 93 ms. These browser timings exclude physical-device and hosted latency.

### Account, reminder preferences and frontend source move

The loopback comparison starts at `eb063ce`. Each build ran three cold Chromium trials at 390 × 844, with 160 ms latency, 200 kB/s down, 75 kB/s up and service workers blocked. The same command measures the usable welcome button and the focused dashboard after an immediate click.

| Median measurement | `eb063ce` | Candidate |
| --- | ---: | ---: |
| Usable welcome button | 4,559 ms | 4,500 ms |
| Focused dashboard | 7,333 ms | 7,259 ms |
| Requests at onboarding readiness | 19 | 19 |
| Bytes transferred at onboarding readiness | 770,738 | 750,709 |
| Static offline shell files and bytes | 40 / 1,584,255 | 40 / 1,582,167 |
| Medication navigation with 24 synthetic plans, through next frame | 31 ms | 30 ms |
| Medication details, through next frame | 16 ms | 16 ms |
| Dose commit and status, through next frame | 26 ms | 26 ms |
| Resource requests across the three medication actions | 0 | 0 |
| All canonical JS chunks, raw / gzip | 909,647 / 257,651 bytes | 927,588 / 263,013 bytes |

Reproduce with `node tests/browser/measure.mjs apps/web/dist 3 --dashboard` and `node tests/browser/measure-medication.mjs <baseline-assets> apps/web/dist`. The six-second threshold applies to the welcome-button marker. The distinct dashboard path still exceeds seven seconds in this network profile. Route-specific splitting, physical-device startup and hosted latency remain open.

### Family, notifications, Today, Settings and Cycle ownership

Three cold Chromium trials per build used the same 390 × 844 viewport, 160 ms latency, 200 kB/s down, 75 kB/s up and blocked service workers. Both builds were produced locally from their source. The tracked markers and launch script match the previous comparison.

| Median measurement | `8052d1a` | Candidate |
| --- | ---: | ---: |
| Usable welcome button | 4,485 ms | 4,492 ms |
| Focused dashboard after immediate click | 7,222 ms | 7,113 ms |
| Requests at onboarding readiness | 19 | 19 |
| Bytes transferred at onboarding readiness | 750,709 | 716,731 |
| Static offline shell files and bytes | 40 / 1,582,167 | 40 / 1,562,876 |

The warm medication comparison used 24 plans and the same network conditions. Navigation through the next frame measured 30 to 37 ms, details 17 to 16 ms, and dose commit 26 to 27 ms across three trials per build. These actions made zero network requests. Total canonical JavaScript measured 927,588 to 942,274 raw bytes and 263,013 to 263,278 gzip bytes.

Reproduce with `node tests/browser/measure.mjs apps/web/dist 3 --dashboard`. The median remains within the six-second onboarding budget. Physical-device and hosted performance remain release gates.
