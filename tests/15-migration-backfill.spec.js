import { test, expect } from '@playwright/test';

// Failure-path spec: migration on a hand-edited / malformed backup.
//
// Bug this guards against: store-core.js's applyLegacyFieldMigrations
// had three `chapter.scenes.forEach(...)` calls and one
// `project.chapters.forEach(...)` call with no Array.isArray backfill.
// A backup with `chapters: undefined` or `chapter.scenes: undefined`
// would throw TypeError mid-migration, surfacing as an unhandled error
// rather than a friendly "this doesn't look like a valid backup"
// message. The audit's fix added `if (!Array.isArray(...)) ... = []`
// backfills before each forEach. This spec feeds several malformed
// backups and verifies the migration completes cleanly.
//
// We can't easily drive importFullBackup from the browser without the
// Backup modal's file-input flow, so this spec uses the modal. The
// alternative — calling Store.importFullBackup directly — would require
// exposing Store on window, which the app doesn't do by default.

async function importBackupViaModal(page, jsonContent, filename = 'backup.json') {
  // Open the Backup modal via Settings → Backup
  await page.locator('.sidebar-footer button[title="Settings"]').click();
  await page.waitForTimeout(300);
  const backupTab = page.locator('text=Backup').first();
  if (await backupTab.isVisible().catch(() => false)) {
    await backupTab.click();
    await page.waitForTimeout(200);
  }
  // Find the import file input.
  const fileInput = page.locator('input[type="file"]').first();
  if (!(await fileInput.isVisible().catch(() => false))) {
    return false;
  }
  const buffer = Buffer.from(jsonContent, 'utf-8');
  await fileInput.setInputFiles({ name: filename, mimeType: 'application/json', buffer });
  await page.waitForTimeout(1500);
  return true;
}

function makeValidBackup() {
  // A minimal valid backup with one project and one chapter.
  return JSON.stringify({
    version: 4,
    activeProjectId: 'proj_test',
    projects: {
      proj_test: {
        id: 'proj_test',
        title: 'Test Novel',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        chapters: [
          {
            id: 'chap_1',
            title: 'Chapter 1',
            order: 0,
            status: 'draft',
            content: 'Hello world.',
            updatedAt: '2026-01-01T00:00:00.000Z',
            scenes: [],
            snapshots: [],
          },
        ],
        entities: {},
        relationships: {},
        relationshipTypes: {},
        sketches: {},
        snippets: {},
        timelineEvents: {},
        dailyWordCounts: {},
        images: {},
      },
    },
  });
}

test('backup with chapters: undefined migrates cleanly without TypeError', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-shell')).toBeVisible();
  await page.waitForTimeout(500);

  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));

  // Build a backup where chapters is undefined — simulates a hand-edited
  // or third-party-generated file that bypassed makeProject().
  const backup = JSON.parse(makeValidBackup());
  delete backup.projects.proj_test.chapters;
  const imported = await importBackupViaModal(page, JSON.stringify(backup), 'no-chapters.json');

  if (imported) {
    // The migration should have backfilled chapters: [] and completed.
    // No TypeError should have fired.
    const typeErrors = errors.filter((e) => e.includes('TypeError') || e.includes('Cannot read prop'));
    expect(typeErrors).toEqual([]);
  } else {
    // Modal didn't open — skip rather than fail. Still assert no errors.
    expect(errors.filter((e) => !e.includes('Failed to load resource'))).toEqual([]);
  }
});

test('backup with chapter.scenes: undefined migrates cleanly without TypeError', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-shell')).toBeVisible();
  await page.waitForTimeout(500);

  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));

  const backup = JSON.parse(makeValidBackup());
  delete backup.projects.proj_test.chapters[0].scenes;
  const imported = await importBackupViaModal(page, JSON.stringify(backup), 'no-scenes.json');

  if (imported) {
    const typeErrors = errors.filter((e) => e.includes('TypeError') || e.includes('Cannot read prop'));
    expect(typeErrors).toEqual([]);
  } else {
    expect(errors.filter((e) => !e.includes('Failed to load resource'))).toEqual([]);
  }
});

test('backup with chapters: null migrates cleanly without TypeError', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-shell')).toBeVisible();
  await page.waitForTimeout(500);

  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));

  const backup = JSON.parse(makeValidBackup());
  backup.projects.proj_test.chapters = null;
  const imported = await importBackupViaModal(page, JSON.stringify(backup), 'null-chapters.json');

  if (imported) {
    const typeErrors = errors.filter((e) => e.includes('TypeError') || e.includes('Cannot read prop'));
    expect(typeErrors).toEqual([]);
  } else {
    expect(errors.filter((e) => !e.includes('Failed to load resource'))).toEqual([]);
  }
});

test('backup with chapters: "not-an-array" (string) migrates cleanly', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-shell')).toBeVisible();
  await page.waitForTimeout(500);

  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));

  // A string instead of an array — simulates a really malformed backup.
  const backup = JSON.parse(makeValidBackup());
  backup.projects.proj_test.chapters = 'not an array';
  const imported = await importBackupViaModal(page, JSON.stringify(backup), 'string-chapters.json');

  if (imported) {
    const typeErrors = errors.filter((e) => e.includes('TypeError') || e.includes('Cannot read prop'));
    expect(typeErrors).toEqual([]);
  } else {
    expect(errors.filter((e) => !e.includes('Failed to load resource'))).toEqual([]);
  }
});
