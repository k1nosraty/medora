# Medora interface

The three-leaf mark, emerald header, soft mist surfaces and optical-glass artwork come from the current application. Use the existing licensed Vazirmatn font. Preserve familiar Persian labels, visible focus, logical spacing, native form semantics and bidirectional isolation for numbers and times. Locale and calendar are independent settings.

The reference palette uses primary #006F68, forest #103D38, page #EAF5EE, field #F7FCF9, muted text #46645E and water #A8DDF2. Source tokens and dark themes live in web/ui/styles/theme.css. Today puts daily tasks and status first, while program editors progressively disclose details. See docs/design/EMERALD-SPEC.md and the optional gallery at /design/ for the visual reference.

Verify at 320 CSS pixels and desktop width, in Persian RTL and English LTR, with keyboard focus, larger type and reduced motion. Verify civil dates using both Solar Hijri and Gregorian calendars. A recreated screen requires functional and accessibility evidence before it can replace its legacy route.

The candidate uses native labelled controls, a keyboard-focused main region on route change, scalable CSS tokens, contrast-aware dark surfaces, lazy route status, touch-sized actions and always-visible navigation. Its history uses forty rows per page with the total calculated across the entire selected day. The report uses row/column headers and a horizontally scrollable table on narrow screens. Playwright exercised Persian RTL, English LTR, a 320px report and a 360px offline water journal on Chromium and WebKit. The water workflow passed the WCAG 2/2.1 A and AA axe rules exercised by the test. The narrower screen and keyboard checks cover the tested routes. Manual screen-reader, larger-type and platform install coverage remain open.
