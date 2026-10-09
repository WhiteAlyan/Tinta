// Tinta — module-load smoke test.
//
// Catches broken imports BEFORE the browser does. The s28 .tinta pass
// shipped two real bugs that smoketests couldn't catch (an import of
// `html` from app.js when app.js only re-exported `escapeHtml` etc.;
// an import of `extractMentions` from mentions.js when it lived in
// store.js) because every existing smoketest imports Store or another
// single module directly — none of them go through the full app.js →
// backup.js / drawer.js / etc. module-load chain the browser does.
//
// This test does that. It runs in Node with a minimal DOM shim (just
// enough to let the modules that touch `document`/`window` at module
// load time succeed), imports each browser-loadable module in turn,
// and verifies the imports resolve + the expected exports exist.
// It's NOT a functional test — it doesn't render anything or check
// behavior. It just makes sure the modules would actually load in
// a browser without "does not provide an export named X" errors.
//
// Run with: node module-load.smoketest.mjs

// ── DOM shim (the minimum the modules need at load time) ────────────────
const noop = () => {};
globalThis.window = globalThis;
window.addEventListener = noop;
window.removeEventListener = noop;
window.dispatchEvent = noop;
window.matchMedia = () => ({ matches: false, addEventListener: noop, removeEventListener: noop, media: '' });
window.scrollTo = noop;
window.getComputedStyle = () => ({ getPropertyValue: () => '' });
window.prompt = () => null;
window.confirm = () => true;
window.alert = noop;

globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: noop,
  removeEventListener: noop,
  dispatchEvent: noop,
  documentElement: { setAttribute: noop, getAttribute: () => null, style: { setProperty: noop, getPropertyValue: () => '' } },
  body: { appendChild: noop, removeChild: noop, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, style: {} },
  head: { appendChild: noop, removeChild: noop },
  createElement: () => ({
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    style: { setProperty: noop, getPropertyValue: () => '' },
    setAttribute: noop,
    removeAttribute: noop,
    appendChild: noop,
    removeChild: noop,
    remove: noop,
    addEventListener: noop,
    querySelector: () => null,
    querySelectorAll: () => [],
    getContext: () => ({ arc: noop, fill: noop, beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop, clearRect: noop }),
    focus: noop,
    scrollIntoView: noop,
    click: noop,
    setSelectionRange: noop,
    getContextAttributes: () => ({}),
  }),
  createTextNode: () => ({}),
};

globalThis.localStorage = new (class {
  constructor() { this.store = new Map(); }
  getItem(k) { return this.store.has(k) ? this.store.get(k) : null; }
  setItem(k, v) { this.store.set(k, String(v)); }
  removeItem(k) { this.store.delete(k); }
  clear() { this.store.clear(); }
})();

Object.defineProperty(globalThis, 'navigator', {
  value: { serviceWorker: { register: () => Promise.resolve() }, onLine: true, userAgent: 'node', language: 'en' },
  writable: true,
  configurable: true,
});

globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.URL = globalThis.URL || { revokeObjectURL: noop, createObjectURL: noop };
globalThis.Blob = class Blob {
  constructor(parts, opts) { this.parts = parts; this.type = opts?.type || ''; }
  text() { return Promise.resolve(this.parts.join('')); }
  arrayBuffer() { return Promise.resolve(new ArrayBuffer(0)); }
};
globalThis.File = class File {
  constructor(parts, name) { this.parts = parts; this.name = name; this.size = (parts[0] || '').length; }
  arrayBuffer() { return Promise.resolve(new ArrayBuffer(0)); }
};
globalThis.FileReader = class { readAsText() {} readAsDataURL() {} };
globalThis.Image = class {};
globalThis.fetch = () => Promise.resolve({ ok: true, text: () => Promise.resolve('') });
globalThis.CSS = { escape: (s) => String(s).replace(/["\\]/g, '\\$&') };
globalThis.indexedDB = { open: () => ({ onsuccess: null, onerror: null, onupgradeneeded: null, result: {} }) };
globalThis.SpeechSynthesis = { getVoices: () => [], speak: noop, cancel: noop };
globalThis.speechSynthesis = globalThis.SpeechSynthesis;
globalThis.AudioContext = class { close() {} };
globalThis.OfflineAudioContext = globalThis.AudioContext;

// ── test harness ────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; failures.push(msg); console.error(`  ✗ ${msg}`); }
}
function assertEqual(actual, expected, msg) {
  assert(actual === expected, `${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

console.log('Loading every browser-loadable module...\n');

// ── modules that the browser loads (from index.html + sw.js SHELL_FILES) ─
const modules = [
  // app.js is the entry point — load first. 0.2.7 move-out: the shell's only
  // export is render() itself now (boot + render loop + undo/redo navigation);
  // every re-export shim is gone and nothing imports app.js anymore.
  { name: 'app.js', requiredExports: ['render'] },
  // 0.2.7 move-out — the one repaint seam (app.js arms it via setRenderer)
  { name: 'renderBus.js', requiredExports: ['setRenderer', 'requestRender'] },
  { name: 'appMeta.js', requiredExports: ['TINTA_VERSION', 'TINTA_PHASE', 'TINTA_CREATOR'] },
  { name: 'portraits.js', requiredExports: ['resolveEntityAvatar', 'trackEntityPortraitUrl', 'revokeEntityPortraitUrls'] },
  { name: 'tagFilter.js', requiredExports: ['tagFilterBarHtml', 'wireTagFilterBar', 'filterByTagSet'] },
  { name: 'worldTemplates.js', requiredExports: ['WORLDBUILDING_TEMPLATES'] },
  { name: 'sidebar.js', requiredExports: ['renderSidebar'] },
  { name: 'outlineView.js', requiredExports: ['renderOutlineView'] },
  { name: 'sketchView.js', requiredExports: ['renderSketchView', 'detachSketchDrawing'] },
  { name: 'bookView.js', requiredExports: ['renderBookView', 'revokeBookModeUrls'] },
  { name: 'resumeView.js', requiredExports: ['renderResumeView'] },
  { name: 'questionsView.js', requiredExports: ['renderQuestionsView'] },
  { name: 'checklistView.js', requiredExports: ['renderChecklistView'] },
  { name: 'annotationsView.js', requiredExports: ['renderAnnotationsView'] },
  { name: 'historyModals.js', requiredExports: ['openHistoryModal', 'openEntityHistoryModal'] },
  { name: 'typeManagers.js', requiredExports: ['openChapterTypeManager', 'openEntityTypeManager'] },
  { name: 'exportMenu.js', requiredExports: ['openExportMenu'] },
  { name: 'templatePicker.js', requiredExports: ['openTemplatePicker'] },
  { name: 'organizeModal.js', requiredExports: ['openOrganizeModal'] },
  { name: 'library.js', requiredExports: ['openLibrary', 'openSeriesManager', 'registerLibraryCleanup'] },
  { name: 'projectSwitch.js', requiredExports: ['firstOpenChapterId', 'teardownLiveStateForProjectSwitch', 'switchToProjectFromLibrary'] },
  { name: 'commandPalette.js', requiredExports: ['openCommandPalette'] },
  { name: 'imageLibrary.js', requiredExports: ['openImageLibrary', 'renderImageLibraryGrid'] },
  { name: 'settingsModal.js', requiredExports: ['openSettingsModal'] },
  // 0.2.6 de-hub pass (Pass 0) — surfaces rehomed off the app.js hub
  { name: 'els.js', requiredExports: ['els'] },
  // 0.2.6 Pass 1 — the one canonical workspace-state module
  // 0.2.7 move-out — activeTextareaEl/setActiveTextareaEl (the Image
  // Library's caret target) + navHandle/setNavHandle (the nav handle the
  // Settings modal reads) joined from app.js.
  { name: 'context.js', requiredExports: ['activeView', 'activeChapterId', 'activeEntityId', 'activeSketchId', 'activeMapId', 'activeReferenceId', 'activeSystemId', 'currentEditorHandle', 'setActiveView', 'setActiveChapterId', 'setActiveEntityId', 'setActiveSketchId', 'setActiveMapId', 'setActiveReferenceId', 'setActiveSystemId', 'setCurrentEditorHandle', 'activeTextareaEl', 'setActiveTextareaEl', 'navHandle', 'setNavHandle'] },
  { name: 'vocabulary.js', requiredExports: ['STATUS_LABEL', 'STATUS_ORDER', 'vocabularyValues', 'vocabularyLabel', 'vocabularyOrder', 'vocabularyIsValid', 'vocabularyIsTerminal', 'vocabularyDomains', 'StatusBadgeRender'] },
  // 0.2.6 Pass 5 — shared empty-state helper
  { name: 'emptyState.js', requiredExports: ['EmptyState'] },
  // 0.2.6 Pass 2 — the canonical "open this thing" navigation intent
  { name: 'targets.js', requiredExports: ['resolveTarget', 'openTarget', 'navigableTypes'] },
  { name: 'toast.js', requiredExports: ['showToast', 'showGoalCelebration', 'showStorageWarning'] },
  { name: 'file-utils.js', requiredExports: ['downloadTextFile', 'downloadBinaryFile', 'safeFilename'] },
  // dom-utils.js — the helper itself (flashAndScrollTo since 0.2.7)
  { name: 'dom-utils.js', requiredExports: ['html', 'raw', 'toBridge', 'escapeHtml', 'escapeAttr', 'q', 'capitalize', 'flashAndScrollTo'] },
  // The .tinta pass modules
  { name: 'tintaPackage.js', requiredExports: ['exportTintaProject', 'importTintaProject', 'TINTA_FORMAT_VERSION'] },
  { name: 'autoBackup.js', requiredExports: ['isAutoBackupSupported', 'writeTintaToBackupFolder', 'scheduleAutoBackupTinta'] },
  // drawer.js — the Navigation/Context pass module
  { name: 'drawer.js', requiredExports: ['openEntityDrawer', 'openSceneInspector', 'openReferenceDrawer', 'openRuleNodeDrawer', 'openMapMarkerDrawer', 'openTimelineEventDrawer', 'openContextDrawer', 'openRelationshipDrawer', 'closeDrawer'] },
  // The shared modal shell (v0.2 Pass 1) + closeModal (0.2.6 de-hub pass)
  { name: 'modal.js', requiredExports: ['openModal', 'teardown', 'confirmDialog', 'closeModal', 'onModalCloseCleanup'] },
  // The extracted modal modules
  { name: 'annotationsModal.js', requiredExports: ['openAnnotationsModal'] },
  { name: 'backup.js', requiredExports: ['openBackupModal'] },
  { name: 'generatorModal.js', requiredExports: [] },
  { name: 'grammarModal.js', requiredExports: ['openGrammarModal'] },
  { name: 'readAloud.js', requiredExports: ['openReadAloudModal'] },
  { name: 'sprintPanel.js', requiredExports: ['openSprintModal'] },
  { name: 'wordCheckModal.js', requiredExports: ['openWordCheckModal', 'openThesaurusModal'] },
  // nav.js — the nav bar module
  { name: 'nav.js', requiredExports: ['NAV_GROUPS', 'attachNavTabs', 'effectiveNavStyle'] },
  // Command/shortcut registry (v0.2 Phase 5: UI unification) — dispatches
  // app-level keydowns, feeds the Settings help table and palette rows
  { name: 'commands.js', requiredExports: ['COMMANDS', 'SHORTCUT_GROUP_ORDER', 'handleGlobalShortcut', 'attachGlobalShortcuts', 'getPaletteCommands', 'shortcutKeyLabel', 'commandKeysLabel', 'isMacPlatform'] },
  // Extracted view modules (v0.2 Pass 3)
  { name: 'mapView.js', requiredExports: ['renderMapView', 'revokeMapImageUrl'] },
  { name: 'referencesView.js', requiredExports: ['renderReferencesView', 'resetReferenceTagFilters'] },
  { name: 'systemsView.js', requiredExports: ['renderSystemsView'] },
  // Canvas-and-trio pass — Relationship Canvas view module
  { name: 'canvasView.js', requiredExports: ['renderCanvasView', 'cancelCanvasLinkMode', 'entityTypeLabelPlural'] },
  // Canvas-and-trio pass — Search view module
  { name: 'searchView.js', requiredExports: ['renderSearchView', 'applySavedSearch'] },
  // Canvas-and-trio pass — Notes view module
  { name: 'notesView.js', requiredExports: ['renderNotesView', 'flushEntityFieldSave', 'resetEntityTagFilters'] },
  // Canvas-and-trio pass — Write view module (the last inline view)
  { name: 'writeView.js', requiredExports: ['renderWriteView'] },
  // Pure-logic modules
  { name: 'search.js', requiredExports: ['searchProject'] },
  { name: 'palette.js', requiredExports: [] },
  { name: 'format.js', requiredExports: [] },
  { name: 'diff.js', requiredExports: [] },
  { name: 'mentions.js', requiredExports: ['renderMentionsHtml'] },
  { name: 'wordtools.js', requiredExports: [] },
  { name: 'generator.js', requiredExports: [] },
  { name: 'ruleSystem.js', requiredExports: [] },
  // Manuscript export
  { name: 'manuscriptExport.js', requiredExports: ['exportDocx', 'exportEpub'] },
  // ImageStore + AssetStore
  { name: 'imagestore.js', requiredExports: ['getObjectUrl', 'putBlob'] },
  { name: 'assetstore.js', requiredExports: ['putBlob', 'getBlob', 'KEYS'] },
  // Editor + canvas (editor.js also owns updateFocusButtons since 0.2.7;
  // theme.js owns applyMotionSpeed since 0.2.7)
  { name: 'editor.js', requiredExports: ['attachEditor', 'updateFocusButtons'] },
  { name: 'canvas.js', requiredExports: [] },
  { name: 'sketchpad.js', requiredExports: [] },
  // Theme + audio
  { name: 'theme.js', requiredExports: ['applyMotionSpeed'] },
  { name: 'ambience.js', requiredExports: [] },
  { name: 'tts.js', requiredExports: [] },
  { name: 'typewriter.js', requiredExports: [] },
  { name: 'sprint.js', requiredExports: [] },
  // Grammar
  { name: 'grammar.js', requiredExports: [] },
  // Zip helper
  { name: 'zip.js', requiredExports: ['createZip'] },
  // 0.2.8 Pass 1 — the vault machinery (schema, migration ladder, load/save,
  // cross-tab/quota, undo/redo, delete-backup buffer, root accessors) moved
  // out of store.js; store.js re-exports the public names unchanged.
  { name: 'store-core.js', requiredExports: ['load', 'save', 'migrate', 'getActiveProject', 'getActiveDb', 'undo', 'redo', 'backupBeforeDelete', 'replaceDb', 'AUTO_CHECKPOINT_INTERVAL_MS', 'capManualSnapshots', 'slugType', 'getSeries', 'getSeriesForActiveProject', 'escapeRegExp', 'getChapter'] },
  { name: 'store-settings.js', requiredExports: ['getTheme', 'setTheme', 'getManuscriptFont', 'setManuscriptFont', 'getCustomFont', 'setCustomFont', 'getNavStyle', 'setNavStyle', 'getMotionSettings', 'setMotionSettings', 'getGrammarSettings', 'setGrammarSettings', 'getAmbienceSettings', 'setAmbienceSettings', 'getBackgroundSettings', 'setBackgroundSettings', 'getTtsSettings', 'setTtsSettings', 'getTypewriterSettings', 'setTypewriterSettings', 'getCustomThesaurus', 'addThesaurusEntry', 'deleteThesaurusEntry', 'getAutosaveDelayMs', 'setAutosaveDelayMs'] },
  { name: 'store-backup.js', requiredExports: ['exportManifest', 'exportFullBackup', 'importFullBackup'] },
  { name: 'store-projects.js', requiredExports: ['listProjects', 'createProject', 'switchProject', 'markProjectOpened', 'deleteProject', 'listSeries', 'createSeries', 'renameSeries', 'addActiveProjectToSeries', 'removeActiveProjectFromSeries', 'deleteSeries', 'updateProjectMeta', 'getDistinctProjectValues', 'setCoverImage'] },
  { name: 'store-manuscript.js', requiredExports: ['createChapter', 'updateChapterContent', 'deleteChapter', 'trashChapter', 'restoreChapter', 'createScene', 'updateScene', 'moveScene', 'deleteScene', 'createSnapshot', 'getSnapshots', 'restoreSnapshot', 'getFolders', 'createFolder', 'getParts', 'createPart', 'getCollections', 'createCollection', 'getSavedSearches', 'createSavedSearch', 'getChapterTypes', 'createChapterType', 'deleteChapterType', 'getDocumentTemplates', 'createDocumentTemplate', 'createChapterFromTemplate', 'getContentChapterNumber', 'exportChapterText', 'exportProjectText', 'importChapterFromText', 'searchProject', 'replaceInChapters', 'getRecentActivity', 'recordChapterOpened', 'getTotalWordCount', 'getDailyWordCounts', 'getCurrentStreak', 'checkGoalCelebration', 'updateChapterArc', 'getAllScenesFlat', 'SCENE_INTENSITY_LEVELS', 'SCENE_REVISION_STATUSES'] },
  { name: 'store-entities.js', requiredExports: ['getEntityList', 'getSeriesEntityList', 'getEntity', 'isSeriesEntity', 'findEntityByName', 'getEntityChildren', 'wouldCreateCycle', 'getCanonStatuses', 'getAuthoritySources', 'createEntity', 'createSeriesEntity', 'promoteEntityToSeries', 'demoteEntityToProject', 'deleteSeriesEntity', 'getEntityTypes', 'getEntityType', 'createEntityType', 'updateEntityType', 'deleteEntityType', 'getDistinctEntityTags', 'getEntityPortraitId', 'addEntityImage', 'removeEntityImage', 'setEntityPrimaryImage', 'updateEntity', 'getEntitySnapshots', 'createEntitySnapshot', 'getEntitySnapshot', 'deleteEntitySnapshot', 'getEntitySnapshotChanges', 'restoreEntitySnapshot', 'getEntityStatusEvents', 'addEntityStatusEvent', 'updateEntityStatusEvent', 'deleteEntityStatusEvent', 'setEntityPosition', 'MENTION_RE', 'extractMentions', 'getBacklinksFor'] },
  { name: 'store-relationships.js', requiredExports: ['getRelationshipList', 'getRelationship', 'getRelationshipsForEntity', 'getRelationshipTypeList', 'getRelationshipType', 'getRelationshipLabel', 'getRelationshipTypeUsageCount', 'createRelationship', 'updateRelationship', 'getRelationshipHistory', 'addRelationshipHistoryEntry', 'updateRelationshipHistoryEntry', 'deleteRelationshipHistoryEntry', 'renameRelationshipType', 'detachRelationshipToLabel', 'deleteRelationship'] },
  { name: 'store-world.js', requiredExports: ['getProjectCalendar', 'isCalendarActive', 'enableCalendar', 'disableCalendar', 'isValidCalendarDate', 'calendarDateToAbsoluteDay', 'absoluteDayToCalendarDate', 'compareCalendarDates', 'daysBetweenCalendarDates', 'offsetCalendarDate', 'getWeekdayIndex', 'getWeekdayName', 'formatCalendarDate', 'formatTimelineEventDate', 'findCalendarOrderMismatches', 'getTimelineEventList', 'getTimelineEvent', 'createTimelineEvent', 'updateTimelineEvent', 'deleteTimelineEvent', 'reorderTimelineEvent', 'listImages', 'getImage', 'createImageMeta', 'updateImageMeta', 'deleteImageMeta', 'getProjectImageIds', 'getMapTypes', 'getMapList', 'getMap', 'createMap', 'updateMap', 'deleteMap', 'addMarker', 'getMarker', 'updateMarker', 'deleteMarker', 'getReferenceTypes', 'getReferenceList', 'getReference', 'createReference', 'updateReference', 'deleteReference', 'getDistinctReferenceTags', 'getReferencesForEntity', 'getReferencesForChapter', 'getReferencesForScene', 'getPronunciationList', 'setPronunciation', 'deletePronunciation', 'applyPronunciations', 'getCustomDictionary', 'addToCustomDictionary', 'removeFromCustomDictionary', 'isDictionaryIgnored'] },
  { name: 'store-systems.js', requiredExports: ['getRuleSystemList', 'getRuleSystem', 'createRuleSystem', 'updateRuleSystem', 'deleteRuleSystem', 'getSystemNodeList', 'getSystemNode', 'getDependentNodes', 'createSystemNode', 'updateSystemNode', 'deleteSystemNode'] },
  { name: 'store-craft.js', requiredExports: ['getSketchList', 'getSketch', 'createSketch', 'updateSketchMeta', 'deleteSketch', 'addStroke', 'undoLastStroke', 'clearSketch', 'linkSketchToEntity', 'unlinkSketchFromEntity', 'getSketchesForEntity', 'SNIPPET_CATEGORIES', 'getSnippetList', 'createSnippet', 'updateSnippetCategory', 'deleteSnippet', 'getStyleGuideRules', 'addStyleGuideRule', 'updateStyleGuideRule', 'deleteStyleGuideRule', 'scanTextForStyleViolations', 'getStyleGuideReport', 'SCENE_RELATIONSHIP_TYPES', 'getSceneRelationshipTypeLabel', 'getSceneRelationshipList', 'getSceneRelationshipsForScene', 'createSceneRelationship', 'updateSceneRelationship', 'deleteSceneRelationship', 'getStoryQuestionList', 'getStoryQuestion', 'createStoryQuestion', 'updateStoryQuestion', 'deleteStoryQuestion', 'getStoryQuestionsForScene', 'setStoryQuestionScene', 'ANNOTATION_TYPES', 'getAnnotationTypeLabel', 'getAnnotationList', 'getAnnotationsForChapter', 'getAnnotationsForScene', 'createAnnotation', 'getAnnotation', 'updateAnnotation', 'deleteAnnotation', 'getBookmarkList', 'getBookmarkForChapter', 'createBookmark', 'renameBookmark', 'deleteBookmark', 'getQuoteList', 'createQuote', 'deleteQuote', 'getDecisionList', 'getDecision', 'createDecision', 'updateDecision', 'deleteDecision'] },
  { name: 'store-generators.js', requiredExports: ['generateEntityNames', 'extractSeedWordsFromEntity', 'getLanguageEntities', 'draftWorldbuildingEntity', 'commitWorldbuildingDraft', 'generateStarterSystem'] },
  { name: 'store-reports.js', requiredExports: ['getContinuityReport', 'getProjectHealthReport', 'getLastActiveChapter', 'getResumeSummary', 'getCompletionChecklist', 'getPovDistribution', 'getChapterWordCounts', 'getDialogueRatio', 'getChangesSince'] },
  // Store domain code — load last so any circular deps are visible
  { name: 'store.js', requiredExports: ['getResumeSummary', 'markProjectOpened', 'recordChapterOpened', 'getActiveDb', 'migrate', 'onSaveSuccess', 'getProjectHealthReport', 'getAnnotationList', 'getStoryQuestionList', 'getDecisionList'] },
];

let loadedCount = 0;
for (const { name, requiredExports } of modules) {
  try {
    const mod = await import(`./${name}`);
    loadedCount++;
    // Verify required exports exist
    for (const exp of requiredExports) {
      assert(exp in mod, `${name}: exports "${exp}"`);
      assert(typeof mod[exp] !== 'undefined', `${name}: "${exp}" is defined (not undefined)`);
    }
    // Special: NAV_GROUPS should have 'resume' in the Tools group
    if (name === 'nav.js') {
      const toolsGroup = mod.NAV_GROUPS.find((g) => g.key === 'tools');
      assert(!!toolsGroup, 'nav.js: Tools group exists');
      assert(toolsGroup && toolsGroup.views.some((v) => v.id === 'resume'), "nav.js: Tools group includes 'resume' view");
    }
    console.log(`  ${name}: OK${requiredExports.length ? ` (${requiredExports.length} exports verified)` : ''}`);
  } catch (err) {
    fail++;
    failures.push(`${name}: ${err.message}`);
    console.error(`  ✗ ${name}: FAILED — ${err.message.split('\n')[0]}`);
  }
}

console.log(`\n${loadedCount}/${modules.length} modules loaded, ${pass} exports verified, ${fail} failed${fail ? '' : ' — all green'}.`);
if (fail > 0) {
  console.error('\nFailures:');
  failures.forEach((m) => console.error(`  ✗ ${m}`));
  process.exit(1);
}
