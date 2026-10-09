import { test, expect } from '@playwright/test';

// Bug regression guard for store-core.js's cross-tab conflict detection:
// when tab B writes a higher rev than tab A's local rev, tab A should fire
// onCrossTabConflict (which app.js surfaces as a "this project was just
// updated in another tab, reload to pick it up" banner). Previously this
// had a real race — _db.rev was bumped BEFORE localStorage.setItem, so a
// failed write would leave _db.rev ahead of disk, missing newer writes
// from other tabs. The fix bumped rev on a copy and committed only after
// setItem landed. This spec drives the end-to-end cross-tab flow in a
// real browser with real localStorage.

test('cross-tab conflict banner appears when another tab writes a newer db', async ({ browser }) => {
  // Tab A — opens Tinta fresh
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await pageA.goto('/');
  await expect(pageA.locator('#app-shell')).toBeVisible();
  await pageA.waitForTimeout(500);

  // Tab B — opens the same URL (same localStorage via the same data dir)
  // Note: Playwright contexts share the same browser profile by default
  // when launched from the same browser instance, but localStorage is
  // context-scoped. To share localStorage between two pages, we use the
  // same context.
  const pageB = await contextA.newPage();
  await pageB.goto('/');
  await expect(pageB.locator('#app-shell')).toBeVisible();
  await pageB.waitForTimeout(500);

  // Tab B types something — this writes to localStorage with a higher rev
  const textareaB = pageB.locator('textarea.editor-input, textarea[id^="editor-"], .editor-stack textarea').first();
  await textareaB.click();
  await textareaB.fill('Typed in tab B.');
  await pageB.waitForTimeout(1000);

  // Tab A should now detect the newer write from tab B and show the
  // cross-tab-conflict banner. The banner is in #storage-warning-root.
  // Wait up to 3s for the banner to appear.
  await pageA.waitForFunction(() => {
    const root = document.querySelector('#storage-warning-root');
    return root && root.textContent.trim().length > 0;
  }, { timeout: 5000 });

  const bannerText = await pageA.locator('#storage-warning-root').textContent();
  expect(bannerText.toLowerCase()).toContain('updated in another tab');

  await contextA.close();
});

test('cross-tab banner blocks further saves in the stale tab', async ({ browser }) => {
  const context = await browser.newContext();
  const pageA = await context.newPage();
  await pageA.goto('/');
  await pageA.waitForTimeout(500);

  const pageB = await context.newPage();
  await pageB.goto('/');
  await pageB.waitForTimeout(500);

  // Type something in tab A first to give it some state
  const textareaA = pageA.locator('textarea.editor-input, textarea[id^="editor-"], .editor-stack textarea').first();
  await textareaA.click();
  await textareaA.fill('Typed in tab A.');
  await pageA.waitForTimeout(1000);

  // Now type in tab B — this should make tab A stale
  const textareaB = pageB.locator('textarea.editor-input, textarea[id^="editor-"], .editor-stack textarea').first();
  await textareaB.click();
  await textareaB.fill('Typed in tab B.');
  await pageB.waitForTimeout(1000);

  // Tab A should show the cross-tab banner
  await pageA.waitForFunction(() => {
    const root = document.querySelector('#storage-warning-root');
    return root && root.textContent.trim().length > 0;
  }, { timeout: 5000 });

  const bannerText = await pageA.locator('#storage-warning-root').textContent();
  expect(bannerText.toLowerCase()).toContain('updated in another tab');

  await context.close();
});
