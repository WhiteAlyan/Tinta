import { test, expect } from '@playwright/test';

// Canvas-direct entity management — the writer asked to be able to add and
// remove entities from the canvas itself, without leaving for Notes.
// v0.2.9 update: the ✕ button now HIDES from canvas (not deletes).
// Deletion only happens from Notes.

test('canvas "+ Entity" button creates a new entity that appears on the canvas', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(500);

  // Switch to Canvas (no entities exist yet — empty state should show)
  await page.locator('.nav-group-toggle[data-group="world"]').click();
  await page.waitForTimeout(150);
  await page.locator('.nav-flyout-item[data-view="canvas"]').click();
  await page.waitForTimeout(300);

  // The empty state should be visible (no entities yet)
  await expect(page.locator('.canvas-stage .empty-state')).toBeVisible();

  // Click "+ Entity" in the canvas toolbar
  await page.locator('#canvas-add-entity-btn').click();
  await expect(page.locator('#confirm-input')).toBeVisible();
  await page.locator('#confirm-input').fill('Mara');
  await page.locator('#confirm-ok-btn').click();
  await page.waitForTimeout(300);

  // The entity should now appear on the canvas as a node
  await expect(page.locator('g.canvas-node')).toHaveCount(1);
  await expect(page.locator('g.canvas-node').filter({ hasText: 'Mara' })).toBeVisible();
});

test('canvas "+ Entity" button with empty name is a no-op', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(500);

  // Switch to Canvas
  await page.locator('.nav-group-toggle[data-group="world"]').click();
  await page.waitForTimeout(150);
  await page.locator('.nav-flyout-item[data-view="canvas"]').click();
  await page.waitForTimeout(300);

  // Click "+ Entity", type nothing, cancel
  await page.locator('#canvas-add-entity-btn').click();
  await page.locator('#confirm-cancel-btn').click();
  await page.waitForTimeout(200);

  // Still in empty state — no entity was created
  await expect(page.locator('.canvas-stage .empty-state')).toBeVisible();
});

test('canvas node ✕ hides the entity from canvas (does NOT delete from Notes)', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(500);

  // Create an entity directly via Notes
  await page.locator('.nav-group-toggle[data-group="world"]').click();
  await page.waitForTimeout(150);
  await page.locator('.nav-flyout-item[data-view="notes"]').click();
  await page.waitForTimeout(300);
  await page.locator('#new-entity-name').fill('Alice');
  await page.locator('#new-entity-btn').click();
  await page.waitForTimeout(200);

  // Switch to Canvas
  await page.locator('.nav-group-toggle[data-group="world"]').click();
  await page.waitForTimeout(150);
  await page.locator('.nav-flyout-item[data-view="canvas"]').click();
  await page.waitForTimeout(300);

  // Alice's node should be visible
  const node = page.locator('g.canvas-node').filter({ hasText: 'Alice' });
  await expect(node).toBeVisible();

  // Force the delete button to be visible via CSS
  await page.evaluate(() => {
    const del = document.querySelector('.canvas-node-delete');
    if (del) { del.style.opacity = '1'; del.style.pointerEvents = 'auto'; }
  });

  // Click the ✕ button
  await node.locator('.canvas-node-delete').click({ force: true });

  // Confirm dialog should appear — now says "Hide from canvas?" not "Delete?"
  await expect(page.locator('.confirm-panel')).toBeVisible();
  const dialogText = await page.locator('.confirm-panel').textContent();
  expect(dialogText.toLowerCase()).toContain('hide from canvas');

  await page.locator('#confirm-ok-btn').click();
  await page.waitForTimeout(300);

  // Node should be gone from the canvas
  await expect(page.locator('g.canvas-node')).toHaveCount(0);

  // CRITICAL: The entity should still exist in Notes — the canvas ✕
  // only hides from this canvas view, it does NOT delete the entity.
  await page.locator('.nav-group-toggle[data-group="world"]').click();
  await page.waitForTimeout(150);
  await page.locator('.nav-flyout-item[data-view="notes"]').click();
  await page.waitForTimeout(300);
  const notesText = await page.locator('.notes-groups').textContent();
  expect(notesText).toContain('Alice');

  // The "Show all" button should appear on the canvas now
  await page.locator('.nav-group-toggle[data-group="world"]').click();
  await page.waitForTimeout(150);
  await page.locator('.nav-flyout-item[data-view="canvas"]').click();
  await page.waitForTimeout(300);
  const showAllBtn = page.locator('#canvas-show-all-btn');
  await expect(showAllBtn).toBeVisible();

  // Click "Show all" — Alice should reappear
  await showAllBtn.click();
  await page.waitForTimeout(300);
  await expect(page.locator('g.canvas-node').filter({ hasText: 'Alice' })).toBeVisible();
});
