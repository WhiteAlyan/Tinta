// Historical context: see docs/CODEBASE_NOTES.md#jsapp-js-1-5
import * as AutoBackup from './autoBackup.js';
import * as Commands from './commands.js';
import * as Nav from './nav.js';
import * as Store from './store.js';
import * as Theme from './theme.js';
import { renderAnnotationsView } from './annotationsView.js';
import { renderBookView, revokeBookModeUrls } from './bookView.js';
import { cancelCanvasLinkMode, renderCanvasView } from './canvasView.js';
import { renderChecklistView } from './checklistView.js';
import { openCommandPalette } from './commandPalette.js';
import { activeView, navHandle, setActiveChapterId, setActiveEntityId, setActiveView, setNavHandle } from './context.js';
import { renderCorkboardView } from './corkboardView.js';
import { renderDecisionsView } from './decisionsView.js';
import { q } from './dom-utils.js';
import { closeDrawer } from './drawer.js';
import { getFocusLevel, setFocusLevel, updateFocusButtons } from './editor.js';
import { els } from './els.js';
import { renderHealthView } from './healthView.js';
import { openImageLibrary } from './imageLibrary.js';
import { openLibrary, registerLibraryCleanup } from './library.js';
import { renderMapView, revokeMapImageUrl } from './mapView.js';
import { closeModal } from './modal.js';
import { flushEntityFieldSave, renderNotesView } from './notesView.js';
import { openOrganizeModal } from './organizeModal.js';
import { renderOutlineView } from './outlineView.js';
import { revokeEntityPortraitUrls } from './portraits.js';
import { firstOpenChapterId } from './projectSwitch.js';
import { renderQuestionsView } from './questionsView.js';
import { renderReferencesView } from './referencesView.js';
import { setRenderer } from './renderBus.js';
import { renderResumeView } from './resumeView.js';
import { renderSearchView } from './searchView.js';
import { openSettingsModal } from './settingsModal.js';
import { renderSidebar } from './sidebar.js';
import { detachSketchDrawing, renderSketchView } from './sketchView.js';
import { renderSnippetsView } from './snippetsView.js';
import { openSprintModal } from './sprintPanel.js';
import { renderStatsView } from './statsView.js';
import { renderSystemsView } from './systemsView.js';
import { openTemplatePicker } from './templatePicker.js';
import { applyMotionSpeed } from './theme.js';
import { renderTimelineView } from './timelineView.js';
import { showStorageWarning, showToast } from './toast.js';
import { renderWriteView } from './writeView.js';
import { showWelcomeScreen } from './welcomeScreen.js';
import { openOnboarding } from './onboarding.js';
import * as RecoveryToast from './recoveryToast.js';

// Tinta — app wiring.
// Sidebar (chapter hierarchy + status dots) + three views: Write, Corkboard, Outline.

// Historical context: see docs/CODEBASE_NOTES.md#jsapp-js-54-104

// Historical context: see docs/CODEBASE_NOTES.md#jsapp-js-106-110


// Historical context: see docs/CODEBASE_NOTES.md#jsapp-js-113-145

// Historical context: see docs/CODEBASE_NOTES.md#jsapp-js-147-167

// Historical context: see docs/CODEBASE_NOTES.md#jsapp-js-169-172



// Historical context: see docs/CODEBASE_NOTES.md#jsapp-js-176-179

// Historical context: see docs/CODEBASE_NOTES.md#jsapp-js-181-184

