// Playwright config — debt-fix pass, "stand up Playwright with 3 smoke
// flows." Deliberately minimal: these three specs exist to catch the one
// class of bug nothing else in this codebase's test suite can catch —
// render-behavior bugs in a real browser (a handler wired to an id that
// doesn't exist in that render's own template, a view that throws when
// actually clicked into, data that doesn't survive a real reload through
// real localStorage). Every other test in js/*.smoketest.mjs runs against
// store.js directly under Node with a localStorage shim; none of them
// ever load index.html or click anything.
//
// NOTE for whoever runs this first: these specs are written and were
// checked for correct selectors against the real index.html/nav.js
// markup, but have NOT been executed — the sandbox that wrote them could
// not download a Chromium binary (cdn.playwright.dev isn't reachable from
// there). Run `npx playwright test` yourself and expect the first run to
// need a little debugging, the way any freshly-written test suite would.
//
// Update, next session: still couldn't execute — same cdn.playwright.dev
// restriction, confirmed again (npm install itself works fine; the
// browser binary download is the blocked part). Did the next best thing
// instead: went through every selector in all 3 specs by hand against
// the real index.html/nav.js/app.js, rather than just re-trusting the
// prior pass's claim that they were checked. All selectors confirmed
// correct except one real bug this caught before it ever ran — app.js's
// boot sequence always set activeChapterId to the first chapter by
// `order`, ignoring which chapter (if any) was actually last active, so
// 02-write-and-persist.spec.js's reload assertion would have failed for
// a real reason (not a flaky test) the first time this actually runs in
// a browser. Fixed in app.js/store.js (see getLastActiveChapter) rather
// than weakening the spec — the spec's original assumption was the
// correct one, the app just didn't live up to it yet.
import { defineConfig, devices } from '@playwright/test';

// Update, hardening pass (2026-09-06): EXECUTED for the first time, in a
// sandbox that already had Chromium builds cached (the download restriction
// that blocked the two earlier sessions doesn't apply there). npm install
// with @playwright/test@1.62.1 (matching the cached chromium build and the
// preinstalled global CLI; the previously declared ^1.63.0 range was
// narrowed to ^1.62.1 for exactly that reason). First-ever results: the
// full suite passes 5/5 — boot, write-and-persist through a real reload
// with real localStorage, and the 16-tab navigation sweep with a strict
// no-console-errors gate. One intermittent infra flake observed (~1 run
// in 3): chromium dies between tests ("browser.newContext: Target page,
// context or browser has been closed") with a different victim each run
// and zero assertion failures — a sandbox resource kill, not an app bug;
// a plain re-run goes green. The "expect the first run to need a little
// debugging" prediction above held in the best possible way: the specs
// themselves needed nothing.

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // each test drives its own fresh browser context/localStorage, but the dev server is one shared process — keep it simple and serial for now
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8420',
    trace: 'retain-on-failure',
    // v0.2.9 — skip onboarding + welcome screen in tests. Both overlays
    // fire on fresh installs and would block test interactions. This
    // flag is checked by app.js's init() — when set, neither overlay
    // shows, so tests boot straight to the editor (same as v0.2.8).
    initScripts: [
      { script: `window.__TINTA_SKIP_BOOT_OVERLAYS = true;` },
    ],
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Same local-serving convention this project already uses elsewhere
  // (python -m http.server) — index.html loads its scripts as ES modules,
  // which real browsers refuse to fetch over file://, so a static server
  // is required, not optional.
  webServer: {
    command: 'python3 -m http.server 8420',
    url: 'http://localhost:8420',
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  },
});
