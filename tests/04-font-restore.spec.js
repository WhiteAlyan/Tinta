// Smoke flow 4 — the custom font round-trip (font-restore patch).
//
// The js/*.smoketest.mjs layer pins the orchestration decisions of the
// backup font mirror under Node's degraded (no-IDB) blob store; this spec
// is the only place the byte-level half actually runs — real IndexedDB,
// real FontFace registration, real download/upload of the backup file.
// It pins the three things a user can actually feel:
//
//   1. Uploading a .ttf applies it immediately AND after a reload (the
//      FontFace re-registration boot path through initCustomFont).
//   2. A full backup carries the font bytes, and a restore into a
//      profile that has LOST the blob (here: the asset store deleted out
//      from under the metadata, the exact state a pre-font-pass backup
//      restore used to leave behind) brings the font back.
//   3. The self-heal: when metadata says a font is picked but the bytes
//      are gone, boot stands the picker down to Literata honestly and
//      Settings says the bytes are missing — instead of the old silent
//      "picker claims custom, page renders Literata" lie.
//
// The font used is DejaVuSans.ttf from the system fonts directory — any
// valid TTF works; nothing about it is special except that it's a real
// font file the browser can parse.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const FONT_PATH = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';

async function openSettings(page) {
  await page.locator('#settings-btn').click();
  await expect(page.locator('#settings-font-select')).toBeVisible();
}

test('custom font applies, survives reload, rides the backup, and restores', async ({ page }) => {
  test.setTimeout(60_000); // download + two reloads + an IDB delete; the default 30s has no headroom

  await page.goto('/');
  await expect(page.locator('.view-panel.active')).toBeVisible();

  // ── 1. Upload applies immediately ──────────────────────────────────
  await openSettings(page);
  await page.locator('#custom-font-input').setInputFiles(FONT_PATH);

  // The change handler re-opens Settings after the async pipeline
  // (register → putBlob → metadata → data-font), so the picker gains the
  // custom option and selects it in the same action.
  await expect(page.locator('#settings-font-select')).toHaveValue('custom', { timeout: 10_000 });
  await expect(page.locator('html')).toHaveAttribute('data-font', 'custom');

  // The editor actually renders in the uploaded font — the derived family
  // keeps the sanitized filename base ("DejaVuSans"), plus a random
  // suffix the assertion deliberately ignores.
  const family = await page.locator('.chapter-editor').evaluate((el) => getComputedStyle(el).fontFamily);
  expect(family).toContain('DejaVuSans');

  // ── 2. FontFace re-registration on reload ──────────────────────────
  // initCustomFont() is async (IndexedDB read + FontFace load) and boot
  // sets data-font="custom" from the store before the var lands — the CSS
  // fallback window the fonts.css comment documents. Wait for the editor
  // to actually render the uploaded family rather than reading at the
  // first opportunity.
  await page.reload();
  await expect(page.locator('.view-panel.active')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-font', 'custom');
  await page.waitForFunction(
    () => (document.querySelector('.chapter-editor') ? getComputedStyle(document.querySelector('.chapter-editor')).fontFamily.includes('DejaVuSans') : false),
    null,
    { timeout: 10_000 },
  );

  // ── 3. Full backup carries the font bytes ──────────────────────────
  await openSettings(page);
  await page.locator('#settings-backup-btn').click();
  await expect(page.locator('#backup-export-btn')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#backup-export-btn').click();
  const download = await downloadPromise;
  const backup = JSON.parse(readFileSync(await download.path(), 'utf-8'));
  expect(backup.db.customFont.fileName).toBe('DejaVuSans.ttf');
  expect(backup.customFont).toBeTruthy();
  expect(backup.customFont.base64.length).toBeGreaterThan(1000);
  const backupJson = JSON.stringify(backup);

  // ── 4. Lose the bytes behind the metadata (the old restore damage) ─
  await page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase('tinta-assets');
    req.onsuccess = req.onblocked = () => resolve();
    req.onerror = () => reject(req.error);
  }));
  await page.reload();
  await expect(page.locator('.view-panel.active')).toBeVisible();

  // Self-heal: picker stood down to Literata even though the metadata
  // (fileName label) survives; Settings says the bytes are missing.
  await expect(page.locator('html')).toHaveAttribute('data-font', 'literata');
  await openSettings(page);
  await expect(page.locator('#custom-font-missing-note')).toBeVisible();
  await expect(page.locator('#settings-font-select')).toHaveValue('literata');
  await expect(page.locator('#custom-font-pick-btn')).toContainText('Replace');

  // ── 5. Restore brings the font back ────────────────────────────────
  await page.locator('#settings-backup-btn').click();
  await page.locator('#backup-import-input').setInputFiles({
    name: 'font-backup.json', mimeType: 'application/json', buffer: Buffer.from(backupJson, 'utf-8'),
  });
  // Themed confirm (the hardening pass's confirmDialog) gates the restore.
  await page.locator('#confirm-ok-btn').click();
  await expect(page.locator('.storage-warning-banner')).toContainText('custom font', { timeout: 10_000 });
  await expect(page.locator('html')).toHaveAttribute('data-font', 'custom');
  const familyAfterRestore = await page.locator('.chapter-editor').evaluate((el) => getComputedStyle(el).fontFamily);
  expect(familyAfterRestore).toContain('DejaVuSans');

  // And it keeps surviving reloads from here on — the blob is back in
  // the asset store, not just re-registered for this one page load.
  await page.reload();
  await expect(page.locator('.view-panel.active')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-font', 'custom');
  await page.waitForFunction(
    () => (document.querySelector('.chapter-editor') ? getComputedStyle(document.querySelector('.chapter-editor')).fontFamily.includes('DejaVuSans') : false),
    null,
    { timeout: 10_000 },
  );
});