function init() {
  Theme.initTheme();
  Theme.initBackground();
  Theme.initCustomFont();
  applyMotionSpeed(Store.getMotionSettings().speed);
  cacheEls();
  // 0.2.7 move-out — the Library close-cleanup (cover URL revoke, filter
  // reset, card-menu outside-click listener) moved to library.js's
  // registerLibraryCleanup(); same hook registry, same registration timing.
  registerLibraryCleanup();
  bindGlobalControls();

// Historical context: see docs/CODEBASE_NOTES.md#jsapp-js-198-204
  Store.onSaveSuccess(() => AutoBackup.scheduleAutoBackupTinta());

// Historical context: see docs/CODEBASE_NOTES.md#jsapp-js-207-217
  const markProjectOpenedOnLeave = () => Store.markProjectOpened();
  window.addEventListener('pagehide', markProjectOpenedOnLeave);
  window.addEventListener('beforeunload', markProjectOpenedOnLeave);
// Historical context: see docs/CODEBASE_NOTES.md#jsapp-js-221-225
  window.addEventListener('pagehide', flushEntityFieldSave);
  window.addEventListener('beforeunload', flushEntityFieldSave);

// Historical context: see docs/CODEBASE_NOTES.md#jsapp-js-229-232
  setNavHandle(Nav.attachNavTabs(els.navTabsGroups, {
    getActiveView: () => activeView,
    getNavStyle: () => Store.getNavStyle(),
    getDensity: () => Store.getWorkspaceDensity(),
    onSelectView: (viewId) => {
      setActiveView(viewId);
      render();
    },
  }));

// Historical context: see docs/CODEBASE_NOTES.md#jsapp-js-242-250
  Commands.attachGlobalShortcuts({
    openCommandPalette,
    performUndo,
    performRedo,
    closeModal,
    closeDrawer,
    closeNavFlyout: () => navHandle.closeFlyout(),
    getFocusLevel,
    setFocusLevel,
    updateFocusButtons,
    focusShell: els.shell,
    cancelCanvasLinkMode,
    getActiveView: () => activeView,
    closeOverlays,
  });

  function closeOverlays() {
    closeModal();
    closeDrawer();
    q('format-color-menu')?.classList.add('hidden');
    q('details-popover')?.classList.add('hidden');
    q('more-menu')?.classList.add('hidden');
    navHandle.closeFlyout();
// Historical context: see docs/CODEBASE_NOTES.md#jsapp-js-274-279
    if (getFocusLevel(els.shell) !== 'off') {
      setFocusLevel(els.shell, 'off');
      updateFocusButtons();
    }
// Historical context: see docs/CODEBASE_NOTES.md#jsapp-js-284-289
    cancelCanvasLinkMode();
  }


  const project = Store.getActiveProject();
// Historical context: see docs/CODEBASE_NOTES.md#jsapp-js-295-303
  const lastActive = Store.getLastActiveChapter(project);
  if (lastActive) {
    setActiveChapterId(lastActive.chapterId);
  } else {
// Historical context: see docs/CODEBASE_NOTES.md#jsapp-js-308-311
    setActiveChapterId(firstOpenChapterId(project));
  }

  // Session 13 — if load() had to recover from corrupted/missing data, say
  // so instead of the reset happening silently. Checked once, right after
  // the first load() call above (via getActiveProject()) actually ran.
  const loadWarning = Store.consumeLoadWarning();
  if (loadWarning) showStorageWarning(loadWarning.message);

// Historical context: see docs/CODEBASE_NOTES.md#jsapp-js-321-330
  Store.onCrossTabConflict(() => {
    showStorageWarning(
      'This project was just updated in another tab. To avoid overwriting that newer version, saving is paused here. Reload this tab to pick it up before continuing.',
      { actionLabel: 'Reload now', onAction: () => window.location.reload(), persistent: true }
    );
  });

// Historical context: see docs/CODEBASE_NOTES.md#jsapp-js-338-355
  let retryBannerActive = false;
  Store.onSaveError((detail) => {
    if (detail.type === 'stale') return; // onCrossTabConflict above already showed this
    retryBannerActive = true;
    showStorageWarning(
      detail.type === 'quota'
        ? "Storage is full, so this change couldn't be saved yet. Tinta will keep trying in the background; free up space (Backup → Export, then delete an old project or clear other localStorage-heavy sites) so it can catch up."
        : 'A save just failed unexpectedly. Tinta will keep retrying in the background; export a backup as a precaution if this keeps happening.'
    );
  });
  Store.onSaveSuccess(() => {
// Historical context: see docs/CODEBASE_NOTES.md#jsapp-js-367-378
    if (retryBannerActive) {
      const currentText = (els.storageWarningRoot.textContent || '').toLowerCase();
      if (currentText.includes('keep trying') || currentText.includes("couldn't be saved")) {
        retryBannerActive = false;
        els.storageWarningRoot.innerHTML = '';
      } else {
        // The banner currently shown isn't ours — leave it alone, just
        // drop our "we put a banner up" flag so a future save error
        // can put a fresh one up without confusing the next success.
        retryBannerActive = false;
      }
    }
  });

// Historical context: see docs/CODEBASE_NOTES.md#jsapp-js-393-398
  Store.onStorageHeadroom(({ bytes }) => {
    showStorageWarning(`This project's local storage is getting large (~${Math.round(bytes / (1024 * 1024))}MB). Consider exporting a .tinta backup and trimming old snapshots before it gets tight.`);
  });

  // v0.2.9 — service worker update notification. When a new version of
  // Tinta is deployed and the SW takes over (via skipWaiting + clients.claim
  // in sw.js), the running page gets a controllerchange event. The writer
  // is still using the old JS/CSS until they reload, so show a toast
  // offering to reload. This is non-blocking — the writer can dismiss it
  // and keep working; the new version loads on their next natural reload.
  // The toast uses showToast (not showStorageWarning) because this isn't
  // an error — it's a "your app just got better" notification.
  if ('serviceWorker' in navigator) {
    let updateToastShown = false;
    const initialController = navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (updateToastShown) return;
      if (!initialController) return; // first install — no prior controller to update from
      updateToastShown = true;
      showToast('A new version of Tinta is ready. Reload to update.', {
        icon: '✦',
        actionLabel: 'Reload',
        onAction: () => window.location.reload(),
      });
    });
  }

  // 0.2.7 move-out — the render bus is armed here, once, before the first
  // paint; every module repaints via requestRender() from now on.
  setRenderer(render);

  // v0.2.9 — burger sidebar. Apply the collapsed state from the Store
  // on boot. The toggle button is wired in bindGlobalControls().
  if (Store.getSidebarCollapsed()) {
    els.shell.classList.add('sidebar-collapsed');
  }

  render();

  // v0.2.9 — the "app disappears" boot experience. If onboarding hasn't
  // completed, show the 3-card onboarding flow. Otherwise, show the
  // welcome screen (which fades out after 2.5s or on first keystroke).
  // Both are non-blocking — the editor is already mounted and ready
  // behind the overlay.
  //
  // Tests (Playwright/navigator.webdriver) skip both overlays — they
  // test the editor, not the boot experience. The onboarding overlay
  // would block test interactions.
  //
  // P1-5 fix — playwright.config.js:62-64 sets
  // window.__TINTA_SKIP_BOOT_OVERLAYS = true via initScripts, but this
  // check used to read only navigator.webdriver. That worked only because
  // Playwright also sets navigator.webdriver automatically. Now we honor
  // the documented flag first, and fall back to navigator.webdriver for
  // non-Playwright test drivers that don't set the flag.
  const isTestEnv =
    (typeof window !== 'undefined' && window.__TINTA_SKIP_BOOT_OVERLAYS === true) ||
    (typeof navigator !== 'undefined' && navigator.webdriver);
  if (isTestEnv) {
    // Skip — tests want the editor immediately
    Store.setOnboardingComplete(true);
  } else if (!Store.getOnboardingComplete()) {
    openOnboarding();
  } else {
    showWelcomeScreen();
    showWhatsNewBanner();
  }

  // P2-7 — check for a recovery snapshot from a previous session that
  // ended while storage was full. Non-blocking: the toast renders
  // bottom-right and stays until the writer clicks Restore or Discard.
  // In test environments the call no-ops anyway (no snapshot saved
  // during a Playwright session), so no need to gate on isTestEnv.
  RecoveryToast.maybeShow().catch(() => {});
}

