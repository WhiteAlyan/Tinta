// Smoke flow 2 of 3 — writing actually persists through a real reload.
//
// Every store.js smoke test proves localStorage read/write works under a
// Node shim; none of them prove the real browser flow: type in the
// textarea → app.js's input handler calls Store.updateChapterContent →
// autosave debounce fires → a real page reload re-reads real
// localStorage → the same text is there. That chain has several places a
// wiring mistake could break it silently (a missing/misfired 'input'
// listener, a debounce that never actually fires, load() not being the
// thing index.html's boot path calls) that no Node-level test can see.
import { test, expect } from '@playwright/test';

test('typed content survives a real reload', async ({ page }) => {
  await page.goto('/');

  await page.click('#new-chapter-btn');
  await expect(page.locator('.sb-chapter')).toHaveCount(2);

  const editor = page.locator('#chapter-editor');
  await expect(editor).toBeVisible();
  const testLine = `Playwright smoke test line ${Date.now()}`;
  await editor.fill(testLine);

  // autosaveDelayMs defaults to 600ms (see store.js's migrate() backfill) —
  // give it real margin rather than racing the debounce.
  await page.waitForTimeout(1500);

  await page.reload();

  // Same chapter should still be selected (activeChapterId persists on
  // the db, not just in memory) and its content should still be there —
  // this is the actual round trip through real localStorage, not a mock.
  await expect(page.locator('#chapter-editor')).toHaveValue(testLine);
});

test('word count updates live as you type, not just on save', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#chapter-editor');
  await editor.fill('one two three four five');
  await expect(page.locator('#word-count')).toContainText('5 words');
});
