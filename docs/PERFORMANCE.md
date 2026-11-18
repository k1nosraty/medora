# Performance evidence

At base 5ee5e47, three cold Chromium runs at 390 × 844 simulated 160 ms latency, 200 kB/s download and 75 kB/s upload, with service workers blocked. The median time until the onboarding control became usable was 5,995 ms with 24 requests and 1,097,905 transferred bytes. Maximum of three was 5,999 ms. The generated offline shell listed 35 files totalling 1,316,425 bytes. The largest measured response was the main JS bundle at 261,105 transferred bytes.

Reproduce with `cd web && npm run build && node browser/measure.mjs`. For system Chromium set MEDORA_CHROMIUM to its executable. Usable time is an application marker. LCP, INP, CLS, TTFB, route transitions and large-list timings require separate instrumentation. Compare the same feature, device, cache state and payload before claiming an improvement.

Baseline functional browser suite passed all 80 cases across Chromium and WebKit in 2.2 minutes.
