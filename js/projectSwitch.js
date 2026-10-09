// Historical context: see docs/CODEBASE_NOTES.md#jsprojectswitch-js-1-4
import * as Store from './store.js';
import { setActiveChapterId, setActiveView, setActiveEntityId, setActiveSystemId, setActiveMapId, setActiveReferenceId, setActiveSketchId } from './context.js';
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
// Historical context: see docs/CODEBASE_NOTES.md#jsprojectswitch-js-27-34
  resetAllViews();
// Historical context: see docs/CODEBASE_NOTES.md#jsprojectswitch-js-36-40
  resetEntityTagFilters();
  resetReferenceTagFilters();
// Historical context: see docs/CODEBASE_NOTES.md#jsprojectswitch-js-43-47
  Store.clearUndoHistory();
}

export function switchToProjectFromLibrary(projectId) {
  teardownLiveStateForProjectSwitch();
  Store.switchProject(projectId);
// Historical context: see docs/CODEBASE_NOTES.md#jsprojectswitch-js-54-57
  const next = Store.getActiveProject();
  setActiveChapterId(firstOpenChapterId(next));
  setActiveView('write');
  closeModal();
  requestRender();
}
