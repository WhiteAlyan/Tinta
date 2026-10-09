// Historical context: see docs/CODEBASE_NOTES.md#jsstore-js-1-85

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-js-87-100

import * as Format from './format.js';
import * as RuleSystem from './ruleSystem.js';
import * as Generator from './generator.js';
// 0.2.8 Pass A — wordCount's body moved down into format.js (see it there);
// imported under its bare name so this module's 10 internal callers are
// untouched, and re-exported right below so the store contract is unchanged.
import { wordCount } from './format.js';

// 0.2.8 Pass 1 — vault machinery bindings (bare names for the domain code below).
import {
  AUTHORITY_SOURCES,
  AUTO_CHECKPOINT_INTERVAL_MS,
  CANON_STATUSES,
  MAX_RECENT_ACTIVITY,
  backupBeforeDelete,
  capAutoSnapshots,
  capManualSnapshots,
  cloneWithoutSnapshots,
  escapeRegExp,
  getActiveProject,
  getChapter,
  getSeries,
  getSeriesForActiveProject,
  load,
  makeProject,
  makeSeries,
  now,
  recordMutation,
  replaceDb,
  save,
  slugType,
  uid,
} from './store-core.js';

// Public Store contract — moved names re-exported, byte-identical surface.
export {
  getActiveProject,
  load,
  save,
} from './store-core.js';
// Pure re-exports (not referenced by domain code internally).
export {
  STORAGE_KEY,
  _forceSaveRetryNow,
  _simulateStorageEvent,
  getRecoverySnapshot,
  clearRecoverySnapshot,
  canRedo,
  canUndo,
  clearUndoHistory,
  consumeLoadWarning,
  estimateDbSizeBytes,
  getActiveDb,
  getChapter,
  getRedoLabel,
  getSaveRetryState,
  getSeries,
  getSeriesForActiveProject,
  getUndoLabel,
  isCrossTabStale,
  migrate,
  onCrossTabConflict,
  onSaveError,
  onSaveSuccess,
  onStorageHeadroom,
  redo,
  undo,
} from './store-core.js';

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-js-169-172
export {
  addThesaurusEntry,
  deleteThesaurusEntry,
  getAmbienceSettings,
  getAutosaveDelayMs,
  getBackgroundSettings,
  getCustomFont,
  getCustomThesaurus,
  getGrammarSettings,
  getManuscriptFont,
  getMotionSettings,
  getNavStyle,
  getTheme,
  getTtsSettings,
  getTypewriterSettings,
  setAmbienceSettings,
  setAutosaveDelayMs,
  setBackgroundSettings,
  setCustomFont,
  setGrammarSettings,
  setManuscriptFont,
  setMotionSettings,
  setNavStyle,
  setTheme,
  setTtsSettings,
  setTypewriterSettings,
  // v0.2.9 — app-level fields for the welcome screen, onboarding,
  // burger sidebar, and the typewriter-mode gate.
  getWriterName,
  setWriterName,
  getWorkspaceDensity,
  setWorkspaceDensity,
  getSidebarCollapsed,
  setSidebarCollapsed,
  getTypewriterEnabled,
  setTypewriterEnabled,
  getOnboardingComplete,
  setOnboardingComplete,
} from './store-settings.js';

// Pure re-exports (no remaining internal callers in this module) — 0.2.8
// Pass 3 moved the backup domain (exportManifest + full-backup
// export/import) into store-backup.js; the public contract is unchanged.
export {
  exportFullBackup,
  exportManifest,
  importFullBackup,
} from './store-backup.js';

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-js-210-214
export {
  addActiveProjectToSeries,
  createProject,
  createSeries,
  deleteProject,
  deleteSeries,
  getDistinctProjectValues,
  listProjects,
  listSeries,
  markProjectOpened,
  removeActiveProjectFromSeries,
  renameSeries,
  setCoverImage,
  switchProject,
  updateProjectMeta,
} from './store-projects.js';

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-js-232-237
import {
  createEntity,
  extractMentions,
  getBacklinksFor,
  getEntity,
  getEntityChildren,
  getEntityList,
  getEntityStatusEvents,
  getEntityType,
  getEntityTypes,
  setEntityPosition,
  flushPendingPositionSave,
  updateEntity,
} from './store-entities.js';
export {
  createEntity,
  extractMentions,
  flushPendingPositionSave,
  getBacklinksFor,
  getEntity,
  getEntityChildren,
  getEntityList,
  getEntityStatusEvents,
  getEntityType,
  getEntityTypes,
  setEntityPosition,
  updateEntity,
};
// Pure re-exports (no remaining internal callers in this module).
export {
  MENTION_RE,
  addEntityImage,
  addEntityStatusEvent,
  createEntitySnapshot,
  createEntityType,
  createSeriesEntity,
  deleteEntitySnapshot,
  deleteEntityStatusEvent,
  deleteEntityType,
  deleteSeriesEntity,
  demoteEntityToProject,
  findEntityByName,
  getAuthoritySources,
  getCanonStatuses,
  getDistinctEntityTags,
  getEntityPortraitId,
  getEntitySnapshot,
  getEntitySnapshotChanges,
  getEntitySnapshots,
  getSeriesEntityList,
  isSeriesEntity,
  promoteEntityToSeries,
  removeEntityImage,
  restoreEntitySnapshot,
  setEntityPrimaryImage,
  updateEntityStatusEvent,
  updateEntityType,
  wouldCreateCycle,
  // v0.2.9 — passive entity recognition (project-level).
  getMentionStopwords,
  addMentionStopword,
  removeMentionStopword,
  getPassiveRecognition,
  setPassiveRecognition,
} from './store-entities.js';