// v0.2.9 — "What changed since" dismissable banner. Shows a small
// notification at the top of the editor: how long since the writer
// last opened this project, and which chapter was last active.
// Dismisses on first keystroke or after 5s.
function showWhatsNewBanner() {
  const project = Store.getActiveProject();
  if (!project.lastOpenedAt) return; // never opened before — skip

  const lastOpened = new Date(project.lastOpenedAt);
  const now = new Date();
  const daysSince = Math.floor((now - lastOpened) / (1000 * 60 * 60 * 24));

  let timeText;
  if (daysSince === 0) {
    const hoursSince = Math.floor((now - lastOpened) / (1000 * 60 * 60));
    if (hoursSince === 0) {
      const minsSince = Math.floor((now - lastOpened) / (1000 * 60));
      timeText = minsSince <= 1 ? 'just now' : `${minsSince} minutes ago`;
    } else {
      timeText = hoursSince === 1 ? '1 hour ago' : `${hoursSince} hours ago`;
    }
  } else if (daysSince === 1) {
    timeText = 'yesterday';
  } else {
    timeText = `${daysSince} days ago`;
  }

  const lastChapter = Store.getLastActiveChapter(project);
  const chapterName = lastChapter ? lastChapter.chapterTitle : 'your last chapter';

  // SECURITY: chapterName is project data (a chapter title the writer typed,
  // or one that arrived inside an imported .tinta). This used to be a raw
  // innerHTML template string, which meant a title containing markup ran as
  // HTML the moment the welcome banner appeared — bypassing the html``/
  // toBridge() escaping every other render path goes through. The banner is
  // three nodes, so it's built with DOM APIs instead: textContent can't be
  // turned into markup, and there's no innerHTML site left here to regress.
  const banner = document.createElement('div');
  banner.className = 'whats-new-banner';
  banner.appendChild(document.createTextNode(`Last here ${timeText}. Picking up in `));
  const chapterNameEl = document.createElement('strong');
  chapterNameEl.textContent = chapterName;
  banner.appendChild(chapterNameEl);
  banner.appendChild(document.createTextNode('. '));
  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'whats-new-banner-dismiss';
  dismissBtn.textContent = '✕';
  banner.appendChild(dismissBtn);
  document.body.appendChild(banner);

  requestAnimationFrame(() => banner.classList.add('visible'));

  const dismiss = () => {
    banner.classList.remove('visible');
    setTimeout(() => banner.remove(), 200);
    document.removeEventListener('keydown', keystrokeDismiss, { capture: true });
  };

  const keystrokeDismiss = () => dismiss();
  document.addEventListener('keydown', keystrokeDismiss, { capture: true });
  banner.querySelector('.whats-new-banner-dismiss')?.addEventListener('click', dismiss);

  // Auto-dismiss after 5s
  setTimeout(dismiss, 5000);
}

