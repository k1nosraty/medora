# Performance evidence

At base 5ee5e47, three cold Chromium runs at 390 × 844 simulated 160 ms latency, 200 kB/s download and 75 kB/s upload, with service workers blocked. The median time until the onboarding control became usable was 5,995 ms with 24 requests and 1,097,905 transferred bytes. Maximum of three was 5,999 ms. The generated offline shell listed 35 files totalling 1,316,425 bytes. The largest measured response was the main JS bundle at 261,105 transferred bytes.

Reproduce with `cd web && npm run build && node browser/measure.mjs`. For system Chromium set MEDORA_CHROMIUM to its executable. Usable time is an application marker. LCP, INP, CLS, TTFB, route transitions and large-list timings require separate instrumentation. Compare the same feature, device, cache state and payload before claiming an improvement.

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

The same throttled Chromium script and onboarding marker ran three cold trials on /medication/. The median was 5,997 ms with 1,126,633 transferred bytes. The original baseline was 5,995 ms and 1,097,905 bytes. A preliminary candidate that loaded React DOM before showing the welcome screen measured 7,122 ms. The candidate now attaches working controls to the delivered markup immediately and loads the renderer separately. The measured 2 ms difference from the original is within the spread of these trials.

The candidate offline shell has 37 entries totaling 1,554,962 bytes. The release reference had 35 entries totaling 1,316,425 bytes. The additional renderer still costs storage and transfer on first installation. Field input latency, physical-device install and large-history rendering for all eight product screens remain open.

Reproduce with `node web/browser/measure.mjs apps/web/dist 3` after a candidate build.