// 0.2.8 Pass 7 — deleteRelationship (the deleteEntity cascade) and
// getRelationshipsForEntity (craft promotions) keep staying callers;
// facade->domain is the sanctioned direction. The other 14 are pure.
import { deleteRelationship, getRelationshipsForEntity } from './store-relationships.js';
export { deleteRelationship, getRelationshipsForEntity };
// Pure re-exports (no remaining internal callers in this module).
export {
  addRelationshipHistoryEntry,
  createRelationship,
  deleteRelationshipHistoryEntry,
  detachRelationshipToLabel,
  getRelationship,
  getRelationshipHistory,
  getRelationshipLabel,
  getRelationshipList,
  getRelationshipType,
  getRelationshipTypeList,
  getRelationshipTypeUsageCount,
  renameRelationshipType,
  updateRelationship,
  updateRelationshipHistoryEntry,
} from './store-relationships.js';

// 0.2.8 Pass 8 — createTimelineEvent (snippet promotion) and
// getReferenceList (health-report dedupe) keep staying callers;
// facade->domain is the sanctioned direction. The other 53 are pure.
import { createTimelineEvent, getReferenceList } from './store-world.js';
export { createTimelineEvent, getReferenceList };
// Pure re-exports (no remaining internal callers in this module).
export {
  absoluteDayToCalendarDate,
  addMarker,
  addToCustomDictionary,
  applyPronunciations,
  calendarDateToAbsoluteDay,
  compareCalendarDates,
  createImageMeta,
  createMap,
  createReference,
  daysBetweenCalendarDates,
  deleteImageMeta,
  deleteMap,
  deleteMarker,
  deletePronunciation,
  deleteReference,
  deleteTimelineEvent,
  disableCalendar,
  enableCalendar,
  findCalendarOrderMismatches,
  findImageUsage,
  formatCalendarDate,
  formatTimelineEventDate,
  getCustomDictionary,
  getDistinctReferenceTags,
  getImage,
  getMap,
  getMapList,
  getMapTypes,
  getMarker,
  getProjectCalendar,
  getProjectImageIds,
  getPronunciationList,
  getReference,
  getReferenceTypes,
  getReferencesForChapter,
  getReferencesForEntity,
  getReferencesForScene,
  getTimelineEvent,
  getTimelineEventList,
  getWeekdayIndex,
  getWeekdayName,
  isCalendarActive,
  isDictionaryIgnored,
  isImageUsedByOtherProjects,
  isValidCalendarDate,
  listImages,
  offsetCalendarDate,
  removeFromCustomDictionary,
  reorderTimelineEvent,
  setPronunciation,
  updateImageMeta,
  updateMap,
  updateMarker,
  updateReference,
  updateTimelineEvent,
} from './store-world.js';

// 0.2.8 Pass 9 — six names keep staying callers (generator bridge,
// canon dispatchers, restoreDeletedItem, health report); facade->domain
// is the sanctioned direction. The other 5 are pure re-exports.
import {
  createRuleSystem,
  createSystemNode,
  getRuleSystem,
  getRuleSystemList,
  getSystemNodeList,
  updateRuleSystem,
} from './store-systems.js';
export {
  createRuleSystem,
  createSystemNode,
  getRuleSystem,
  getRuleSystemList,
  getSystemNodeList,
  updateRuleSystem,
};
// Pure re-exports (no remaining internal callers in this module).
export {
  deleteRuleSystem,
  deleteSystemNode,
  getDependentNodes,
  getSystemNode,
  updateSystemNode,
} from './store-systems.js';

