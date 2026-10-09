// Smoke flow 1 of 3 — the app boots cleanly in a real browser.
//
// This is the single cheapest, highest-value check to have running in CI:
// every other test file in this project (js/*.smoketest.mjs) imports
// store.js directly under Node and never actually loads index.html, so
// none of them would catch a script error that prevents the app from
// rendering at all — a bad import path, a syntax error that node --check
// somehow missed in a differently-bundled file, a service-worker
// registration that throws, anything that would show a blank page to a
// real person opening the app.
import { test, expect } from '@playwright/test';

test('app boots, shows the Write view, and logs no console errors', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await page.goto('/');

  // The Write view panel starts with class "active" in the raw HTML
  // (index.html), and app.js's boot sequence should keep it (or another
  // view) visible, not throw before ever painting anything.
  await expect(page.locator('.view-panel.active')).toBeVisible();

  // A handful of always-present shell elements — if any of these are
  // missing, boot got far enough to avoid a blank page but not far
  // enough to be a usable app.
  await expect(page.locator('#new-chapter-btn')).toBeVisible();
  await expect(page.locator('#chapter-list')).toBeAttached();
  await expect(page.locator('#nav-tabs-groups')).toBeVisible();

  expect(consoleErrors, `console errors during boot:\n${consoleErrors.join('\n')}`).toEqual([]);
});

test('a fresh install lands on a project with one chapter by default', async ({ page }) => {
  await page.goto('/');
  // store.js's emptyDb()/makeProject() creates a first project with a
  // default "Chapter One"-style entry — this is the real end-to-end
  // check that load()'s bootstrap path (not just its unit-tested shape)
  // produces something a first-time user can immediately start typing
  // into, no empty-state dead end.
  await expect(page.locator('.sb-chapter')).toHaveCount(1);
});
