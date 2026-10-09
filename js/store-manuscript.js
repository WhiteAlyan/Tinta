// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-1-25

import {
  AUTO_CHECKPOINT_INTERVAL_MS,
  MAX_RECENT_ACTIVITY,
  capAutoSnapshots,
  capManualSnapshots,
  cloneWithoutSnapshots,
  getActiveProject,
  getChapter,
  load,
  now,
  recordMutation,
  save,
  slugType,
  uid,
} from './store-core.js';
import { wordCount } from './format.js';
import * as Search from './search.js';


export function createChapter(title = 'Untitled Chapter') {
  const project = getActiveProject();
  const chapter = {
    id: uid('chap'),
    title,
    order: project.chapters.length,
    status: 'draft',
    povCharacter: '',
    arc: '',
    targetWordCount: 0,
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-56-60
    writeTimeMs: 0,
    content: '',
    updatedAt: now(),
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-64-67
    lastOpenedAt: '',
    scenes: [],
    snapshots: [],
    lastCursorPos: 0,
    lastScrollTop: 0,
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-73-76
    docType: 'chapter',
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-78-85
    folderId: null,
    // Containers foundation pass — same single-parent shape as folderId,
    // on the separate "manuscript sequence" axis. null means "not in any
    // part," same as every chapter before this pass existed.
    partId: null,
    favorite: false,
    pinned: false,
    archived: false,
    trashedAt: null,
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-95-102
    lastReadSpread: 0,
    lastAutoCheckpointAt: now(),
  };
  project.chapters.push(chapter);
  project.updatedAt = now();
  recordMutation({
    type: 'create', targetType: 'chapter', targetId: chapter.id, projectId: project.id,
    before: null, after: cloneWithoutSnapshots(chapter),
    label: `Created "${chapter.title}"`, timestamp: Date.now(),
  });
  save();
  return chapter;
}

// ── writing-activity tracking (Session 10) ────────────────────────────────

