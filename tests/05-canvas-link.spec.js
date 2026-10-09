import { test, expect } from '@playwright/test';

// Bug repro: canvas linking sometimes doesn't show until refresh.
// Flow: create 2 entities → switch to Canvas → click Link → click A → click B → fill label → confirm → edge should appear immediately.

test('canvas link between two entities appears immediately after the prompt confirms', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-shell')).toBeVisible();
  await page.waitForTimeout(500);

  // Default nav style is "compact" — click the WORLD group toggle to open its flyout
  await page.locator('.nav-group-toggle[data-group="world"]').click();
  await page.waitForTimeout(200);

  // Click the "Notes" item in the flyout
  await page.locator('.nav-flyout-item[data-view="notes"]').click();
  await page.waitForTimeout(300);

  // Notes view: type a name in the input, then click "+ Add"
  await page.locator('#new-entity-name').fill('Alice');
  await page.locator('#new-entity-btn').click();
  await page.waitForTimeout(200);

  // Create a second entity
  await page.locator('#new-entity-name').fill('Bob');
  await page.locator('#new-entity-btn').click();
  await page.waitForTimeout(200);

  // Switch to Canvas view (re-open WORLD flyout)
  await page.locator('.nav-group-toggle[data-group="world"]').click();
  await page.waitForTimeout(200);
  await page.locator('.nav-flyout-item[data-view="canvas"]').click();
  await page.waitForTimeout(300);

  // Click "+ Link" button
  await page.getByRole('button', { name: '+ Link' }).click();
  await page.waitForTimeout(100);

  // Click the first node (Alice)
  await page.locator('g.canvas-node').filter({ hasText: 'Alice' }).click();
  await page.waitForTimeout(100);

  // Click the second node (Bob)
  await page.locator('g.canvas-node').filter({ hasText: 'Bob' }).click();

  // Fill the relationship label prompt
  await expect(page.locator('#confirm-input')).toBeVisible();
  await page.locator('#confirm-input').fill('mentor of');
  await page.locator('#confirm-ok-btn').click();

  // Wait a tick for the async handler to resolve + render
  await page.waitForTimeout(300);

  // The edge should now be visible — count paths with class canvas-edge
  const edgeCount = await page.locator('path.canvas-edge').count();
  expect(edgeCount).toBeGreaterThanOrEqual(1);
});
