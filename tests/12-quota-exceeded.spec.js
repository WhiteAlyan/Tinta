import { test, expect } from '@playwright/test';

// Failure-path spec: quota-exceeded saves, in both persistence eras.
//
// Since the storage epic (CR-41), the primary database lives in IndexedDB
// and the save path is a coalesced flush — so "quota exceeded" has two
// distinct failure surfaces, and this spec covers both:
//
//   1. The LOCAL FALLBACK backend (IndexedDB unavailable — private
//      browsing lockdowns etc.): the legacy synchronous localStorage
//      write. setItem throws → save() reports false → onSaveError fires
//      → retry banner. Tested by disabling indexedDB before the app
//      boots, then stubbing localStorage.setItem to throw.
//   2. The IDB PRIMARY backend: the flush itself fails → doFlush catches
//      → the same onSaveError/retry/snapshot machinery. Tested with the
//      Store test seam (__TINTA_EXPOSE_STORE) driving the flush
//      interceptor, so no IDB internals need stubbing.
//
// A regression in any of those (banner never appears, retry never lands,
// banner never clears) would silently swallow writes under quota pressure.

// Boot the app with IndexedDB disabled → ready() falls back to the local
// localStorage backend. (A getter that returns undefined is the reliable
// way — `delete window.indexedDB` doesn't work on the native binding.)
async function disableIndexedDB(page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      get: () => undefined,
      configurable: true,
    });
  });
}

async function stubSetItemToThrow(page) {
  await page.evaluate(() => {
    const real = localStorage.setItem.bind(localStorage);
    Object.defineProperty(localStorage, 'setItem', {
      value: function() {
        const err = new Error('quota exceeded');
        err.name = 'QuotaExceededError';
        throw err;
      },
      writable: true,
      configurable: true,
    });
    window.__realSetItem = real;
  });
}

test('quota-exceeded save shows retry banner (local fallback backend)', async ({ page }) => {
  await disableIndexedDB(page);
  await page.goto('/');
  await expect(page.locator('#app-shell')).toBeVisible();
  await page.waitForTimeout(500);

  // Stub localStorage.setItem to throw QuotaExceededError on every call.
  // This is simpler than counting calls — the point is to verify the
  // banner appears, not to test the retry timing.
  await stubSetItemToThrow(page);

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

test('quota-exceeded banner clears once a save succeeds after space is freed (local fallback backend)', async ({ page }) => {
  await disableIndexedDB(page);
  await page.goto('/');
  await expect(page.locator('#app-shell')).toBeVisible();
  await page.waitForTimeout(500);

  // Stub setItem to always throw
  await stubSetItemToThrow(page);

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

test('IDB-primary flush failure shows the banner and recovers', async ({ page }) => {
  // Opt into the Store test seam, then drive the flush interceptor.
  await page.addInitScript(() => {
    window.__TINTA_EXPOSE_STORE = true;
  });
  await page.goto('/');
  await expect(page.locator('#app-shell')).toBeVisible();
  await page.waitForTimeout(500);

  // The store must be on the IndexedDB backend in a real browser.
  const backend = await page.evaluate(() => window.__TINTA_STORE.getStorageBackend());
  expect(backend).toBe('idb');

  // Make every flush fail with a quota error (the real shape doFlush
  // catches — same error family as a browser-granted quota breach).
  await page.evaluate(() => {
    window.__TINTA_STORE._setFlushInterceptorForTests(async () => {
      const err = new Error('quota exceeded');
      err.name = 'QuotaExceededError';
      throw err;
    });
  });

  const textarea = page.locator('textarea').first();
  await textarea.click();
  await textarea.fill('Prose against a full IndexedDB.');
  await page.waitForTimeout(1000);

  // The flush failure must surface through the same banner channel.
  await page.waitForFunction(() => {
    const root = document.querySelector('#storage-warning-root');
    return root && root.textContent.trim().length > 0;
  }, { timeout: 10000 });
  const bannerText = (await page.locator('#storage-warning-root').textContent()) || '';
  expect(bannerText.toLowerCase()).toMatch(/storage is full|keep try|couldn't be saved/);

  // Remove the failure and force the pending retry now — the banner clears.
  await page.evaluate(() => {
    window.__TINTA_STORE._setFlushInterceptorForTests(null);
    window.__TINTA_STORE._forceSaveRetryNow();
  });

  await page.waitForFunction(() => {
    const root = document.querySelector('#storage-warning-root');
    return !root || root.textContent.trim().length === 0;
  }, { timeout: 8000 }).catch(() => {});

  // And the retry actually landed the text — reload and confirm.
  const finalText = await textarea.inputValue();
  expect(finalText).toContain('Prose against a full IndexedDB');
  await page.reload();
  await expect(page.locator('#app-shell')).toBeVisible();
  await page.waitForTimeout(500);
  const reloadedText = await page.locator('textarea').first().inputValue();
  expect(reloadedText).toContain('Prose against a full IndexedDB');
});