function cacheEls() {
  els.projectTitle = q('project-title');
  els.projectSwitcherBtn = q('project-switcher-btn');
  els.chapterList = q('chapter-list');
  els.arcFilterBar = q('arc-filter-bar');
  els.arcFilterSelect = q('arc-filter-select');
  els.newChapterBtn = q('new-chapter-btn');
  els.newFromTemplateBtn = q('new-from-template-btn');
  // Nav tab rendering/interaction now lives in js/nav.js — see navHandle,
  // created once in init() via Nav.attachNavTabs(). els.navTabsGroups is
  // just the container element handed to it.
  els.navTabsGroups = q('nav-tabs-groups');
  els.viewPanels = document.querySelectorAll('.view-panel');
  // P2-17 fix — els.saveStatus and els.wordCount used to be q()'d here
  // at boot, but the only template that emits those ids is writeView.js
  // (line 166-167), which lives inside .view-panel[data-view="write"]
  // — an empty panel at boot (per index.html:68). Both q() calls
  // returned null at boot, and writeView.js:172-173 immediately
  // re-assigned them on the first render. The boot assignment was a
  // no-op that obscured "this is set per-writeView-render". Now it's
  // just a comment so the next reader doesn't wonder.
  els.shell = q('app-shell');
  els.sprintBtn = q('sprint-btn');
  els.imagesBtn = q('images-btn');
  els.organizeBtn = q('organize-btn');
  els.settingsBtn = q('settings-btn');
  els.storageWarningRoot = q('storage-warning-root');
  els.celebrationToastRoot = q('celebration-toast-root');
  els.paletteBtn = q('palette-btn');
}


