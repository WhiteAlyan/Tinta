// CR-44 accessibility spec — the browser-level half of the a11y pass.
//
// The Node smoketest (js/a11y.smoketest.mjs) pins the static contract
// (markup attributes, contrast math, icon-name gate). What it CANNOT
// verify is real focus behavior in a real browser: that Tab actually
// cycles inside a modal, that focus actually LANDS back on the opener
// after close, that the live region actually receives the announced
// text, that a keyboard writer can actually drive the sidebar. These
// specs cover exactly that — the WAI-ARIA dialog pattern as the app
// really delivers it, not as the template strings claim it.
import { test, expect } from '@playwright/test';

async function gotoApp(page) {
  await page.goto('/');
  await page.waitForTimeout(500); // boot: Store.ready() + first render
}

test('blocking modal: focus moves in, Tab cycles inside, close restores the opener', async ({ page }) => {
  await gotoApp(page);

  // The panel is a labelled dialog now.
  await page.locator('#settings-btn').click();
  const panel = page.locator('#modal-root .modal-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('role', 'dialog');
  await expect(panel).toHaveAttribute('aria-modal', 'true');
  await expect(panel).toHaveAttribute('aria-labelledby', 'modal-title');

  // CR-13 — focus entered the dialog (the panel itself, APG pattern).
  const focusInPanel = await page.evaluate(() => {
    const p = document.querySelector('#modal-root .modal-panel');
    return p.contains(document.activeElement);
  });
  expect(focusInPanel, 'focus should be inside the modal panel right after open').toBe(true);

  // Tab cycles INSIDE: from the last focusable control it wraps to the
  // first — it must not escape to the page behind the backdrop.
  await page.evaluate(() => {
    const p = document.querySelector('#modal-root .modal-panel');
    const focusables = [...p.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((el) => el.getClientRects().length > 0);
    if (!focusables.length) throw new Error('no focusables inside modal panel');
    focusables[focusables.length - 1].focus();
    focusables[0].dataset.a11yProbe = 'first';
  });
  await page.keyboard.press('Tab');
  const landedOnFirst = await page.evaluate(() =>
    document.activeElement?.dataset?.a11yProbe === 'first'
  );
  expect(landedOnFirst, 'forward Tab from the last control wraps to the first (trap holds)').toBe(true);

  // Close restores focus to the opener.
  await page.keyboard.press('Escape');
  await expect(panel).not.toBeVisible();
  await expect(page.locator('#settings-btn')).toBeFocused();
});

test('confirm dialog: alertdialog semantics, Tab stays inside, Escape restores opener', async ({ page }) => {
  await gotoApp(page);

  // The sidebar's per-chapter ✕ opens a confirmDialog — the stacked-
  // dialog path (capture-phase trap + its own focus restore).
  const delBtn = page.locator('.sb-chapter-delete').first();
  await delBtn.click();
  const dialog = page.locator('#confirm-root .confirm-panel');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('role', 'alertdialog');
  await expect(dialog).toHaveAttribute('aria-modal', 'true');

  // Focus starts on a dialog button (the confirm, non-danger variant).
  const focusInside = await page.evaluate(() =>
    document.querySelector('#confirm-root .confirm-panel').contains(document.activeElement)
  );
  expect(focusInside).toBe(true);

  // Tab wraps inside the two-button dialog rather than escaping it.
  await page.locator('#confirm-ok-btn').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#confirm-cancel-btn')).toBeFocused();

  // Escape cancels and hands focus back to the ✕ that opened it.
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(delBtn).toBeFocused();
});

test('nav + sidebar carry aria-current; a view switch is announced on the live region', async ({ page }) => {
  await gotoApp(page);

  // Active chapter row announces itself (aria-current="true" on the
  // keyboard-reachable row button).
  const row = page.locator('.sb-chapter-row').first();
  await expect(row).toHaveAttribute('aria-current', 'true');
  await expect(row).toHaveAttribute('role', 'button');
  await expect(row).toHaveAttribute('tabindex', '0');

  // Nav tab announces the current page. The viewport runs the compact
  // nav (grouped overflow), so the tab lives inside its group's flyout —
  // open the group first, same convention as the navigation sweep spec.
  await page.locator('.nav-group-toggle[data-group="write"]').click();
  const bookTab = page.locator('[data-view="book"]').first();
  await expect(bookTab).toBeVisible();
  await bookTab.click();
  await expect(bookTab).toHaveAttribute('aria-current', 'page');
  // The previous tab released it.
  await expect(page.locator('[data-view="write"]').first()).not.toHaveAttribute('aria-current');

  // CR-44 — the live region received the announcement (async settle).
  await expect.poll(() => page.evaluate(() => document.getElementById('a11y-live')?.textContent || ''), {
    timeout: 2000,
  }).toBe('Book view');
});

test('chapter rows are keyboard-operable (Enter opens the chapter in Write view)', async ({ page }) => {
  await gotoApp(page);

  // Start somewhere else, then drive the row like a keyboard writer:
  // focus the row (tabindex=0 + role=button), press Enter, and the app
  // should land in Write on that chapter. (Compact nav: open the group
  // before its flyout item is clickable.)
  await page.locator('.nav-group-toggle[data-group="tools"]').click();
  await page.locator('[data-view="stats"]').first().click();
  await page.waitForTimeout(200);

  const row = page.locator('.sb-chapter-row').first();
  await row.focus();
  await page.keyboard.press('Enter');

  await expect(page.locator('.view-panel[data-view="write"]')).toHaveClass(/active/);
  // Space activates too (button contract).
  await page.locator('.nav-group-toggle[data-group="tools"]').click();
  await page.locator('[data-view="stats"]').first().click();
  await row.focus();
  await page.keyboard.press(' ');
  await expect(page.locator('.view-panel[data-view="write"]')).toHaveClass(/active/);
});

test('entity drawer: labelled non-modal dialog, focus moves in, Escape closes', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(`[${msg.text()}]`); });
  page.on('pageerror', (err) => consoleErrors.push(`[pageerror] ${err.message}`));

  await gotoApp(page);

  // Create an entity through the Notes UI, then reach its drawer through
  // Search's entity result row (a real user path into openEntityDrawer).
  await page.locator('.nav-group-toggle[data-group="world"]').click();
  await page.locator('.nav-flyout-item[data-view="notes"]').click();
  await page.waitForTimeout(300);
  await page.locator('#new-entity-name').fill('Mara');
  await page.locator('#new-entity-btn').click();
  await page.waitForTimeout(300);

  // The Search view needs the entity in the project — search by name.
  await page.locator('.nav-group-toggle[data-group="tools"]').click();
  await page.locator('.nav-flyout-item[data-view="search"]').click();
  await page.waitForTimeout(300);
  await page.locator('#search-query').fill('Mara');
  await page.waitForTimeout(600); // debounce + worker round-trip

  const entityRow = page.locator('[data-jump-entity]').first();
  await expect(entityRow).toBeVisible();
  await entityRow.click();

  // Non-modal dialog semantics: role=dialog, labelled, and NO aria-modal
  // (the drawer deliberately doesn't block the manuscript behind it).
  const drawerPanel = page.locator('#drawer-root .drawer-panel');
  await expect(drawerPanel).toBeVisible();
  await expect(drawerPanel).toHaveAttribute('role', 'dialog');
  await expect(drawerPanel).not.toHaveAttribute('aria-modal');
  const label = await drawerPanel.getAttribute('aria-label');
  expect(label, 'drawer should be labelled from its .drawer-title').toBeTruthy();
  expect(label).toContain('Mara');

  // Focus moved into the drawer on open.
  const focusInside = await page.evaluate(() =>
    document.querySelector('#drawer-root .drawer-panel').contains(document.activeElement)
  );
  expect(focusInside, 'focus should be inside the drawer right after open').toBe(true);

  // Escape closes it (via the global overlay shortcut) with no errors.
  await page.keyboard.press('Escape');
  await expect(drawerPanel).not.toBeVisible();
  expect(consoleErrors, `console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
});

test('icon-only shell buttons are reachable by accessible name', async ({ page }) => {
  await gotoApp(page);

  // The ⌘K button's visible text is a glyph — its name comes from
  // aria-label, and getByRole must find it.
  const paletteBtn = page.getByRole('button', { name: /Quick switcher/ });
  await expect(paletteBtn).toBeVisible();

  // The palette itself: combobox semantics on a real modal. (It has no
  // header by design, so no Close button — the named-Close assertion
  // runs on the Settings modal below.)
  await paletteBtn.click();
  const combo = page.locator('#palette-query');
  await expect(combo).toBeVisible();
  await expect(combo).toHaveAttribute('role', 'combobox');
  await expect(combo).toHaveAttribute('aria-controls', 'palette-results');
  const listbox = page.locator('#palette-results');
  await expect(listbox).toHaveAttribute('role', 'listbox');
  const option = page.locator('#palette-results [role="option"]').first();
  await expect(option).toBeVisible();
  await expect(option).toHaveAttribute('aria-selected', 'true');
  await expect(combo).toHaveAttribute('aria-activedescendant', await option.getAttribute('id'));
  await page.keyboard.press('Escape');

  // A headed modal's ✕ is named too ("Close"), and clicking it works —
  // the accessible-name path drives the real dismiss.
  await page.locator('#settings-btn').click();
  await expect(page.locator('#modal-root .modal-panel')).toBeVisible();
  const closeBtn = page.getByRole('button', { name: 'Close' });
  await expect(closeBtn).toBeVisible();
  await closeBtn.click();
  await expect(page.locator('#modal-root .modal-panel')).not.toBeVisible();
});
