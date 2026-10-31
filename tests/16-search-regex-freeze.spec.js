// Browser-level spec for CR-43 — search hardening.
//
// The bug: searchProject() ran synchronously on the main thread, once
// per keystroke, with no execution limit on the user's regex. A pattern
// like (a+)+c against one bad chapter backtracks exponentially inside a
// single exec() call and froze the entire app — the writer couldn't
// type, click, or even close the tab cleanly.
//
// The fix is layered, and the Node smoketest (search-hardening.smoketest.mjs)
// pins the engine/service mechanics. What ONLY a real browser can prove:
//
//   1. The worker backend actually runs (CSP `worker-src 'self'` allows
//      the module worker; a wiring mistake — wrong path, SW precache
//      drift, module resolution — would silently drop to fallback).
//   2. A catastrophic pattern CANNOT block the main thread: while the
//      search is wedged in the worker, the page still answers evaluate()
//      instantly. This is the exact user-visible property the fix exists
//      for.
//   3. The hard watchdog terminates the wedged worker and the view
//      surfaces an honest "Search stopped" note — not a spinner, not a
//      silent zero-result lie.
//   4. The global result cap is surfaced honestly too ("Result cap
//      reached"), so partial results never masquerade as total ones.

import { test, expect } from '@playwright/test';

// Boot with the Store test seam so fixtures can be seeded in one
// evaluate() instead of hundreds of UI clicks (same seam as
// 12-quota-exceeded.spec.js; never set in production).
async function bootWithStoreSeam(page) {
  await page.addInitScript(() => {
    window.__TINTA_EXPOSE_STORE = true;
  });
  await page.goto('/');
  await page.evaluate(() => window.__TINTA_STORE && window.__TINTA_STORE.ready());
}

async function openSearchView(page) {
  // Search lives in the Tools group (same nav topology the
  // 03-view-navigation spec pins): open the group if its flyout is
  // needed, then click the tab and wait for the panel to activate.
  const tab = page.locator('[data-view="search"]').first();
  if (!(await tab.isVisible().catch(() => false))) {
    await page.locator('.nav-group-toggle[data-group="tools"]').click({ timeout: 2000 }).catch(() => {});
  }
  await tab.click();
  await expect(page.locator('.view-panel[data-view="search"]')).toHaveClass(/active/);
}

// The main-thread responsiveness probe. If search work ever leaks back
// onto the main thread (a regression to sync search), this evaluate
// queues behind the regex backtracking and the race rejects — failing
// the spec the way the original bug deserved.
async function expectMainThreadResponsive(page) {
  await Promise.race([
    page.evaluate(() => 40 + 2),
    new Promise((_, reject) => setTimeout(() => reject(new Error('main thread blocked — search work leaked off the worker')), 2000)),
  ]);
}

test('a catastrophic regex cannot freeze the app — watchdog stops it, UI stays responsive, note is honest', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(`[${msg.text()}]`); });
  page.on('pageerror', (err) => consoleErrors.push(`[pageerror] ${err.message}`));

  await bootWithStoreSeam(page);

  // One chapter whose content sends (a+)+c into exponential
  // backtracking: the a-run has 2^44 partitions and no 'c' ever
  // matches. No cooperative check can fire — the engine is stuck
  // INSIDE a single exec() call — so this exercises the hard watchdog
  // path, not the cooperative budget.
  await page.evaluate(() => {
    const Store = window.__TINTA_STORE;
    const ch = Store.createChapter('ReDoS bait');
    Store.updateChapterContent(ch.id, 'a'.repeat(45) + 'b');
  });

  await openSearchView(page);

  // Regex mode FIRST, then the query — one clean run with the same
  // options, no supersede branches in the middle of the assertion.
  await page.check('#search-regex');
  await page.fill('#search-query', '(a+)+c');

  // THE assertion: while that pattern is wedged in the worker, the
  // main thread still answers immediately. (Pre-fix, this exact probe
  // hung — the same code path was busy backtracking on the main thread.)
  await expectMainThreadResponsive(page);
  await expectMainThreadResponsive(page);

  // The watchdog arms at engine budget (2000ms) + grace (1500ms); the
  // note must land shortly after without any user intervention.
  await expect(
    page.locator('.search-stopped-note'),
    'the hard-stop note replaces results when the worker is terminated'
  ).toContainText('Search stopped', { timeout: 10_000 });
  await expect(page.locator('.search-stopped-note')).toContainText('too expensive');

  // And the app is still fully alive afterwards — the worker respawn
  // path must leave a usable view (the note alone would pass even if
  // the render had crashed, so prove interactivity directly).
  await expectMainThreadResponsive(page);
  await page.fill('#search-query', 'b');
  await expect(page.locator('.search-total')).toContainText('match', { timeout: 5000 });

  expect(consoleErrors, 'no console/page errors during the freeze-and-recover cycle').toEqual([]);
});

test('the global result cap is surfaced honestly, not shown as a total result set', async ({ page }) => {
  await bootWithStoreSeam(page);

  // 120 chapters × 20 matches (the per-field cap) = 2400 potential —
  // past the 2000-match global cap, so the run must stop with the cap
  // reason and say so.
  await page.evaluate(() => {
    const Store = window.__TINTA_STORE;
    for (let i = 0; i < 120; i++) {
      const ch = Store.createChapter(`Cap fixture ${i + 1}`);
      Store.updateChapterContent(ch.id, 'x'.repeat(25));
    }
  });

  await openSearchView(page);
  await page.fill('#search-query', 'x');

  await expect(
    page.locator('.search-stopped-note'),
    'the cap note appears once the run trips the 2000-match limit'
  ).toContainText('Result cap reached', { timeout: 10_000 });

  // The partial results are still shown (that's the point of a cap —
  // they're useful), with the honest note next to them.
  await expect(page.locator('.search-section').first()).toBeVisible();

  // And the main thread was never blocked by a plain query either.
  await expectMainThreadResponsive(page);
});

test('an ordinary literal search still renders full results with no stopped note', async ({ page }) => {
  await bootWithStoreSeam(page);
  await page.evaluate(() => {
    const Store = window.__TINTA_STORE;
    const ch = Store.createChapter('Ordinary');
    Store.updateChapterContent(ch.id, 'the castle stood above the harbor, and the castle watched the sea');
  });

  await openSearchView(page);
  await page.fill('#search-query', 'castle');

  await expect(page.locator('.search-total')).toContainText('2 matches', { timeout: 5000 });
  await expect(page.locator('.search-stopped-note')).toHaveCount(0);
  await expect(page.locator('.search-section', { hasText: 'Chapters' })).toBeVisible();

  // The replace panel offers a real, count-backed button once the run
  // completed — the counts came from the same budgeted worker pass.
  await expect(page.locator('#search-replace-btn')).toContainText('Replace 2 matches in 1 chapter');
});