function todayKey() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-125-134
export function getTotalWordCount(project = getActiveProject()) {
  return project.chapters.filter((ch) => !ch.trashedAt).reduce((sum, ch) => sum + wordCount(ch.content), 0);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-139-146
function recordWordDelta(project, prevTotal) {
  const delta = getTotalWordCount(project) - prevTotal;
  if (delta > 0) {
    const day = todayKey();
    project.dailyWordCounts[day] = (project.dailyWordCounts[day] || 0) + delta;
  }
}

export function getDailyWordCounts() {
  return getActiveProject().dailyWordCounts || {};
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-159-162
export function getCurrentStreak() {
  const counts = getDailyWordCounts();
  const d = new Date();
  let streak = 0;
  for (;;) {
    const pad = (n) => String(n).padStart(2, '0');
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (!counts[key]) break;
    streak += 1;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-177-186
export function checkGoalCelebration(project) {
  if (!project.wordGoal || project.wordGoal <= 0) return false;
  const today = todayKey();
  if (project.lastGoalCelebrationDate === today) return false;
  if (getTotalWordCount(project) < project.wordGoal) return false;
  project.lastGoalCelebrationDate = today;
  save();
  return true;
}
// Returns TRUE only when the write actually landed in storage, FALSE when
// it did not (chapter missing, cross-tab staleness, quota, localStorage
// unreachable). This return value is load-bearing: the editor used to call
// this, assume success, advance its lastSavedValue watermark and paint
// "Saved" — so a failed persist showed the writer a green light AND made
// the editor believe there was nothing left to flush. save() has always
// returned a boolean; it was simply being swallowed here.
export function updateChapterContent(chapterId, content) {
  const chapter = getChapter(chapterId);
  if (!chapter) return false;
  const project = getActiveProject();
  const prevTotal = getTotalWordCount(project);
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-201-204
  const before = cloneWithoutSnapshots(chapter);
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-206-211
  const msSinceCheckpoint = Date.now() - new Date(chapter.lastAutoCheckpointAt || 0).getTime();
  if (chapter.content && msSinceCheckpoint >= AUTO_CHECKPOINT_INTERVAL_MS) {
    createSnapshot(chapterId, 'Auto-checkpoint', true);
    chapter.lastAutoCheckpointAt = now();
  }
  chapter.content = content;
  chapter.updatedAt = now();
  project.updatedAt = now();
  recordWordDelta(project, prevTotal);
  recordRecentActivity(project.id, chapterId);
  recordMutation({
    type: 'update', targetType: 'chapter', targetId: chapterId, projectId: project.id,
    before, after: cloneWithoutSnapshots(chapter),
    label: `Edited "${chapter.title}"`, timestamp: Date.now(),
  });
  return save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-230-235
// Same truthful-return contract as updateChapterContent above — cursor and
// scroll position are far less precious than prose, but a caller that wants
// to know whether the write landed shouldn't have to guess.
export function updateChapterPosition(chapterId, { cursorPos, scrollTop } = {}) {
  const chapter = getChapter(chapterId);
  if (!chapter) return false;
  if (typeof cursorPos === 'number') chapter.lastCursorPos = cursorPos;
  if (typeof scrollTop === 'number') chapter.lastScrollTop = scrollTop;
  return save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-244-248
export function updateChapterReadPosition(chapterId, spreadIndex) {
  const chapter = getChapter(chapterId);
  if (!chapter || typeof spreadIndex !== 'number') return;
  chapter.lastReadSpread = spreadIndex;
  save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-256-260
export function getRecentActivity() {
  const db = load();
  return (db.recentActivity || [])
    .map((entry) => {
      const project = db.projects[entry.projectId];
      const chapter = project?.chapters.find((c) => c.id === entry.chapterId);
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-267-274
      if (!project || !chapter || chapter.trashedAt) return null;
      return {
        projectId: entry.projectId,
        projectTitle: project.title,
        chapterId: entry.chapterId,
        chapterTitle: chapter.title,
        timestamp: entry.timestamp,
      };
    })
    .filter(Boolean);
}

function recordRecentActivity(projectId, chapterId) {
  const db = load();
  const list = (db.recentActivity || []).filter((e) => e.chapterId !== chapterId);
  list.unshift({ projectId, chapterId, timestamp: now() });
  db.recentActivity = list.slice(0, MAX_RECENT_ACTIVITY);
}

export function updateChapterMeta(chapterId, patch) {
  const chapter = getChapter(chapterId);
  if (!chapter) return false;
  const project = getActiveProject();
  const before = cloneWithoutSnapshots(chapter);
  Object.assign(chapter, patch, { updatedAt: now() });
  recordMutation({
    type: 'update', targetType: 'chapter', targetId: chapterId, projectId: project.id,
    before, after: cloneWithoutSnapshots(chapter),
    label: `Edited "${chapter.title}"`, timestamp: Date.now(),
  });
  // P1-2 fix — return save()'s boolean so callers can detect a failed
  // write (quota exceeded or cross-tab-stale). Same contract
  // updateChapterContent (line 127) already pins, and that
  // save-truthfulness.smoketest.mjs already asserts for content updates.
  // Without this, the sidebar rename / status / POV change assumes success
  // and the next reload silently reverts if save failed.
  return save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-308-316
export function addChapterWriteTime(chapterId, deltaMs) {
  const chapter = getChapter(chapterId);
  if (!chapter || !deltaMs || deltaMs <= 0) return;
  chapter.writeTimeMs = (chapter.writeTimeMs || 0) + Math.round(deltaMs);
  save();
}

export function deleteChapter(chapterId) {
  const project = getActiveProject();
  const deletedSceneIds = new Set(
    (project.chapters.find((c) => c.id === chapterId)?.scenes || []).map((s) => s.id)
  );
  project.chapters = project.chapters.filter((c) => c.id !== chapterId);
  project.chapters.forEach((c, i) => (c.order = i));
  // Tier 4 pass (§14) — a reference linked to this chapter or one of its
  // now-gone scenes would otherwise dangle. Same orphan-not-dangle
  // treatment as everywhere else: clear the link, keep the reference.
  Object.values(project.references || {}).forEach((ref) => {
    if (ref.chapterId === chapterId) ref.chapterId = null;
    if (ref.sceneId && deletedSceneIds.has(ref.sceneId)) ref.sceneId = null;
  });
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-338-344
  Object.keys(project.sceneRelationships || {}).forEach((id) => {
    const rel = project.sceneRelationships[id];
    if (deletedSceneIds.has(rel.fromSceneId) || deletedSceneIds.has(rel.toSceneId)) {
      delete project.sceneRelationships[id];
    }
  });
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-351-354
  Object.keys(project.annotations || {}).forEach((id) => {
    if (project.annotations[id].chapterId === chapterId) delete project.annotations[id];
  });
  Object.keys(project.bookmarks || {}).forEach((id) => {
    if (project.bookmarks[id].chapterId === chapterId) delete project.bookmarks[id];
  });
  // v0.2 pass — quotes require a chapterId the same way annotations/
  // bookmarks do (createQuote refuses without one), so the same "delete
  // outright, no meaningful orphaned state" cascade applies here too.
  Object.keys(project.quotes || {}).forEach((id) => {
    if (project.quotes[id].chapterId === chapterId) delete project.quotes[id];
  });
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-367-370
  project.recentChapterIds = (project.recentChapterIds || []).filter((id) => id !== chapterId);
  (project.collections || []).forEach((c) => {
    c.chapterIds = (c.chapterIds || []).filter((id) => id !== chapterId);
  });
  save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-378-390
export function trashChapter(chapterId) {
  const chapter = getChapter(chapterId);
  if (!chapter) return false;
  const project = getActiveProject();
  const before = cloneWithoutSnapshots(chapter);
  chapter.trashedAt = now();
  recordMutation({
    type: 'update', targetType: 'chapter', targetId: chapterId, projectId: project.id,
    before, after: cloneWithoutSnapshots(chapter),
    label: `Trashed "${chapter.title}"`, timestamp: Date.now(),
  });
  save();
  return true;
}

export function restoreChapter(chapterId) {
  const chapter = getChapter(chapterId);
  if (!chapter) return false;
  const project = getActiveProject();
  const before = cloneWithoutSnapshots(chapter);
  chapter.trashedAt = null;
  recordMutation({
    type: 'update', targetType: 'chapter', targetId: chapterId, projectId: project.id,
    before, after: cloneWithoutSnapshots(chapter),
    label: `Restored "${chapter.title}"`, timestamp: Date.now(),
  });
  save();
  return true;
}

export function getTrashedChapters() {
  const project = getActiveProject();
  return project.chapters.filter((c) => c.trashedAt).sort((a, b) => new Date(b.trashedAt) - new Date(a.trashedAt));
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-426-430
export function permanentlyDeleteChapter(chapterId) {
  deleteChapter(chapterId);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-435-441
export function archiveChapter(chapterId) {
  const chapter = getChapter(chapterId);
  if (!chapter) return false;
  chapter.archived = true;
  save();
  return true;
}

export function unarchiveChapter(chapterId) {
  const chapter = getChapter(chapterId);
  if (!chapter) return false;
  chapter.archived = false;
  save();
  return true;
}

export function getArchivedChapters() {
  const project = getActiveProject();
  return project.chapters.filter((c) => c.archived && !c.trashedAt).sort((a, b) => a.order - b.order);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-463-468
export function toggleChapterFavorite(chapterId) {
  const chapter = getChapter(chapterId);
  if (!chapter) return false;
  chapter.favorite = !chapter.favorite;
  save();
  return chapter.favorite;
}

export function getFavoriteChapters() {
  const project = getActiveProject();
  return project.chapters.filter((c) => c.favorite && !c.trashedAt).sort((a, b) => a.order - b.order);
}

export function toggleChapterPin(chapterId) {
  const chapter = getChapter(chapterId);
  if (!chapter) return false;
  chapter.pinned = !chapter.pinned;
  save();
  return chapter.pinned;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-490-494
const RECENTS_CAP = 10;
export function recordChapterOpened(chapterId) {
  const project = getActiveProject();
  const withoutThis = (project.recentChapterIds || []).filter((id) => id !== chapterId);
  project.recentChapterIds = [chapterId, ...withoutThis].slice(0, RECENTS_CAP);
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-500-506
  const chapter = project.chapters.find((c) => c.id === chapterId);
  if (chapter) chapter.lastOpenedAt = now();
  save();
}

export function getRecentChapters() {
  const project = getActiveProject();
  return (project.recentChapterIds || [])
    .map((id) => getChapter(id))
    .filter((c) => c && !c.trashedAt);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-519-525
export function getFolders() {
  const project = getActiveProject();
  return [...(project.folders || [])].sort((a, b) => a.name.localeCompare(b.name));
}

export function createFolder(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;
  const project = getActiveProject();
  const folder = { id: uid('fold'), name: trimmed, createdAt: now() };
  project.folders = [...(project.folders || []), folder];
  save();
  return folder;
}

export function renameFolder(folderId, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return false;
  const project = getActiveProject();
  const folder = (project.folders || []).find((f) => f.id === folderId);
  if (!folder) return false;
  folder.name = trimmed;
  save();
  return true;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-552-556
export function deleteFolder(folderId) {
  const project = getActiveProject();
  project.folders = (project.folders || []).filter((f) => f.id !== folderId);
  project.chapters.forEach((c) => {
    if (c.folderId === folderId) c.folderId = null;
  });
  save();
}

export function assignChapterToFolder(chapterId, folderId) {
  const chapter = getChapter(chapterId);
  if (!chapter) return false;
  chapter.folderId = folderId || null;
  save();
  return true;
}

export function getChaptersInFolder(folderId) {
  const project = getActiveProject();
  return project.chapters.filter((c) => c.folderId === folderId && !c.trashedAt).sort((a, b) => a.order - b.order);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-579-590
export function getParts() {
  const project = getActiveProject();
  return [...(project.parts || [])].sort((a, b) => a.order - b.order);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-596-600
export function groupChaptersByPart(chapters) {
  const parts = getParts();
  const groups = parts.map((part) => ({ part, chapters: chapters.filter((c) => c.partId === part.id) }));
  const partIds = new Set(parts.map((p) => p.id));
  const unassigned = chapters.filter((c) => !c.partId || !partIds.has(c.partId));
  groups.push({ part: null, chapters: unassigned });
  return groups;
}


export function createPart(title) {
  const trimmed = (title || '').trim();
  if (!trimmed) return null;
  const project = getActiveProject();
  if (!Array.isArray(project.parts)) project.parts = [];
  const part = { id: uid('part'), title: trimmed, order: project.parts.length, createdAt: now() };
  project.parts.push(part);
  save();
  return part;
}

export function renamePart(partId, title) {
  const trimmed = (title || '').trim();
  if (!trimmed) return false;
  const project = getActiveProject();
  const part = (project.parts || []).find((p) => p.id === partId);
  if (!part) return false;
  part.title = trimmed;
  save();
  return true;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-633-637
export function deletePart(partId) {
  const project = getActiveProject();
  project.parts = (project.parts || []).filter((p) => p.id !== partId);
  project.parts.forEach((p, i) => (p.order = i));
  project.chapters.forEach((c) => {
    if (c.partId === partId) c.partId = null;
  });
  save();
}

export function reorderPart(partId, direction) {
  const project = getActiveProject();
  const parts = (project.parts || []).sort((a, b) => a.order - b.order);
  const idx = parts.findIndex((p) => p.id === partId);
  if (idx === -1) return;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= parts.length) return;
  const tmp = parts[idx].order;
  parts[idx].order = parts[swapIdx].order;
  parts[swapIdx].order = tmp;
  save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-661-665
export function assignChapterToPart(chapterId, partId) {
  const chapter = getChapter(chapterId);
  if (!chapter) return false;
  if (partId && getChapterTypeForChapter(chapter).role !== 'content') return false;
  chapter.partId = partId || null;
  save();
  return true;
}

export function getChaptersInPart(partId) {
  const project = getActiveProject();
  return project.chapters.filter((c) => c.partId === partId && !c.trashedAt).sort((a, b) => a.order - b.order);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-680-693
export function getCollections() {
  const project = getActiveProject();
  return [...(project.collections || [])].sort((a, b) => a.name.localeCompare(b.name));
}

export function createCollection(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;
  const project = getActiveProject();
  const collection = { id: uid('coll'), name: trimmed, chapterIds: [], createdAt: now() };
  project.collections = [...(project.collections || []), collection];
  save();
  return collection;
}

export function renameCollection(collectionId, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return false;
  const project = getActiveProject();
  const collection = (project.collections || []).find((c) => c.id === collectionId);
  if (!collection) return false;
  collection.name = trimmed;
  save();
  return true;
}

export function deleteCollection(collectionId) {
  const project = getActiveProject();
  project.collections = (project.collections || []).filter((c) => c.id !== collectionId);
  save();
}

export function addChapterToCollection(collectionId, chapterId) {
  const project = getActiveProject();
  const collection = (project.collections || []).find((c) => c.id === collectionId);
  if (!collection || !getChapter(chapterId)) return false;
  if (!collection.chapterIds.includes(chapterId)) collection.chapterIds.push(chapterId);
  save();
  return true;
}

export function removeChapterFromCollection(collectionId, chapterId) {
  const project = getActiveProject();
  const collection = (project.collections || []).find((c) => c.id === collectionId);
  if (!collection) return false;
  collection.chapterIds = collection.chapterIds.filter((id) => id !== chapterId);
  save();
  return true;
}

export function getChaptersInCollection(collectionId) {
  const project = getActiveProject();
  const collection = (project.collections || []).find((c) => c.id === collectionId);
  if (!collection) return [];
  return collection.chapterIds.map((id) => getChapter(id)).filter((c) => c && !c.trashedAt);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-751-758
export function getSavedSearches() {
  const project = getActiveProject();
  return [...(project.savedSearches || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function createSavedSearch({ name, query, caseSensitive = false, useRegex = false } = {}) {
  const trimmedName = (name || '').trim();
  const trimmedQuery = (query || '').trim();
  if (!trimmedName || !trimmedQuery) return null;
  const project = getActiveProject();
  const savedSearch = { id: uid('svsrch'), name: trimmedName, query: trimmedQuery, caseSensitive, useRegex, createdAt: now() };
  project.savedSearches = [...(project.savedSearches || []), savedSearch];
  save();
  return savedSearch;
}

export function deleteSavedSearch(savedSearchId) {
  const project = getActiveProject();
  project.savedSearches = (project.savedSearches || []).filter((s) => s.id !== savedSearchId);
  save();
}

export function reorderChapter(chapterId, direction) {
  const project = getActiveProject();
  const chapters = project.chapters.sort((a, b) => a.order - b.order);
  const idx = chapters.findIndex((c) => c.id === chapterId);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= chapters.length) return;
  const tmp = chapters[idx].order;
  chapters[idx].order = chapters[swapIdx].order;
  chapters[swapIdx].order = tmp;
  save();
}

export function createScene(chapterId, scene = {}) {
  const chapter = getChapter(chapterId);
  if (!chapter) return null;
  const newScene = {
    id: uid('scene'),
    title: scene.title || 'Untitled Scene',
    goal: scene.goal || '',
    conflict: scene.conflict || '',
    outcome: scene.outcome || '',
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-802-808
    pov: scene.pov || '',
    location: scene.location || '',
    time: scene.time || '',
    mood: scene.mood || '',
    status: scene.status || 'draft',
    // Craft-tools pass — free-text scratch notes, separate from the
    // goal/conflict/outcome trio (those are structured prompts; this is
    // just a place for anything else, including snippet-promotion text).
    notes: scene.notes || '',
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-818-821
    obstacle: scene.obstacle || '',
    infoRevealed: scene.infoRevealed || '',
    secretsIntroduced: scene.secretsIntroduced || '',
    characterChanges: scene.characterChanges || '',
    themeMotif: scene.themeMotif || '',
    symbolism: scene.symbolism || '',
    intensity: scene.intensity || '',
    revisionStatus: scene.revisionStatus || '',
    narrativePurpose: scene.narrativePurpose || '',
    order: chapter.scenes.length,
    updatedAt: now(),
  };
  chapter.scenes.push(newScene);
  save();
  return newScene;
}

export function updateScene(chapterId, sceneId, patch) {
  const chapter = getChapter(chapterId);
  if (!chapter) return;
  const scene = chapter.scenes.find((s) => s.id === sceneId);
  if (!scene) return;
  Object.assign(scene, patch, { updatedAt: now() });
  save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-848-852
export function moveScene(sceneId, targetChapterId, targetIndex) {
  const project = getActiveProject();
  let sourceChapter = null;
  let scene = null;
  for (const c of project.chapters) {
    const found = c.scenes.find((s) => s.id === sceneId);
    if (found) {
      sourceChapter = c;
      scene = found;
      break;
    }
  }
  if (!scene) return;
  const targetChapter = project.chapters.find((c) => c.id === targetChapterId);
  if (!targetChapter) return;

  sourceChapter.scenes = sourceChapter.scenes.filter((s) => s.id !== sceneId);
  const idx = Math.max(0, Math.min(targetIndex, targetChapter.scenes.length));
  targetChapter.scenes.splice(idx, 0, scene);

  sourceChapter.scenes.forEach((s, i) => (s.order = i));
  if (targetChapter !== sourceChapter) targetChapter.scenes.forEach((s, i) => (s.order = i));
  scene.updatedAt = now();
  save();
}

export function deleteScene(chapterId, sceneId) {
  const chapter = getChapter(chapterId);
  if (!chapter) return;
  chapter.scenes = chapter.scenes.filter((s) => s.id !== sceneId);
  chapter.scenes.forEach((s, i) => (s.order = i));
  const project = getActiveProject();
  Object.values(project.references || {}).forEach((ref) => {
    if (ref.sceneId === sceneId) ref.sceneId = null;
  });
  Object.keys(project.sceneRelationships || {}).forEach((id) => {
    const rel = project.sceneRelationships[id];
    if (rel.fromSceneId === sceneId || rel.toSceneId === sceneId) delete project.sceneRelationships[id];
  });
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-892-895
  Object.values(project.annotations || {}).forEach((a) => { if (a.sceneId === sceneId) a.sceneId = null; });
  Object.values(project.bookmarks || {}).forEach((b) => { if (b.sceneId === sceneId) b.sceneId = null; });
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-898-901
  Object.values(project.quotes || {}).forEach((qt) => { if (qt.sceneId === sceneId) qt.sceneId = null; });
  save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-906-911
export const SCENE_INTENSITY_LEVELS = ['low', 'building', 'high', 'peak'];
export const SCENE_REVISION_STATUSES = ['needs-work', 'drafted', 'revised', 'polished'];

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-915-921
export function getChapterTypes() {
  const project = getActiveProject();
  const builtins = project.chapterTypes.filter((t) => t.builtin);
  const custom = project.chapterTypes.filter((t) => !t.builtin).sort((a, b) => a.label.localeCompare(b.label));
  return [...builtins, ...custom];
}

export function getChapterType(key) {
  return getActiveProject().chapterTypes.find((t) => t.key === key) || null;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-933-938
export function getChapterTypeForChapter(chapter) {
  return getChapterType(chapter.docType) || getChapterType('chapter');
}

export function createChapterType({ label, role = 'content' } = {}) {
  const project = getActiveProject();
  const type = { key: slugType(label), label: (label || 'Untitled type').trim(), role, builtin: false };
  project.chapterTypes.push(type);
  project.updatedAt = now();
  save();
  return type;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-952-957
export function updateChapterType(key, patch) {
  const project = getActiveProject();
  const type = project.chapterTypes.find((t) => t.key === key);
  if (!type) return;
  const safePatch = { ...patch };
  delete safePatch.key;
  delete safePatch.builtin;
  Object.assign(type, safePatch);
  project.updatedAt = now();
  save();
}

// Same refuse-rather-than-dangle contract as deleteEntityType: no deleting
// a builtin, no deleting a custom type still in use by at least one
// chapter. Caller (app.js's type manager) checks the return value.
export function deleteChapterType(key) {
  const project = getActiveProject();
  const type = project.chapterTypes.find((t) => t.key === key);
  if (!type || type.builtin) return false;
  const inUse = project.chapters.some((c) => c.docType === key);
  if (inUse) return false;
  project.chapterTypes = project.chapterTypes.filter((t) => t.key !== key);
  project.updatedAt = now();
  save();
  return true;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-985-992

export function getDocumentTemplates(appliesTo = null) {
  const project = getActiveProject();
  const all = project.documentTemplates || [];
  return appliesTo ? all.filter((t) => t.appliesTo === appliesTo) : all;
}

export function getDocumentTemplate(templateId) {
  const project = getActiveProject();
  return (project.documentTemplates || []).find((t) => t.id === templateId) || null;
}

export function createDocumentTemplate({ appliesTo, name, docType = 'chapter', titleSeed = '', content = '', sceneFields = null } = {}) {
  const trimmed = (name || '').trim();
  if (!trimmed || (appliesTo !== 'chapter' && appliesTo !== 'scene')) return null;
  const project = getActiveProject();
  const template = {
    id: uid('tpl'),
    builtin: false,
    appliesTo,
    name: trimmed,
    titleSeed,
    ...(appliesTo === 'chapter' ? { docType, content } : { sceneFields: sceneFields || { goal: '', conflict: '', outcome: '', notes: '', location: '' } }),
  };
  project.documentTemplates = [...(project.documentTemplates || []), template];
  project.updatedAt = now();
  save();
  return template;
}

export function updateDocumentTemplate(templateId, patch) {
  const project = getActiveProject();
  const template = (project.documentTemplates || []).find((t) => t.id === templateId);
  if (!template || template.builtin) return false;
  Object.assign(template, patch);
  project.updatedAt = now();
  save();
  return true;
}

export function deleteDocumentTemplate(templateId) {
  const project = getActiveProject();
  const template = (project.documentTemplates || []).find((t) => t.id === templateId);
  if (!template || template.builtin) return false;
  project.documentTemplates = project.documentTemplates.filter((t) => t.id !== templateId);
  project.updatedAt = now();
  save();
  return true;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-1043-1048
export function createChapterFromTemplate(templateId, titleOverride = '') {
  const template = getDocumentTemplate(templateId);
  if (!template || template.appliesTo !== 'chapter') return null;
  const chapter = createChapter((titleOverride || '').trim() || template.titleSeed || 'Untitled Chapter');
  chapter.docType = template.docType || 'chapter';
  chapter.content = template.content || '';
  chapter.updatedAt = now();
  save();
  return chapter;
}

// Same idea for scene-appliesTo templates, on an existing chapter —
// scenes don't have prose content of their own (see createScene's field
// list), so this seeds goal/conflict/outcome/notes/location instead.
export function createSceneFromTemplate(chapterId, templateId, titleOverride = '') {
  const template = getDocumentTemplate(templateId);
  if (!template || template.appliesTo !== 'scene') return null;
  const fields = template.sceneFields || {};
  return createScene(chapterId, { title: (titleOverride || '').trim() || template.titleSeed || 'Untitled Scene', ...fields });
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-1070-1078
export function getContentChapterNumber(chapter) {
  const project = getActiveProject();
  const type = getChapterTypeForChapter(chapter);
  if (type.role !== 'content') return null;
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-1083-1088
  if (chapter.archived || chapter.trashedAt) return null;
  const ordered = [...project.chapters].sort((a, b) => a.order - b.order);
  const contentChapters = ordered.filter((c) => getChapterTypeForChapter(c).role === 'content' && !c.archived && !c.trashedAt);
  const idx = contentChapters.findIndex((c) => c.id === chapter.id);
  return idx === -1 ? null : idx + 1;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-1096-1103

export function getSnapshots(chapterId) {
  const chapter = getChapter(chapterId);
  if (!chapter) return [];
  return [...chapter.snapshots].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// MAX_AUTO_SNAPSHOTS + capAutoSnapshots moved to store-core.js (0.2.8 Pass 1) —
// the migration ladder’s auto-checkpoint backfills share them with the
// snapshot code below. Import from there.

export function createSnapshot(chapterId, label = '', auto = false) {
  const chapter = getChapter(chapterId);
  if (!chapter) return null;
  const snapshot = {
    id: uid('snap'),
    label: label.trim() || `Snapshot · ${new Date().toLocaleString()}`,
    content: chapter.content,
    wordCount: wordCount(chapter.content),
    createdAt: now(),
    auto, // structured flag, not inferred from the label string — a
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-1125-1128
  };
  chapter.snapshots.push(snapshot);
  capAutoSnapshots(chapter.snapshots);
  capManualSnapshots(chapter.snapshots);
  save();
  return snapshot;
}

export function getSnapshot(chapterId, snapshotId) {
  const chapter = getChapter(chapterId);
  if (!chapter) return null;
  return chapter.snapshots.find((s) => s.id === snapshotId) || null;
}

export function deleteSnapshot(chapterId, snapshotId) {
  const chapter = getChapter(chapterId);
  if (!chapter) return;
  chapter.snapshots = chapter.snapshots.filter((s) => s.id !== snapshotId);
  save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-1150-1153
export function restoreSnapshot(chapterId, snapshotId) {
  const chapter = getChapter(chapterId);
  const snapshot = getSnapshot(chapterId, snapshotId);
  if (!chapter || !snapshot) return;
  createSnapshot(chapterId, `Before restoring "${snapshot.label}"`, true);
  chapter.content = snapshot.content;
  chapter.updatedAt = now();
  save();
}

// ── export (Session 6) ────────────────────────────────────────────────────

export function exportChapterText(chapterId) {
  const chapter = getChapter(chapterId);
  if (!chapter) return '';
  return chapter.content;
}

export function exportProjectText(project = getActiveProject()) {
  const chapters = [...project.chapters].sort((a, b) => a.order - b.order);
  return chapters.map((c) => `# ${c.title}\n\n${c.content}`).join('\n\n---\n\n');
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-1177-1188
export function importChapterFromText(title, content) {
  const chapter = createChapter(title);
  updateChapterContent(chapter.id, content);
  // Snapshot after content is set — createSnapshot reads chapter.content,
  // so it must come after updateChapterContent, not before.
  createSnapshot(chapter.id, 'Imported');
  return chapter;
}

// Session 22 — arc label update. Same thin-wrapper pattern as
// updateChapterPosition / updateChapterContent: reads the chapter,
// mutates the one field, saves.
export function updateChapterArc(chapterId, arc) {
  const chapter = getChapter(chapterId);
  if (!chapter) return;
  chapter.arc = (arc || '').trim();
  chapter.updatedAt = now();
  getActiveProject().updatedAt = now();
  save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-1210-1213

export function searchProject(query, options) {
  return Search.searchProject(getActiveProject(), query, options);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-manuscript-js-1219-1223
export function replaceInChapters(query, replacement, options) {
  const project = getActiveProject();
  const plan = Search.planChapterReplace(project, query, replacement, options);
  const label = options?.useRegex
    ? `Before regex find/replace: "${query}" → "${replacement}"`
    : `Before find/replace: "${query}" → "${replacement}"`;
  plan.forEach((item) => {
    createSnapshot(item.chapterId, label, true);
    const chapter = getChapter(item.chapterId);
    chapter.content = item.newContent;
    chapter.updatedAt = now();
  });
  if (plan.length) {
    project.updatedAt = now();
    save();
  }
  return plan;
}

// Every scene referenced across all chapters, flattened — the scene
// picker for the relationship-edit UI needs to show "Chapter — Scene"
// across the whole manuscript, not just the current chapter's scenes.
export function getAllScenesFlat() {
  const project = getActiveProject();
  const out = [];
  project.chapters.forEach((chapter) => {
    chapter.scenes.forEach((scene) => {
      out.push({ ...scene, chapterId: chapter.id, chapterTitle: chapter.title });
    });
  });
  return out;
}