// 0.2.8 Pass 10 — seven names keep staying callers (the five snippet
// promotions above + the reports region); facade->domain is the
// sanctioned direction. The other 51 are pure re-exports.
import {
  createAnnotation,
  createDecision,
  deleteSnippet,
  getAnnotationList,
  getDecisionList,
  getStoryQuestionList,
  getStyleGuideReport,
} from './store-craft.js';
export {
  createAnnotation,
  createDecision,
  deleteSnippet,
  getAnnotationList,
  getDecisionList,
  getStoryQuestionList,
  getStyleGuideReport,
};
// Pure re-exports (no remaining internal callers in this module).
export {
  ANNOTATION_TYPES,
  SCENE_RELATIONSHIP_TYPES,
  SNIPPET_CATEGORIES,
  addStroke,
  addStyleGuideRule,
  clearSketch,
  createBookmark,
  createQuote,
  createSceneRelationship,
  createSketch,
  createSnippet,
  createStoryQuestion,
  deleteAnnotation,
  deleteBookmark,
  deleteDecision,
  deleteQuote,
  deleteSceneRelationship,
  deleteSketch,
  deleteStoryQuestion,
  deleteStyleGuideRule,
  getAnnotation,
  getAnnotationTypeLabel,
  getAnnotationsForChapter,
  getAnnotationsForScene,
  getBookmarkForChapter,
  getBookmarkList,
  getDecision,
  getQuoteList,
  getSceneRelationshipList,
  getSceneRelationshipTypeLabel,
  getSceneRelationshipsForScene,
  getSketch,
  getSketchList,
  getSketchesForEntity,
  getSnippetList,
  getStoryQuestion,
  getStoryQuestionsForScene,
  getStyleGuideRules,
  linkSketchToEntity,
  renameBookmark,
  scanTextForStyleViolations,
  setStoryQuestionScene,
  undoLastStroke,
  unlinkSketchFromEntity,
  updateAnnotation,
  updateDecision,
  updateSceneRelationship,
  updateSketchMeta,
  updateSnippetCategory,
  updateStoryQuestion,
  updateStyleGuideRule,
} from './store-craft.js';

// 0.2.8 Pass 11 — the generator bridge moved to store-generators.js
// (terminal domain; zero staying callers — all six are UI-consumed).
export {
  commitWorldbuildingDraft,
  draftWorldbuildingEntity,
  extractSeedWordsFromEntity,
  generateEntityNames,
  generateStarterSystem,
  getLanguageEntities,
} from './store-generators.js';

// 0.2.8 Pass 12 — the read-only reports domain moved to
// store-reports.js (terminal; zero staying callers).
export {
  getChangesSince,
  getChapterWordCounts,
  getCompletionChecklist,
  getContinuityReport,
  getDialogueRatio,
  getLastActiveChapter,
  getPovDistribution,
  getProjectHealthReport,
  getResumeSummary,
} from './store-reports.js';

// 0.2.8 Pass 5 — getChapter/createScene keep one internal caller each
// (createBookmark / promoteSnippetToScene below); facade->domain is the
// sanctioned direction. The other 80 names have no remaining callers.
import { createScene } from './store-manuscript.js';
export { createScene };
// Pure re-exports (no remaining internal callers in this module).
export {
  SCENE_INTENSITY_LEVELS,
  SCENE_REVISION_STATUSES,
  addChapterToCollection,
  addChapterWriteTime,
  archiveChapter,
  assignChapterToFolder,
  assignChapterToPart,
  checkGoalCelebration,
  createChapter,
  createChapterFromTemplate,
  createChapterType,
  createCollection,
  createDocumentTemplate,
  createFolder,
  createPart,
  createSavedSearch,
  createSceneFromTemplate,
  createSnapshot,
  deleteChapter,
  deleteChapterType,
  deleteCollection,
  deleteDocumentTemplate,
  deleteFolder,
  deletePart,
  deleteSavedSearch,
  deleteScene,
  deleteSnapshot,
  exportChapterText,
  exportProjectText,
  getAllScenesFlat,
  getArchivedChapters,
  getChapterType,
  getChapterTypeForChapter,
  getChapterTypes,
  getChaptersInCollection,
  getChaptersInFolder,
  getChaptersInPart,
  getCollections,
  getContentChapterNumber,
  getCurrentStreak,
  getDailyWordCounts,
  getDocumentTemplate,
  getDocumentTemplates,
  getFavoriteChapters,
  getFolders,
  getParts,
  getRecentActivity,
  getRecentChapters,
  getSavedSearches,
  getSnapshot,
  getSnapshots,
  getTotalWordCount,
  getTrashedChapters,
  groupChaptersByPart,
  importChapterFromText,
  moveScene,
  permanentlyDeleteChapter,
  recordChapterOpened,
  removeChapterFromCollection,
  renameCollection,
  renameFolder,
  renamePart,
  reorderChapter,
  reorderPart,
  replaceInChapters,
  restoreChapter,
  restoreSnapshot,
  searchProject,
  toggleChapterFavorite,
  toggleChapterPin,
  trashChapter,
  unarchiveChapter,
  updateChapterArc,
  updateChapterContent,
  updateChapterMeta,
  updateChapterPosition,
  updateChapterReadPosition,
  updateChapterType,
  updateDocumentTemplate,
  updateScene,
} from './store-manuscript.js';


