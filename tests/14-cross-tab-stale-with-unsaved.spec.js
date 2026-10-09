import { test, expect } from '@playwright/test';

// Failure-path spec: cross-tab stale write with unsaved debounced content.
//
// Bug this guards against: when tab B writes a newer db while tab A's
// editor has unsaved debounced content (the writer typed but the 600ms
// autosave timer hasn't fired yet), tab A detects staleness via the
// storage event, fires onCrossTabConflict, and the banner appears.
// handleStorageEvent cancels any pending retry (clearSaveRetry) — but
// what about the editor's own pending debounce? If the editor's
// scheduleSave timer fires AFTER staleness is detected, save() refuses
// to write (returns false), so the debounced content is silently
// dropped. The writer loses their last ~600ms of typing.
//
// The fix path: when staleness is detected, the editor should flush its
// pending debounce BEFORE the storage event handler refuses to write.
// Or: the banner should explicitly tell the writer "your unsaved
// changes from the last 600ms could not be saved — copy them out
// before reloading."
//
// This spec drives the flow end-to-end to verify the current behavior
// and document what the writer experiences.

test('cross-tab stale banner appears even when tab A has unsaved debounced content', async ({ browser }) => {
  const context = await browser.newContext();
  const pageA = await context.newPage();
  await pageA.goto('/');
  await expect(pageA.locator('#app-shell')).toBeVisible();
  await pageA.waitForTimeout(500);

  const pageB = await context.newPage();
  await pageB.goto('/');
  await expect(pageB.locator('#app-shell')).toBeVisible();
  await pageB.waitForTimeout(500);

  // In tab A, type something but DON'T wait for the autosave debounce.
  // The content is in the textarea but not yet saved to localStorage.
  const textareaA = pageA.locator('textarea').first();
  await textareaA.click();
  await textareaA.fill('Typed in tab A, not yet autosaved.');
  // Wait only 100ms — well under the 600ms autosave debounce.
  await pageA.waitForTimeout(100);

  // Now tab B writes — this fires a storage event in tab A.
  const textareaB = pageB.locator('textarea').first();
  await textareaB.click();
  await textareaB.fill('Typed in tab B — this should make tab A stale.');
  await pageB.waitForTimeout(1000); // wait for tab B's autosave to fire

  // Tab A should now show the cross-tab banner.
  await pageA.waitForFunction(() => {
    const root = document.querySelector('#storage-warning-root');
    return root && root.textContent.trim().length > 0;
  }, { timeout: 5000 });

  const bannerText = (await pageA.locator('#storage-warning-root').textContent()) || '';
  expect(bannerText.toLowerCase()).toContain('updated in another tab');

  // The banner should offer a Reload action.
  expect(bannerText.toLowerCase()).toMatch(/reload/);

  // Tab A's textarea should still show the unsaved content (it's still
  // in the DOM, even if it can't be saved). This is the writer's last
  // chance to copy it out before reloading.
  const textareaAContent = await textareaA.inputValue();
  expect(textareaAContent).toContain('Typed in tab A, not yet autosaved.');

  await context.close();
});

test('cross-tab stale banner is persistent (cannot be dismissed without reload)', async ({ browser }) => {
  // The banner is shown with { persistent: true } — no dismiss button.
  // This spec verifies that. A regression that adds a dismiss button
  // would let the writer keep typing into a stale tab, losing every
  // subsequent save silently.

  const context = await browser.newContext();
  const pageA = await context.newPage();
  await pageA.goto('/');
  await pageA.waitForTimeout(500);

  const pageB = await context.newPage();
  await pageB.goto('/');
  await pageB.waitForTimeout(500);

  // Write in tab B to make tab A stale.
  const textareaB = pageB.locator('textarea').first();
  await textareaB.click();
  await textareaB.fill('Tab B content.');
  await pageB.waitForTimeout(1000);

  // Tab A should show the banner.
  await pageA.waitForFunction(() => {
    const root = document.querySelector('#storage-warning-root');
    return root && root.textContent.trim().length > 0;
  }, { timeout: 5000 });

  // The banner should NOT have a dismiss (✕) button — only a Reload action.
  // Look for any button inside #storage-warning-root that's a "dismiss"
  // button. The persistent banner has only the "Reload now" action.
  const dismissButtons = await pageA.locator('#storage-warning-root button:has-text("✕"), #storage-warning-root button:has-text("Dismiss"), #storage-warning-root button:has-text("Close")').count();
  expect(dismissButtons).toBe(0);

  // The Reload button should be present.
  const reloadButton = pageA.locator('#storage-warning-root button:has-text("Reload")');
  await expect(reloadButton).toBeVisible();

  await context.close();
});
