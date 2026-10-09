// Historical context: see docs/CODEBASE_NOTES.md#jsnav-js-1-41

import { html, toBridge } from './dom-utils.js';

// Historical context: see docs/CODEBASE_NOTES.md#jsnav-js-45-56
export function effectiveNavStyle(userStyle, fitsGrouped) {
  if (userStyle === 'compact') return 'compact';
  return fitsGrouped ? 'grouped' : 'compact';
}

export const NAV_GROUPS = [
  { key: 'write', label: 'Write', views: [{ id: 'write', label: 'Write' }, { id: 'book', label: 'Book' }] },
  { key: 'plan', label: 'Plan', views: [{ id: 'corkboard', label: 'Corkboard' }, { id: 'outline', label: 'Outline' }, { id: 'timeline', label: 'Timeline' }, { id: 'questions', label: 'Questions' }] },
  { key: 'world', label: 'World', views: [{ id: 'notes', label: 'Notes' }, { id: 'canvas', label: 'Canvas' }, { id: 'map', label: 'Map' }, { id: 'sketch', label: 'Sketch' }, { id: 'references', label: 'References' }, { id: 'systems', label: 'Systems' }] },
// Historical context: see docs/CODEBASE_NOTES.md#jsnav-js-66-73
  { key: 'tools', label: 'Tools', views: [{ id: 'resume', label: 'Resume' }, { id: 'search', label: 'Search' }, { id: 'stats', label: 'Stats' }, { id: 'health', label: 'Health' }, { id: 'checklist', label: 'Checklist' }, { id: 'annotations', label: 'Annotations' }, { id: 'snippets', label: 'Snippets' }, { id: 'decisions', label: 'Decisions' }] },
];

// ── workspace density ──────────────────────────────────────────────────
//
// Density was stored and offered in Settings but never consulted here, so
// choosing "Simple" changed nothing: NAV_GROUPS was painted verbatim
// regardless. The nav is now derived from density instead of hard-coded.
//
// SIMPLE_HIDDEN_VIEWS is not invented — it is exactly the list the
// Settings copy has always promised ("Simple hides advanced views (Canvas,
// Systems, References, Timeline, Sketches, Stats, Health, Checklist,
// Decisions)"). Keeping the two in step matters: the copy is the contract
// the writer read before choosing.
export const SIMPLE_HIDDEN_VIEWS = [
  'canvas', 'systems', 'references', 'timeline', 'sketch',
  'stats', 'health', 'checklist', 'decisions',
];

// Honest note on 'maximum': the Settings copy used to promise it "adds
// dev/test surfaces". There are none — every view in app.js's render
// dispatch already appears in NAV_GROUPS above, so there is nothing extra
// for maximum to reveal. Rather than invent a fake surface or leave the
// promise dangling, maximum currently resolves to the same full set as
// normal and the Settings copy says so. When a genuine diagnostic surface
// exists, it gets added here and the copy changes with it.
export function getVisibleNavGroups(density = 'normal') {
  if (density !== 'simple') return NAV_GROUPS;
  return NAV_GROUPS
    .map((group) => ({ ...group, views: group.views.filter((v) => !SIMPLE_HIDDEN_VIEWS.includes(v.id)) }))
    .filter((group) => group.views.length > 0); // a group button that opens nothing is worse than no button
}

// Whether a view is reachable at a given density. app.js uses this to
// redirect out of a view that just became hidden — switching Normal →
// Simple while sitting in Canvas would otherwise strand the writer on a
// panel with no tab to return to.
export function isViewVisibleAtDensity(viewId, density = 'normal') {
  return getVisibleNavGroups(density).some((group) => group.views.some((v) => v.id === viewId));
}

// Where to send someone whose current view just disappeared. Write is the
// one view that is always present at every density.
export const DENSITY_FALLBACK_VIEW = 'write';

