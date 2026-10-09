// Smoke flow 3 of 3 — every nav tab actually renders when clicked.
//
// This is the exact risk class TINTA-MASTER-TRUTH.md calls out by name:
// "most of the surface built since Session 23 is still verified at the
// node --check + logic-smoketest level only, not full browser testing."
// A render*() function can pass every store.js-level test and still throw
// the moment a real click fires it — a DOM query for an id that isn't in
// that render's own template (the exact bug class the domcheck.py static
// analysis pass went hunting for earlier, and the same bug class that
// analysis can miss if it's a *runtime* mismatch, e.g. an id built from a
// variable that domcheck.py can't statically resolve).
import { test, expect } from '@playwright/test';

// Every view id from index.html's <section class="view-panel" data-view="...">
// list, grouped exactly as js/nav.js's own NAV_GROUPS defines them —
// needed because compact nav mode requires opening the SPECIFIC group a
// view lives in before its tab is clickable (each group's flyout is
// independent; opening "Plan" doesn't reveal anything in "Tools"). If a
// future view gets added/moved, both this list and the group mapping
// need the matching update — deliberately not derived automatically from
// nav.js at import time, so a typo'd data-view in a new view's markup
// gets caught here rather than silently matching nothing.
const VIEW_GROUPS = {
  write: 'write', book: 'write',
  corkboard: 'plan', outline: 'plan', timeline: 'plan', questions: 'plan',
  notes: 'world', canvas: 'world', map: 'world', sketch: 'world', references: 'world', systems: 'world',
  resume: 'tools', search: 'tools', stats: 'tools', health: 'tools', checklist: 'tools', annotations: 'tools', snippets: 'tools', decisions: 'tools',
};
const VIEWS = Object.keys(VIEW_GROUPS);

test('every nav tab opens its view with no console errors, nothing stays blank', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`[${msg.text()}]`);
  });
  page.on('pageerror', (err) => consoleErrors.push(`[pageerror] ${err.message}`));

  await page.goto('/');

  for (const view of VIEWS) {
    // Nav tabs are rendered by nav.js as buttons with data-view — same
    // selector works whether the current layout mode is the full tab bar
    // (grouped) or the compact flyout menu, but compact mode needs its
    // view's specific group opened first (each group's flyout is
    // independent — opening one doesn't reveal another's items).
    const tab = page.locator(`[data-view="${view}"]`).first();
    if (!(await tab.isVisible().catch(() => false))) {
      const groupKey = VIEW_GROUPS[view];
      await page.locator(`.nav-group-toggle[data-group="${groupKey}"]`).click({ timeout: 2000 }).catch(() => {});
    }
    await tab.click();

    await expect(
      page.locator(`.view-panel[data-view="${view}"]`),
      `view-panel for "${view}" should become the active panel after clicking its nav tab`
    ).toHaveClass(/active/);

    // Not literally empty — a view that throws mid-render can still end
    // up with the "active" class applied (if that class-add happens
    // before the throw) while its actual content never got written.
    const panelHtml = await page.locator(`.view-panel[data-view="${view}"]`).innerHTML();
    expect(panelHtml.trim().length, `view-panel for "${view}" is empty after being opened`).toBeGreaterThan(0);
  }

  expect(consoleErrors, `console errors while clicking through every view:\n${consoleErrors.join('\n')}`).toEqual([]);
});
