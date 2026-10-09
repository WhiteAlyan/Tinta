// Historical context: see docs/CODEBASE_NOTES.md#jscontext-js-1-35

// ── the canonical state ────────────────────────────────────────────────
export let activeView = 'write'; // 'write' | 'corkboard' | 'outline' | 'notes' | 'canvas' | 'sketch' | 'snippets' | 'timeline' | 'questions' | 'search' | 'book' | 'stats' | 'health' | 'checklist' | 'annotations' | 'decisions'
export let activeChapterId = null;
export let activeEntityId = null;
export let activeSketchId = null;
export let activeMapId = null;
export let activeReferenceId = null;
export let activeSystemId = null;
// Historical context: see docs/CODEBASE_NOTES.md#jscontext-js-45-49
export let currentEditorHandle = null;

// ── setters (writers outside this module must use these) ───────────────
export function setActiveView(view) {
  activeView = view;
}
export function setActiveChapterId(id) {
  activeChapterId = id;
}
export function setActiveEntityId(id) {
  activeEntityId = id;
}
export function setActiveSketchId(id) {
  activeSketchId = id;
}
export function setActiveMapId(id) {
  activeMapId = id;
}
export function setActiveReferenceId(id) {
  activeReferenceId = id;
}
export function setActiveSystemId(id) {
  activeSystemId = id;
}
export function setCurrentEditorHandle(handle) {
  currentEditorHandle = handle;
}

// 0.2.7 move-out — the currently-mounted Write-view textarea, if any. Moved
// from app.js verbatim: the Image Library (now imageLibrary.js) reads it to
// insert tokens at the caret; writeView.js sets it through the same setter.
export let activeTextareaEl = null;
export function setActiveTextareaEl(el) {
  activeTextareaEl = el;
}

// Historical context: see docs/CODEBASE_NOTES.md#jscontext-js-86-89
export let navHandle = null;
export function setNavHandle(handle) {
  navHandle = handle;
}