// Historical context: see docs/CODEBASE_NOTES.md#jsstore-js-602-611
export function markGenerationEdited(kind, id) {
  const record = kind === 'ruleSystem' ? getRuleSystem(id) : getEntity(id);
  if (!record || !record.generation || record.generation.edited) return;
  const patch = { generation: { ...record.generation, edited: true } };
  if (kind === 'ruleSystem') updateRuleSystem(id, patch);
  else updateEntity(id, patch);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-js-620-625
export { wordCount };

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-js-628-635
export function setCanonStatus(kind, id, status) {
  if (!CANON_STATUSES.includes(status)) return;
  if (kind === 'ruleSystem') updateRuleSystem(id, { canonStatus: status });
  else updateEntity(id, { canonStatus: status });
}

export function setAuthoritySource(kind, id, source) {
  if (!AUTHORITY_SOURCES.includes(source)) return;
  if (kind === 'ruleSystem') updateRuleSystem(id, { authoritySource: source });
  else updateEntity(id, { authoritySource: source });
}

export function deleteEntity(entityId) {
  const project = getActiveProject();
  const entity = project.entities[entityId];
  if (entity) backupBeforeDelete('entity', entityId, entity, entity.name);
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-js-652-658
  Object.values(project.entities).forEach((e) => {
    if (e.parentId === entityId) e.parentId = null;
  });
  // Series pass — nesting can now cross the project/series boundary (see
  // getEntityChildren), so a series entity nested under this project entity
  // needs the same orphan-not-dangle sweep.
  const series = getSeriesForActiveProject();
  if (series) {
    Object.values(series.entities).forEach((e) => {
      if (e.parentId === entityId) e.parentId = null;
    });
  }
  delete project.entities[entityId];
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-js-672-677
  Object.keys(project.relationships).forEach((relId) => {
    const rel = project.relationships[relId];
    if (rel.fromId === entityId || rel.toId === entityId) deleteRelationship(relId);
  });
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-js-682-686
  Object.values(project.maps || {}).forEach((map) => {
    map.markers.forEach((marker) => {
      if (marker.entityId === entityId) marker.entityId = null;
    });
  });
  // Craft-tools pass — same orphan-not-dangle sweep for sketch links.
  Object.values(project.sketches || {}).forEach((sketch) => {
    if (Array.isArray(sketch.linkedEntityIds) && sketch.linkedEntityIds.includes(entityId)) {
      sketch.linkedEntityIds = sketch.linkedEntityIds.filter((id) => id !== entityId);
    }
  });
  // Tier 4 pass (§14) — same for research references.
  Object.values(project.references || {}).forEach((ref) => {
    if (ref.entityId === entityId) ref.entityId = null;
  });
  save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-js-705-709
export function getDeletedItemBackups() {
  const project = getActiveProject();
  return [...(project.deletedItemBackups || [])].sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-js-715-721
export function restoreDeletedItem(backupId) {
  const project = getActiveProject();
  const idx = (project.deletedItemBackups || []).findIndex((b) => b.id === backupId);
  if (idx === -1) return null;
  const backup = project.deletedItemBackups[idx];
  project.deletedItemBackups.splice(idx, 1);
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-js-728-737
  if (backup.kind === 'entity') {
    const entity = createEntity({ name: backup.data.name, type: backup.data.type, description: backup.data.description });
    updateEntity(entity.id, { ...backup.data, id: entity.id, createdAt: entity.createdAt, updatedAt: now() });
    return { kind: 'entity', id: entity.id };
  }
  if (backup.kind === 'ruleSystem') {
    const system = createRuleSystem({ name: backup.data.name, source: backup.data.source, resource: backup.data.resource, channel: backup.data.channel, restrictions: backup.data.restrictions, description: backup.data.description });
    updateRuleSystem(system.id, { ...backup.data, id: system.id, createdAt: system.createdAt, updatedAt: now() });
    return { kind: 'ruleSystem', id: system.id };
  }
  // Unknown kind — restore the splice so we don't silently lose the
  // entry, and persist so the next reload sees the same state.
  project.deletedItemBackups.splice(idx, 0, backup);
  save();
  return null;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-js-755-762

export function promoteSnippetToEntity(snippetId, type = 'character') {
  const project = getActiveProject();
  const snippet = project.snippets[snippetId];
  if (!snippet) return null;
  const firstLine = snippet.text.split('\n')[0].slice(0, 60).trim();
  const entity = createEntity({ name: firstLine || 'Untitled', type, description: snippet.text });
  deleteSnippet(snippetId);
  return entity;
}

export function promoteSnippetToScene(snippetId, chapterId) {
  const project = getActiveProject();
  const snippet = project.snippets[snippetId];
  if (!snippet) return null;
  const firstLine = snippet.text.split('\n')[0].slice(0, 60).trim();
  const scene = createScene(chapterId, { title: firstLine || 'Untitled Scene', notes: snippet.text });
  if (scene) deleteSnippet(snippetId);
  return scene;
}

export function promoteSnippetToTimelineEvent(snippetId) {
  const project = getActiveProject();
  const snippet = project.snippets[snippetId];
  if (!snippet) return null;
  const firstLine = snippet.text.split('\n')[0].slice(0, 60).trim();
  const event = createTimelineEvent({ title: firstLine || 'Untitled Event', description: snippet.text });
  deleteSnippet(snippetId);
  return event;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-js-794-801
export function promoteSnippetToDecision(snippetId) {
  const project = getActiveProject();
  const snippet = project.snippets[snippetId];
  if (!snippet) return null;
  const firstLine = snippet.text.split('\n')[0].slice(0, 80).trim();
  const rest = snippet.text.split('\n').slice(1).join('\n').trim();
  const decision = createDecision({ decision: firstLine || snippet.text, reason: rest });
  if (decision) deleteSnippet(snippetId);
  return decision;
}

// Requires a target chapter, same reason promoteSnippetToScene does —
// an annotation is chapter-anchored (createAnnotation itself refuses
// without one), there's no "unfiled annotation" concept to fall back to.
export function promoteSnippetToAnnotation(snippetId, chapterId, type = 'todo') {
  const project = getActiveProject();
  const snippet = project.snippets[snippetId];
  if (!snippet) return null;
  if (!chapterId) return null;
  const annotation = createAnnotation({ chapterId, type, note: snippet.text });
  if (annotation) deleteSnippet(snippetId);
  return annotation;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-js-826-832

export function getGraphPresetList() {
  const project = getActiveProject();
  return Object.values(project.graphPresets || {}).sort((a, b) => a.name.localeCompare(b.name));
}

export function getGraphPreset(id) {
  const project = getActiveProject();
  return project.graphPresets[id] || null;
}

export function createGraphPreset({ name, hiddenTypes = [], statusFilter = '' } = {}) {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;
  const project = getActiveProject();
  const positions = {};
  getEntityList().forEach((e) => {
    if (e.canvasX != null && e.canvasY != null) positions[e.id] = { x: e.canvasX, y: e.canvasY };
  });
  const preset = {
    id: uid('gp'),
    name: trimmed,
    hiddenTypes: [...hiddenTypes],
    statusFilter,
    positions,
    createdAt: now(),
  };
  project.graphPresets[preset.id] = preset;
  save();
  return preset;
}

// Overwrites an existing preset's filters + positions with the graph's
// current state, keeping its id/name — "update this saved view" rather
// than making the writer delete and re-save under the same name.
export function updateGraphPreset(id, { hiddenTypes, statusFilter } = {}) {
  const project = getActiveProject();
  const preset = project.graphPresets[id];
  if (!preset) return;
  const positions = {};
  getEntityList().forEach((e) => {
    if (e.canvasX != null && e.canvasY != null) positions[e.id] = { x: e.canvasX, y: e.canvasY };
  });
  preset.positions = positions;
  if (hiddenTypes) preset.hiddenTypes = [...hiddenTypes];
  if (statusFilter !== undefined) preset.statusFilter = statusFilter;
  save();
}

export function deleteGraphPreset(id) {
  const project = getActiveProject();
  delete project.graphPresets[id];
  save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-js-888-893
export function applyGraphPreset(id) {
  const preset = getGraphPreset(id);
  if (!preset) return null;
  Object.entries(preset.positions).forEach(([entityId, pos]) => {
    if (getEntity(entityId)) setEntityPosition(entityId, pos.x, pos.y);
  });
  return { hiddenTypes: [...preset.hiddenTypes], statusFilter: preset.statusFilter };
}
