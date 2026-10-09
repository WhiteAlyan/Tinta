import { test, expect } from '@playwright/test';

// Bug regression guard for #1 from the audit: notesView.js / systemsView.js
// used to assign directly to imported `let` bindings (activeEntityId,
// activeSystemId), which throws TypeError at runtime. The trigger was
// switching projects while Notes (or Systems) was showing an entity from
// the previous project — the stale id survived into the new project's
// first render and the defensive "is this id still valid?" fallback fired
// the illegal assignment. This spec drives that exact flow end-to-end.

test('create entity in project A, switch to project B, come back to A — entity still selectable, no console errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto('/');
  await expect(page.locator('#app-shell')).toBeVisible();
  await page.waitForTimeout(500);

  // Project A is the default "My Novel" — create an entity in its Notes
  await page.locator('.nav-group-toggle[data-group="world"]').click();
  await page.waitForTimeout(150);
  await page.locator('.nav-flyout-item[data-view="notes"]').click();
  await page.waitForTimeout(300);
  await page.locator('#new-entity-name').fill('Alice');
  await page.locator('#new-entity-btn').click();
  await page.waitForTimeout(200);

  // Open the Library to create project B
  await page.locator('.sidebar .project-switcher-btn').click();
  await page.waitForTimeout(300);

  // Click "New novel" inside the library modal — creates "Untitled Novel" project
  await page.getByRole('button', { name: /New novel/i }).first().click();
  await page.waitForTimeout(300);

  // The library refreshes in place; click the new card to switch to it
  await page.locator('.library-card', { hasText: 'Untitled Novel' }).click();
  await page.waitForTimeout(300);

  // Verify project B ("Untitled Novel") is now active
  await expect(page.locator('#project-title')).toHaveValue('Untitled Novel');

  // Switch back to project A via the Library
  await page.locator('.sidebar .project-switcher-btn').click();
  await page.waitForTimeout(300);
  // Click the library card for "My Novel"
  await page.locator('.library-card', { hasText: 'My Novel' }).click();
  await page.waitForTimeout(300);

  // Verify we're back in Project A
  await expect(page.locator('#project-title')).toHaveValue('My Novel');

  // Navigate to Notes — Alice should still be there
  await page.locator('.nav-group-toggle[data-group="world"]').click();
  await page.waitForTimeout(150);
  await page.locator('.nav-flyout-item[data-view="notes"]').click();
  await page.waitForTimeout(300);

  // Alice should be in the entity list — no console errors should have fired
  await expect(page.locator('.notes-groups')).toContainText('Alice');

  // Most importantly: no console errors should have fired during the switch
  expect(errors).toEqual([]);
});

test('create entity in project A, switch to project B, Notes view in B should not show A\'s entity', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');
  await page.waitForTimeout(500);

  // Create Alice in Project A (default "My Novel")
  await page.locator('.nav-group-toggle[data-group="world"]').click();
  await page.waitForTimeout(150);
  await page.locator('.nav-flyout-item[data-view="notes"]').click();
  await page.waitForTimeout(300);
  await page.locator('#new-entity-name').fill('Alice');
  await page.locator('#new-entity-btn').click();
  await page.waitForTimeout(200);

  // Create Project B via Library
  await page.locator('.sidebar .project-switcher-btn').click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /New novel/i }).first().click();
  await page.waitForTimeout(300);
  // Click the new card to switch to it
  await page.locator('.library-card', { hasText: 'Untitled Novel' }).click();
  await page.waitForTimeout(300);

  // Project B is now active. Switch to Notes view — Alice should NOT be there
  await page.locator('.nav-group-toggle[data-group="world"]').click();
  await page.waitForTimeout(150);
  await page.locator('.nav-flyout-item[data-view="notes"]').click();
  await page.waitForTimeout(300);

  // Alice (from Project A) should not appear in Project B's Notes
  const alicePresent = await page.locator('.notes-groups').evaluate((el) => el.textContent.includes('Alice'));
  expect(alicePresent).toBe(false);

  // No console errors should have fired
  expect(errors).toEqual([]);
});
