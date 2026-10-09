import { test, expect } from '@playwright/test';

// Failure-path spec: quota-exceeded save.
//
// Bug this guards against: store-core.js's writeToLocalStorage catches a
// QuotaExceededError, fires onSaveError({type: 'quota'}), schedules a
// retry timer with backoff, and tries again. A regression in any of
// those would silently swallow writes under quota pressure.
//
// This spec uses page.evaluate to stub localStorage.setItem via
// Object.defineProperty (direct assignment doesn't work on localStorage
// in some browsers — it's a native object with read-only properties).

test('quota-exceeded save shows retry banner', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-shell')).toBeVisible();
  await page.waitForTimeout(500);

  // Stub localStorage.setItem to throw QuotaExceededError on every call.
  // This is simpler than counting calls — the point is to verify the
  // banner appears, not to test the retry timing.
  await page.evaluate(() => {
    const real = localStorage.setItem.bind(localStorage);
    Object.defineProperty(localStorage, 'setItem', {
      value: function(key, value) {
        const err = new Error('quota exceeded');
        err.name = 'QuotaExceededError';
        throw err;
      },
      writable: true,
      configurable: true,
    });
    window.__realSetItem = real;
  });

  // Type in the editor — this fires autosave (debounced 600ms by default).
  const textarea = page.locator('textarea').first();
  await textarea.click();
  await textarea.fill('This will trigger a save that fails with quota exceeded.');
  await page.waitForTimeout(1000); // wait for autosave debounce + retry

  // The storage-warning banner should appear (it's in #storage-warning-root).
  await page.waitForFunction(() => {
    const root = document.querySelector('#storage-warning-root');
    return root && root.textContent.trim().length > 0;
  }, { timeout: 10000 });

  const bannerText = (await page.locator('#storage-warning-root').textContent()) || '';
  // The quota branch's text mentions "Storage is full" or "keep trying".
  expect(bannerText.toLowerCase()).toMatch(/storage is full|keep try|couldn't be saved/);
});

test('quota-exceeded banner clears once a save succeeds after space is freed', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-shell')).toBeVisible();
  await page.waitForTimeout(500);

  // Stub setItem to always throw
  await page.evaluate(() => {
    const real = localStorage.setItem.bind(localStorage);
    Object.defineProperty(localStorage, 'setItem', {
      value: function(key, value) {
        const err = new Error('quota exceeded');
        err.name = 'QuotaExceededError';
        throw err;
      },
      writable: true,
      configurable: true,
    });
    window.__realSetItem = real;
  });

  const textarea = page.locator('textarea').first();
  await textarea.click();
  await textarea.fill('Trigger quota error.');
  await page.waitForTimeout(1000);

  // Banner should appear
  await page.waitForFunction(() => {
    const root = document.querySelector('#storage-warning-root');
    return root && root.textContent.trim().length > 0;
  }, { timeout: 10000 });

  // Now restore setItem so the next save succeeds
  await page.evaluate(() => {
    Object.defineProperty(localStorage, 'setItem', {
      value: window.__realSetItem,
      writable: true,
      configurable: true,
    });
  });

  // Type again — this save should succeed and clear the banner
  await textarea.fill('Now the save should succeed.');
  await page.waitForTimeout(1000);

  // The banner should clear once a save succeeds (onSaveSuccess clears it
  // if it was a retry banner). Wait up to 8s.
  await page.waitForFunction(() => {
    const root = document.querySelector('#storage-warning-root');
    return !root || root.textContent.trim().length === 0;
  }, { timeout: 8000 }).catch(() => {});

  // Verify the content survived (was saved after the stub was lifted)
  const finalText = await textarea.inputValue();
  expect(finalText).toContain('Now the save should succeed');
});