function bindGlobalControls() {
  els.newChapterBtn.addEventListener('click', () => {
    // v0.2.9 fix — count only visible (non-trashed, non-archived) chapters
    // for the auto-generated title. Previously used chapters.length which
    // includes trashed/archived chapters, so a writer who created and
    // deleted chapters would see "Chapter 22" when they only have 13
    // visible chapters. The number should match what the writer sees
    // in the sidebar, not what's in the database.
    const visibleCount = Store.getActiveProject().chapters.filter(
      (c) => !c.trashedAt && !c.archived
    ).length;
    const chapter = Store.createChapter(`Chapter ${visibleCount + 1}`);
    setActiveChapterId(chapter.id);
    render();
    // v0.2.9 — pre-select the chapter title input so the writer can
    // type a real title immediately. One fewer click per chapter creation.
    requestAnimationFrame(() => {
      const titleInput = q('chapter-title-input');
      if (titleInput) {
        titleInput.focus();
        titleInput.select();
      }
    });
  });

  els.projectTitle.addEventListener('input', () => {
    Store.updateProjectMeta({ title: els.projectTitle.value || 'Untitled Project' });
  });
  els.projectTitle.addEventListener('blur', () => {
    els.projectTitle.value = Store.getActiveProject().title;
  });

  // Nav click/keydown/outside-click handling now lives in js/nav.js,
  // wired once via Nav.attachNavTabs() in init().

  els.sprintBtn.addEventListener('click', openSprintModal);

  els.projectSwitcherBtn.addEventListener('click', openLibrary);
  els.imagesBtn.addEventListener('click', () => openImageLibrary());
  els.newFromTemplateBtn.addEventListener('click', () => openTemplatePicker());
  els.organizeBtn.addEventListener('click', () => openOrganizeModal());
  els.settingsBtn.addEventListener('click', openSettingsModal);
  els.paletteBtn.addEventListener('click', openCommandPalette);

  // v0.2.9 — burger sidebar toggle. Adds a toggle button to the sidebar
  // footer dynamically (doesn't modify index.html). Toggles the
  // `sidebar-collapsed` class on #app-shell and persists the state.
  const sidebarToggle = document.createElement('button');
  sidebarToggle.id = 'sidebar-toggle-btn';
  sidebarToggle.className = 'sidebar-toggle-btn';
  sidebarToggle.title = Store.getSidebarCollapsed() ? 'Expand sidebar' : 'Collapse sidebar';
  sidebarToggle.textContent = Store.getSidebarCollapsed() ? '☰' : '☜';
  sidebarToggle.addEventListener('click', () => {
    const collapsed = !Store.getSidebarCollapsed();
    Store.setSidebarCollapsed(collapsed);
    els.shell.classList.toggle('sidebar-collapsed', collapsed);
    sidebarToggle.textContent = collapsed ? '☰' : '☜';
    sidebarToggle.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  });
  els.shell.querySelector('.sidebar-footer')?.prepend(sidebarToggle);

  // Mobile drawer control. At ≤800px the sidebar becomes an off-canvas
  // drawer (see css/shell.css) — which means the writer needs a way to
  // reach the chapter list that ISN'T inside the sidebar. The existing
  // .sidebar-toggle-btn above can't serve: it lives in the panel it would
  // have to reveal. This one lives in .view-tabs, inside .main, and is
  // display:none above the breakpoint.
  const mobileNavBtn = document.createElement('button');
  mobileNavBtn.id = 'mobile-nav-btn';
  mobileNavBtn.className = 'mobile-nav-btn';
  mobileNavBtn.type = 'button';
  mobileNavBtn.title = 'Chapters and project navigation';
  mobileNavBtn.setAttribute('aria-label', 'Chapters and project navigation');
  mobileNavBtn.setAttribute('aria-expanded', 'false');
  mobileNavBtn.textContent = '☰';

  const mobileNavBackdrop = document.createElement('div');
  mobileNavBackdrop.className = 'mobile-nav-backdrop';

  const setMobileNavOpen = (open) => {
    els.shell.classList.toggle('mobile-nav-open', open);
    // aria-expanded needs an explicit "true"/"false" string — a raw boolean
    // collapses to an empty attribute value.
    mobileNavBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  const closeMobileNav = () => setMobileNavOpen(false);

  mobileNavBtn.addEventListener('click', () => {
    setMobileNavOpen(!els.shell.classList.contains('mobile-nav-open'));
  });
  mobileNavBackdrop.addEventListener('click', closeMobileNav);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMobileNav();
  });
  // Picking a chapter or a view is a completed navigation — leaving the
  // drawer open over the thing the writer just asked to see would be the
  // same mistake as hiding the sidebar entirely.
  els.shell.querySelector('.sidebar')?.addEventListener('click', (e) => {
    if (e.target.closest('.chapter-list li, #new-chapter-btn, #new-from-template-btn')) closeMobileNav();
  });
  q('view-tabs')?.addEventListener('click', (e) => {
    if (e.target.closest('[data-view]')) closeMobileNav();
  });

  q('view-tabs')?.prepend(mobileNavBtn);
  document.body.appendChild(mobileNavBackdrop);
}

