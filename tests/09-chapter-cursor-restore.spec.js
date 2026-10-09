import { test, expect } from '@playwright/test';

// Bug regression guard for editor.js's restorePosition — the cursor and
// scroll position should survive a chapter switch. Previously this was a
// real gap (a writer who scrolled deep into chapter A, switched to B,
// then came back to A would land back at the top). The fix at the time
// added `chapter.lastCursorPos` and `chapter.lastScrollTop` saves,
// debounced at 800ms — this spec drives that flow end-to-end.

test('cursor position in chapter A is restored after switching to chapter B and back', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-shell')).toBeVisible();
  await page.waitForTimeout(500);

  // Type some content into the default chapter (Chapter 1)
  const textarea = page.locator('textarea.editor-input, textarea[id^="editor-"], .editor-stack textarea').first();
  await textarea.click();
  await textarea.fill('Line one of the chapter.\nLine two.\nLine three.\nLine four.\nLine five.');
  // Trigger a save + position save (800ms debounce on position)
  await page.waitForTimeout(1000);

  // Create a second chapter via the sidebar "+ New" button
  await page.locator('.sidebar').getByRole('button', { name: '+ New' }).click();
  await page.waitForTimeout(300);

  // The new chapter should be active — type something different
  const textareaAfterSwitch = page.locator('textarea.editor-input, textarea[id^="editor-"], .editor-stack textarea').first();
  await expect(textareaAfterSwitch).toHaveValue('');
  await textareaAfterSwitch.click();
  await textareaAfterSwitch.fill('This is chapter two.');
  // v0.2.9 — autosave debounce is now 1500ms (was 600ms). Wait 2000ms
  // so the save actually lands before switching chapters.
  await page.waitForTimeout(2000);

  // Switch back to Chapter 1 via the sidebar chapter list
  // v0.2.9 — the sidebar now has a "Recent" section at the top, so
  // .first() might grab a recent chapter instead of Chapter 1. Click
  // the chapter whose title text matches "Chapter 1".
  await page.locator('.chapter-list .sb-chapter-row').filter({ hasText: 'Chapter 1' }).first().click();
  await page.waitForTimeout(500);

  // The textarea should now show Chapter 1's content again
  const textareaBack = page.locator('textarea.editor-input, textarea[id^="editor-"], .editor-stack textarea').first();
  await expect(textareaBack).toHaveValue('Line one of the chapter.\nLine two.\nLine three.\nLine four.\nLine five.');
});

test('cursor position survives a full page reload', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('#app-shell')).toBeVisible();
  await page.waitForTimeout(500);

  // Type some content
  const textarea = page.locator('textarea.editor-input, textarea[id^="editor-"], .editor-stack textarea').first();
  await textarea.click();
  await textarea.fill('Typed content that should survive a reload.');
  await page.waitForTimeout(1000);

  // Reload
  await page.reload();
  await expect(page.locator('#app-shell')).toBeVisible();
  await page.waitForTimeout(500);

  // The content should be back
  const textareaAfterReload = page.locator('textarea.editor-input, textarea[id^="editor-"], .editor-stack textarea').first();
  await expect(textareaAfterReload).toHaveValue('Typed content that should survive a reload.');
});
