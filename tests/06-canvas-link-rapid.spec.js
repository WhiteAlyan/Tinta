import { test, expect } from '@playwright/test';

// Bug repro for "sometimes relationships don't show until refresh" — test
// the rapid-linking flow: enter link mode, click A, IMMEDIATELY click B
// (without waiting for the SVG re-render between A and B to fully settle),
// confirm the prompt, edge should still appear.

test('canvas link works when clicking two nodes rapidly', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-shell')).toBeVisible();
  await page.waitForTimeout(500);

  // Create two entities in Notes
  await page.locator('.nav-group-toggle[data-group="world"]').click();
  await page.waitForTimeout(150);
  await page.locator('.nav-flyout-item[data-view="notes"]').click();
  await page.waitForTimeout(300);

  await page.locator('#new-entity-name').fill('Alice');
  await page.locator('#new-entity-btn').click();
  await page.waitForTimeout(150);
  await page.locator('#new-entity-name').fill('Bob');
  await page.locator('#new-entity-btn').click();
  await page.waitForTimeout(200);

  // Switch to Canvas
  await page.locator('.nav-group-toggle[data-group="world"]').click();
  await page.waitForTimeout(150);
  await page.locator('.nav-flyout-item[data-view="canvas"]').click();
  await page.waitForTimeout(300);

  // Click "+ Link"
  await page.getByRole('button', { name: '+ Link' }).click();
  await page.waitForTimeout(80);

  // Click Alice, then immediately click Bob — don't wait for the
  // SVG re-render between the two clicks to settle.
  await page.locator('g.canvas-node').filter({ hasText: 'Alice' }).click();
  await page.waitForTimeout(30); // very short wait — simulates rapid clicking
  await page.locator('g.canvas-node').filter({ hasText: 'Bob' }).click();

  // Confirm the relationship label prompt
  await expect(page.locator('#confirm-input')).toBeVisible();
  await page.locator('#confirm-input').fill('mentor of');
  await page.locator('#confirm-ok-btn').click();
  await page.waitForTimeout(400);

  const edgeCount = await page.locator('path.canvas-edge').count();
  expect(edgeCount).toBeGreaterThanOrEqual(1);
});

// Repro for the third flow: link A → B, then link A → C without leaving link mode.
test('canvas link stays in link mode across multiple links', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-shell')).toBeVisible();
  await page.waitForTimeout(500);

  // Create three entities
  await page.locator('.nav-group-toggle[data-group="world"]').click();
  await page.waitForTimeout(150);
  await page.locator('.nav-flyout-item[data-view="notes"]').click();
  await page.waitForTimeout(300);

  for (const name of ['Alice', 'Bob', 'Carol']) {
    await page.locator('#new-entity-name').fill(name);
    await page.locator('#new-entity-btn').click();
    await page.waitForTimeout(150);
  }

  // Switch to Canvas
  await page.locator('.nav-group-toggle[data-group="world"]').click();
  await page.waitForTimeout(150);
  await page.locator('.nav-flyout-item[data-view="canvas"]').click();
  await page.waitForTimeout(300);

  // Click "+ Link"
  await page.getByRole('button', { name: '+ Link' }).click();
  await page.waitForTimeout(100);

  // Link Alice → Bob
  await page.locator('g.canvas-node').filter({ hasText: 'Alice' }).click();
  await page.waitForTimeout(100);
  await page.locator('g.canvas-node').filter({ hasText: 'Bob' }).click();
  await expect(page.locator('#confirm-input')).toBeVisible();
  await page.locator('#confirm-input').fill('friend of');
  await page.locator('#confirm-ok-btn').click();
  await page.waitForTimeout(400);

  // Link mode is still on — link Alice → Carol without re-clicking "+ Link"
  await page.locator('g.canvas-node').filter({ hasText: 'Alice' }).click();
  await page.waitForTimeout(100);
  await page.locator('g.canvas-node').filter({ hasText: 'Carol' }).click();
  await expect(page.locator('#confirm-input')).toBeVisible();
  await page.locator('#confirm-input').fill('mentor of');
  await page.locator('#confirm-ok-btn').click();
  await page.waitForTimeout(400);

  // Two edges should be visible
  const edgeCount = await page.locator('path.canvas-edge').count();
  expect(edgeCount).toBeGreaterThanOrEqual(2);
});