// Historical context: see docs/CODEBASE_NOTES.md#jsnav-js-77-86
export function attachNavTabs(container, { getActiveView, getNavStyle, getDensity, onSelectView }) {
  let openGroup = null; // compact mode only — which group's flyout is open

  // Density is read per-paint rather than captured once, so a change in
  // Settings takes effect on the next render without re-attaching.
  function groups() {
    return getVisibleNavGroups(getDensity ? getDensity() : 'normal');
  }

  function paintGrouped(activeView) {
    container.innerHTML = toBridge(html`${groups().map((group) => html`
        <div class="nav-group">
          <span class="nav-group-label">${group.label}</span>
          ${group.views.map((v) => html`<button class="view-tab${v.id === activeView ? ' active' : ''}" type="button" data-view="${v.id}">${v.label}</button>`)}
        </div>
      `)}`);
  }

  function paintCompact(activeView) {
    container.innerHTML = toBridge(html`${groups().map((group) => {
      const isActiveGroup = group.views.some((v) => v.id === activeView);
      const isOpen = openGroup === group.key;
      return html`
        <div class="nav-group nav-group-compact${isActiveGroup ? ' active-group' : ''}">
          <button class="nav-group-toggle${isOpen ? ' open' : ''}" type="button" data-group="${group.key}" aria-haspopup="true" aria-expanded="${isOpen ? 'true' : 'false'}">${group.label.toUpperCase()}<span class="nav-group-caret">▾</span></button>
          <div class="nav-flyout${isOpen ? '' : ' hidden'}" role="menu">
            ${group.views.map((v) => html`<button class="nav-flyout-item${v.id === activeView ? ' active' : ''}" type="button" data-view="${v.id}" role="menuitem">${v.label}</button>`)}
          </div>
        </div>
      `;
    })}`);
  }

// Historical context: see docs/CODEBASE_NOTES.md#jsnav-js-114-123
  function groupedOverflows() {
    const bar = container.closest('.view-tabs');
    if (!bar) return false;
    const barRect = bar.getBoundingClientRect();
    if (barRect.width === 0) return false;
    const groups = container.querySelectorAll('.nav-group');
    if (!groups.length) return false;
    const rowHeight = groups[0].getBoundingClientRect().height;
    if (rowHeight > 0) {
      const rows = Math.round(container.getBoundingClientRect().height / rowHeight);
      if (rows > 2) return true;
    }
    const lastGroupRect = groups[groups.length - 1].getBoundingClientRect();
    if (lastGroupRect.right > barRect.right + 1) return true;
    return false;
  }

// Historical context: see docs/CODEBASE_NOTES.md#jsnav-js-141-144
  let lastPaintedStyle = null;

  function render() {
    const activeView = getActiveView();
    const userStyle = getNavStyle();
    let style;
    if (userStyle === 'compact') {
      style = 'compact';
    } else {
      paintGrouped(activeView);
      style = effectiveNavStyle(userStyle, !groupedOverflows());
    }
    lastPaintedStyle = style;
    if (style === 'compact') paintCompact(activeView);
  }

// Historical context: see docs/CODEBASE_NOTES.md#jsnav-js-161-167
  // P2-12 fix — the original anonymous resize handler is now declared
  // as a named `resizeHandler` further down so destroy() can remove it.
  // `resizeTimer` stays here so both the handler and destroy() can see it.
  let resizeTimer = null;

  function closeFlyout() {
    if (!openGroup) return;
    openGroup = null;
    render();
  }

  function focusFlyoutItem(index) {
    const items = container.querySelectorAll('.nav-flyout:not(.hidden) .nav-flyout-item');
    if (!items.length) return;
    const clamped = ((index % items.length) + items.length) % items.length;
    items[clamped].focus();
  }

  container.addEventListener('click', (e) => {
    const groupToggle = e.target.closest('[data-group]');
    if (groupToggle) {
      openGroup = openGroup === groupToggle.dataset.group ? null : groupToggle.dataset.group;
      render();
      if (openGroup) focusFlyoutItem(0);
      return;
    }
    const tab = e.target.closest('[data-view]');
    if (tab) {
      openGroup = null;
      onSelectView(tab.dataset.view);
    }
  });

  // Arrow-key navigation inside an open flyout — Enter/Space already work
  // for free (native <button> behavior), this only needs to handle moving
  // focus between items.
  container.addEventListener('keydown', (e) => {
    if (!openGroup) return;
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...container.querySelectorAll('.nav-flyout:not(.hidden) .nav-flyout-item')];
    const currentIndex = items.indexOf(document.activeElement);
    e.preventDefault();
    focusFlyoutItem(currentIndex + (e.key === 'ArrowDown' ? 1 : -1));
  });

  // Compact style only — clicking anywhere outside an open flyout closes
  // it, same outside-click pattern the write-toolbar popovers use.
  let outsideClickHandler = (e) => {
    if (openGroup && !e.target.closest('.nav-group-compact')) closeFlyout();
  };
  document.addEventListener('click', outsideClickHandler);

  // P2-12 fix — name the resize handler so destroy() can remove it.
  // The original anonymous handlers were safe today (attachNavTabs is
  // called exactly once in app.js init() and nav lives for app
  // lifetime), but the lack of teardown was an undocumented invariant.
  // If a test or future feature ever calls attachNavTabs twice, the
  // resize handler would double-fire (debounced, harmless) and the
  // outside-click would call closeFlyout twice (idempotent, harmless)
  // — but the lack of cleanup was a smell. destroy() is now exposed
  // even if production code never calls it, so the contract is honest.
  let resizeHandler = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 150);
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', resizeHandler);
  }

  function destroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', resizeHandler);
    }
    document.removeEventListener('click', outsideClickHandler);
  }

  return {
    render,
    closeFlyout,
    isFlyoutOpen: () => openGroup !== null,
    paintedStyle: () => lastPaintedStyle,
    destroy,
  };
}
