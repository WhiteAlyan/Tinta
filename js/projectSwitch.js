// Historical context: see docs/CODEBASE_NOTES.md#jsprojectswitch-js
import * as Store from './store.js';
import { setActiveChapterId, setActiveView } from './context.js';
import { closeDrawer } from './drawer.js';
import { getFocusLevel, setFocusLevel, updateFocusButtons } from './editor.js';
import { els } from './els.js';
import { closeModal } from './modal.js';
import { resetEntityTagFilters, flushEntityFieldSave } from './notesView.js';
import { resetReferenceTagFilters } from './referencesView.js';
import { resetAllViews } from './viewLifecycle.js';
import { requestRender } from './renderBus.js';

export function firstOpenChapterId(project) {
  const sorted = [...project.chapters].filter((c) => !c.trashedAt).sort((a, b) => a.order - b.order);
  return sorted[0]?.id || null;
}

export function teardownLiveStateForProjectSwitch() {
  // CR-15 — entity name/description edits save on the autosave debounce
  // (1.5s default, up to 5s on Relaxed), and this teardown used to be
  // invisible to that timer: it's wired to pagehide/beforeunload only.
  // After Store.switchProject() the deferred flush looked the entity up in
  // the NEW project, found nothing, and the edit vanished without a
  // warning. Flushing FIRST — while the old project is still the active
  // one — lands the edit in the project it belongs to, exactly like the
  // chapter editor's flush on render.
  flushEntityFieldSave();
  closeDrawer();
  if (getFocusLevel(els.shell) !== 'off') {
    setFocusLevel(els.shell, 'off');
    updateFocusButtons();
  }
// Historical context: see docs/CODEBASE_NOTES.md#jsprojectswitch-js
  resetAllViews();
// Historical context: see docs/CODEBASE_NOTES.md#jsprojectswitch-js
  resetEntityTagFilters();
  resetReferenceTagFilters();
// Historical context: see docs/CODEBASE_NOTES.md#jsprojectswitch-js
  Store.clearUndoHistory();
}

export function switchToProjectFromLibrary(projectId) {
  // CR-14 — every card click landed here, including the card badged
  // "Current". Clicking one's own book is the natural gesture for closing
  // the Library, but the unconditional teardown erased the project-level
  // undo stack, every per-view filter, and the active chapter (reset to
  // the first open chapter) — before Store.switchProject() no-opped on
  // the same-id switch. Early-return keeps that gesture harmless: the
  // Library closes, the workspace keeps its exact state.
  if (projectId === Store.getActiveProject()?.id) {
    closeModal();
    return;
  }
  teardownLiveStateForProjectSwitch();
  Store.switchProject(projectId);
// Historical context: see docs/CODEBASE_NOTES.md#jsprojectswitch-js
  const next = Store.getActiveProject();
  setActiveChapterId(firstOpenChapterId(next));
  setActiveView('write');
  closeModal();
  requestRender();
}