export function render(opts = {}) {
// Historical context: see docs/CODEBASE_NOTES.md#jsapp-js-463-467
  const { skipModalClose = false } = opts;
  const project = Store.getActiveProject();
  if (!skipModalClose) closeModal();
// Historical context: see docs/CODEBASE_NOTES.md#jsapp-js-471-477
  if (activeView !== 'book') revokeBookModeUrls();
// Historical context: see docs/CODEBASE_NOTES.md#jsapp-js-479-482
  if (activeView !== 'notes' && activeView !== 'canvas' && activeView !== 'references') revokeEntityPortraitUrls();
  // Tier 4 pass — same reasoning: the map background's object URL is only
  // needed while the Map view is actually showing it.
  if (activeView !== 'map') revokeMapImageUrl();
  els.projectTitle.value = project.title;
  // P2-11 — route through Theme.applyFont() instead of inline
  // setAttribute, so the missing-blob fallback for 'custom' is owned
  // in one place.
  Theme.applyFont(Store.getManuscriptFont());

  renderSidebar(project);
  renderViewTabs();

  if (activeView === 'write') renderWriteView(project);
  if (activeView === 'corkboard') renderCorkboardView(project);
  if (activeView === 'outline') renderOutlineView(project);
  if (activeView === 'notes') renderNotesView(project);
  if (activeView === 'canvas') renderCanvasView(project);
  if (activeView === 'map') renderMapView(project);
  if (activeView === 'references') renderReferencesView(project);
  if (activeView === 'systems') renderSystemsView(project);
  if (activeView === 'sketch') renderSketchView(project);
  if (activeView === 'snippets') renderSnippetsView(project);
  if (activeView === 'timeline') renderTimelineView(project);
  if (activeView === 'questions') renderQuestionsView(project);
  if (activeView === 'search') renderSearchView(project);
  if (activeView === 'book') renderBookView(project);
  if (activeView === 'stats') renderStatsView(project);
  if (activeView === 'health') renderHealthView(project);
  if (activeView === 'checklist') renderChecklistView(project);
  if (activeView === 'annotations') renderAnnotationsView(project);
  if (activeView === 'decisions') renderDecisionsView(project);
  if (activeView === 'resume') renderResumeView(project);

  // The sketch canvas element gets torn down on any re-render outside the
  // sketch view (or on switching sketches) — detach its pointer listeners
  // so they don't linger on an element that's no longer in the DOM.
  if (activeView !== 'sketch') detachSketchDrawing();
}

function renderViewTabs() {
  navHandle.render();
  els.viewPanels.forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.view === activeView);
  });
// Historical context: see docs/CODEBASE_NOTES.md#jsapp-js-525-534
  if (activeView !== 'write' && getFocusLevel(els.shell) !== 'off') {
    setFocusLevel(els.shell, 'off');
    updateFocusButtons();
  }
}






// Historical context: see docs/CODEBASE_NOTES.md#jsapp-js-546-551

// Historical context: see docs/CODEBASE_NOTES.md#jsapp-js-553-566
function navigateToMutationTarget(result) {
  const project = Store.getActiveProject();
// Historical context: see docs/CODEBASE_NOTES.md#jsapp-js-569-572
  if (!project || project.id !== result.projectId) return;
  if (result.targetType === 'chapter') {
    const chapter = Store.getChapter(result.targetId);
    if (chapter) {
      setActiveChapterId(result.targetId);
      setActiveView('write');
    }
    // else: this undo/redo just removed the chapter (undoing its own
    // creation) — leave the current view alone rather than pointing at
    // something that no longer exists.
  } else if (result.targetType === 'entity') {
    const entity = Store.getEntity(result.targetId);
    if (entity) {
      setActiveEntityId(result.targetId);
      setActiveView('notes');
    }
  }
  render();
}

function performUndo() {
  const result = Store.undo();
  if (!result) {
    showToast('Nothing to undo', { icon: '↩' });
    return;
  }
  navigateToMutationTarget(result);
  showToast(`Undid: ${result.label}`, { icon: '↩' });
}

function performRedo() {
  const result = Store.redo();
  if (!result) {
    showToast('Nothing to redo', { icon: '↪' });
    return;
  }
  navigateToMutationTarget(result);
  showToast(`Redid: ${result.label}`, { icon: '↪' });
}


document.addEventListener('DOMContentLoaded', init);
