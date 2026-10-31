// Historical context: see docs/CODEBASE_NOTES.md#jsprojectswitch-js
import * as Store from './store.js';
import { setActiveChapterId, setActiveView } from './context.js';
import { closeDrawer } from './drawer.js';
import { getFocusLevel, setFocusLevel, updateFocusButtons } from './editor.js';
import { els } from './els.js';
import { closeModal } from './modal.js';
import { resetEntityTagFilters } from './notesView.js';
import { resetReferenceTagFilters } from './referencesView.js';
import { resetAllViews } from './viewLifecycle.js';
import { requestRender } from './renderBus.js';

export function firstOpenChapterId(project) {
  const sorted = [...project.chapters].filter((c) => !c.trashedAt).sort((a, b) => a.order - b.order);
  return sorted[0]?.id || null;
}

export function teardownLiveStateForProjectSwitch() {
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
  teardownLiveStateForProjectSwitch();
  Store.switchProject(projectId);
// Historical context: see docs/CODEBASE_NOTES.md#jsprojectswitch-js
  const next = Store.getActiveProject();
  setActiveChapterId(firstOpenChapterId(next));
  setActiveView('write');
  closeModal();
  requestRender();
}
