// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-1-28

import {
  AUTHORITY_SOURCES,
  AUTO_CHECKPOINT_INTERVAL_MS,
  CANON_STATUSES,
  capAutoSnapshots,
  capManualSnapshots,
  cloneWithoutSnapshots,
  escapeRegExp,
  getActiveProject,
  getSeriesForActiveProject,
  load,
  now,
  ownGet,
  recordMutation,
  save,
  slugType,
  uid,
} from './store-core.js';

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-47-50

export function getEntityList() {
  const project = getActiveProject();
  return Object.values(project.entities).sort((a, b) => a.name.localeCompare(b.name));
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-57-64
export function getSeriesEntityList() {
  const series = getSeriesForActiveProject();
  if (!series) return [];
  return Object.values(series.entities).sort((a, b) => a.name.localeCompare(b.name));
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-71-77
export function getEntity(entityId) {
  const project = getActiveProject();
  // ownGet, not a bare index — see store-core.js. `getEntity('constructor')`
  // used to return the Object constructor function and sail past the
  // truthiness check as if it were a real entity.
  const own = ownGet(project.entities, entityId);
  if (own) return own;
  const series = getSeriesForActiveProject();
  const fromSeries = series ? ownGet(series.entities, entityId) : undefined;
  if (fromSeries) return fromSeries;
  return null;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-86-90
export function isSeriesEntity(entityId) {
  const project = getActiveProject();
  if (project.entities[entityId]) return false;
  const series = getSeriesForActiveProject();
  return !!(series && series.entities[entityId]);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-98-113
export function findEntityByName(name) {
  const target = (name || '').trim().toLowerCase();
  if (!target) return null;
  const list = [...getEntityList(), ...getSeriesEntityList()];
  const byName = list.find((e) => e.name.trim().toLowerCase() === target);
  if (byName) return byName;
  return list.find((e) => (e.aliases || []).some((a) => a.trim().toLowerCase() === target)) || null;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-123-128
export function getEntityChildren(parentId) {
  return [...getEntityList(), ...getSeriesEntityList()]
    .filter((e) => e.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-135-141
export function wouldCreateCycle(entityId, candidateParentId) {
  if (!candidateParentId) return false;
  if (entityId === candidateParentId) return true;
  let cursor = getEntity(candidateParentId);
  const seen = new Set();
  while (cursor && cursor.parentId) {
    if (cursor.parentId === entityId || seen.has(cursor.parentId)) return true;
    seen.add(cursor.parentId);
    cursor = getEntity(cursor.parentId);
  }
  return false;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-155-175

export function getCanonStatuses() {
  return CANON_STATUSES;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-181-212

export function getAuthoritySources() {
  return AUTHORITY_SOURCES;
}

export function createEntity({ name, type = 'character', description = '', tags = [] } = {}) {
  const project = getActiveProject();
  const entity = {
    id: uid('ent'),
    name: (name || 'Unnamed').trim(),
    type, // an entityTypes[].key — one of the 4 builtins, or a custom type's key
    description,
    tags,
    // Worldbuilding pass:
    parentId: null, // another entity's id — lets a City nest under a Country, a sub-faction under a Faction, etc. Never validated against cycles here; see wouldCreateCycle() below, which callers (app.js's parent picker) are expected to consult before calling updateEntity with a new parentId.
    aliases: [], // nicknames/titles/alternate names — findEntityByName() and the [[mention]] linker below both check these alongside `name`, so "El" or "the Duchess" can resolve to the same entity as "Elena" without the prose needing to spell out the canonical name every time.
    customFields: {}, // keyed by this type's template.fields[].key — freeform values for whatever this entity's type template defines (a Deity's domain, a Species' lifespan, etc.)
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-230-241
    statusEvents: [],
    imageIds: [], // gallery — reuses the shared project.images catalog, same blobs as inline/cover art
    primaryImageId: null, // which imageIds entry is the "portrait" shown in sidebar/detail/canvas; falls back to imageIds[0] when null
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-245-249
    canonStatus: 'canon',
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-251-255
    authoritySource: 'Author decision',
    generation: null,
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-258-264
    snapshots: [],
    lastAutoCheckpointAt: now(),
    createdAt: now(),
    updatedAt: now(),
  };
  project.entities[entity.id] = entity;
  project.updatedAt = now();
  recordMutation({
    type: 'create', targetType: 'entity', targetId: entity.id, projectId: project.id,
    before: null, after: cloneWithoutSnapshots(entity),
    label: `Created "${entity.name}"`, timestamp: Date.now(),
  });
  save();
  return entity;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-281-286
export function createSeriesEntity({ name, type = 'character', description = '', tags = [] } = {}) {
  const series = getSeriesForActiveProject();
  if (!series) return null;
  const entity = {
    id: uid('ent'),
    name: (name || 'Unnamed').trim(),
    type,
    description,
    tags,
    parentId: null,
    aliases: [],
    customFields: {},
    statusEvents: [],
    imageIds: [],
    primaryImageId: null,
    canonStatus: 'canon',
    authoritySource: 'Author decision', // §45 foundational pass — same default reasoning as createEntity above
    generation: null,
    snapshots: [],
    lastAutoCheckpointAt: now(),
    createdAt: now(),
    updatedAt: now(),
  };
  series.entities[entity.id] = entity;
  series.updatedAt = now();
  save();
  return entity;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-316-322
export function promoteEntityToSeries(entityId) {
  const project = getActiveProject();
  const series = getSeriesForActiveProject();
  if (!series) return null;
  const entity = project.entities[entityId];
  if (!entity) return null;
  delete project.entities[entityId];
  series.entities[entity.id] = entity;
  entity.updatedAt = now();
  project.updatedAt = now();
  series.updatedAt = now();
  save();
  return entity;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-338-345
export function demoteEntityToProject(entityId) {
  const project = getActiveProject();
  const series = getSeriesForActiveProject();
  if (!series) return null;
  const entity = series.entities[entityId];
  if (!entity) return null;
  delete series.entities[entityId];
  project.entities[entity.id] = entity;
  entity.updatedAt = now();
  project.updatedAt = now();
  series.updatedAt = now();
  save();
  return entity;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-361-367

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-369-374
export function deleteSeriesEntity(entityId) {
  const db = load();
  const series = getSeriesForActiveProject();
  if (!series || !series.entities[entityId]) return false;
  Object.values(series.entities).forEach((e) => {
    if (e.parentId === entityId) e.parentId = null;
  });
  delete series.entities[entityId];
  series.updatedAt = now();
  series.memberProjectIds.forEach((projectId) => {
    const project = db.projects[projectId];
    if (!project) return;
    Object.values(project.entities).forEach((e) => {
      if (e.parentId === entityId) e.parentId = null;
    });
    Object.keys(project.relationships).forEach((relId) => {
      const rel = ownGet(project.relationships, relId);
      if (!rel) return;
      if (rel.fromId === entityId || rel.toId === entityId) delete project.relationships[relId];
    });
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-394-402
  });
  save();
  return true;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-408-418
export function getEntityTypes() {
  const project = getActiveProject();
  const builtins = project.entityTypes.filter((t) => t.builtin);
  const custom = project.entityTypes.filter((t) => !t.builtin).sort((a, b) => a.label.localeCompare(b.label));
  return [...builtins, ...custom];
}

export function getEntityType(key) {
  return getActiveProject().entityTypes.find((t) => t.key === key) || null;
}

export function createEntityType({ label, color = '#8B6F47', fields = [] } = {}) {
  const project = getActiveProject();
  const type = { key: slugType(label), label: (label || 'Untitled type').trim(), color, builtin: false, fields };
  project.entityTypes.push(type);
  project.updatedAt = now();
  save();
  return type;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-439-443
export function updateEntityType(key, patch) {
  const project = getActiveProject();
  const type = project.entityTypes.find((t) => t.key === key);
  if (!type) return;
  const safePatch = { ...patch };
  delete safePatch.key;
  delete safePatch.builtin;
  if (type.builtin) delete safePatch.color; // builtins stay theme-reactive, not overridable to a flat hex
  Object.assign(type, safePatch);
  project.updatedAt = now();
  save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-457-463
export function deleteEntityType(key) {
  const project = getActiveProject();
  const type = project.entityTypes.find((t) => t.key === key);
  if (!type || type.builtin) return false;
  const inUse = Object.values(project.entities).some((e) => e.type === key);
  if (inUse) return false;
  project.entityTypes = project.entityTypes.filter((t) => t.key !== key);
  project.updatedAt = now();
  save();
  return true;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-476-479
export function getDistinctEntityTags() {
  const values = new Set();
  getEntityList().forEach((e) => (e.tags || []).forEach((t) => {
    const v = (t || '').trim();
    if (v) values.add(v);
  }));
  return [...values].sort((a, b) => a.localeCompare(b));
}

export function getEntityPortraitId(entity) {
  if (!entity) return null;
  if (entity.primaryImageId && entity.imageIds.includes(entity.primaryImageId)) return entity.primaryImageId;
  return entity.imageIds[0] || null;
}

export function addEntityImage(entityId, imageId) {
  const entity = getEntity(entityId);
  if (!entity || entity.imageIds.includes(imageId)) return;
  entity.imageIds.push(imageId);
  if (!entity.primaryImageId) entity.primaryImageId = imageId;
  entity.updatedAt = now();
  save();
}

export function removeEntityImage(entityId, imageId) {
  const entity = getEntity(entityId);
  if (!entity) return;
  entity.imageIds = entity.imageIds.filter((id) => id !== imageId);
  if (entity.primaryImageId === imageId) entity.primaryImageId = entity.imageIds[0] || null;
  entity.updatedAt = now();
  save();
}

export function setEntityPrimaryImage(entityId, imageId) {
  const entity = getEntity(entityId);
  if (!entity || !entity.imageIds.includes(imageId)) return;
  entity.primaryImageId = imageId;
  entity.updatedAt = now();
  save();
}

export function updateEntity(entityId, patch) {
  const entity = getEntity(entityId);
  if (!entity) return false;
  const project = getActiveProject();
  maybeAutoCheckpointEntity(entity);
  const before = cloneWithoutSnapshots(entity);
  Object.assign(entity, patch, { updatedAt: now() });
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-528-536
  if (project.entities[entityId]) {
    recordMutation({
      type: 'update', targetType: 'entity', targetId: entityId, projectId: project.id,
      before, after: cloneWithoutSnapshots(entity),
      label: `Edited "${entity.name}"`, timestamp: Date.now(),
    });
  }
  // P1-3 fix — return save()'s boolean. Same shape as the
  // save-truthfulness contract pinned for updateChapterContent (line 127
  // in store-manuscript.js). Entity edits are the most common worldbuilding
  // mutations; silently dropping them under quota pressure is the same
  // bug class the editor fix corrected.
  return save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-547-556

function maybeAutoCheckpointEntity(entity) {
  const msSinceCheckpoint = Date.now() - new Date(entity.lastAutoCheckpointAt || 0).getTime();
  if (entity.name && msSinceCheckpoint >= AUTO_CHECKPOINT_INTERVAL_MS) {
    createEntitySnapshot(entity.id, 'Auto-checkpoint', true);
    entity.lastAutoCheckpointAt = now();
  }
}

export function getEntitySnapshots(entityId) {
  const entity = getEntity(entityId);
  if (!entity) return [];
  return [...(entity.snapshots || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-572-577
export function createEntitySnapshot(entityId, label = '', auto = false) {
  const entity = getEntity(entityId);
  if (!entity) return null;
  if (!Array.isArray(entity.snapshots)) entity.snapshots = [];
  const { snapshots: _omit, ...dataWithoutSnapshots } = entity; // don't nest a copy of the snapshot list inside itself
  const snapshot = {
    id: uid('esnap'),
    label: label.trim() || `Snapshot · ${new Date().toLocaleString()}`,
    data: JSON.parse(JSON.stringify(dataWithoutSnapshots)),
    createdAt: now(),
    auto,
  };
  entity.snapshots.push(snapshot);
  capAutoSnapshots(entity.snapshots);
  capManualSnapshots(entity.snapshots);
  save();
  return snapshot;
}

export function getEntitySnapshot(entityId, snapshotId) {
  const entity = getEntity(entityId);
  if (!entity) return null;
  return (entity.snapshots || []).find((s) => s.id === snapshotId) || null;
}

export function deleteEntitySnapshot(entityId, snapshotId) {
  const entity = getEntity(entityId);
  if (!entity) return;
  entity.snapshots = (entity.snapshots || []).filter((s) => s.id !== snapshotId);
  save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-610-624
const ENTITY_SNAPSHOT_COMPARE_SKIP_KEYS = new Set(['id', 'createdAt', 'updatedAt', 'snapshots']);
function formatSnapshotCompareValue(v) {
  if (v === undefined || v === null || v === '') return '(empty)';
  if (Array.isArray(v)) return v.length === 0 ? '(empty list)' : `${v.length} item${v.length === 1 ? '' : 's'}`;
  if (typeof v === 'object') {
    const keys = Object.keys(v);
    return keys.length === 0 ? '(empty)' : `${keys.length} field${keys.length === 1 ? '' : 's'} set`;
  }
  const s = String(v);
  return s.length > 80 ? `${s.slice(0, 77)}...` : s;
}
export function getEntitySnapshotChanges(entityId, snapshotId) {
  const entity = getEntity(entityId);
  const snapshot = getEntitySnapshot(entityId, snapshotId);
  if (!entity || !snapshot) return [];
  const keys = new Set([...Object.keys(entity), ...Object.keys(snapshot.data)]);
  const changes = [];
  keys.forEach((key) => {
    if (ENTITY_SNAPSHOT_COMPARE_SKIP_KEYS.has(key)) return;
    const currentVal = entity[key];
    const snapshotVal = snapshot.data[key];
    if (JSON.stringify(currentVal) === JSON.stringify(snapshotVal)) return;
    changes.push({
      key,
      current: formatSnapshotCompareValue(currentVal),
      snapshot: formatSnapshotCompareValue(snapshotVal),
    });
  });
  // Stable, readable order: name/description first if present, then
  // alphabetical for everything else — matches how the entity detail
  // panel itself orders its most-important-first fields.
  const priority = ['name', 'description'];
  changes.sort((a, b) => {
    const pa = priority.indexOf(a.key), pb = priority.indexOf(b.key);
    if (pa !== -1 || pb !== -1) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
    return a.key.localeCompare(b.key);
  });
  return changes;
}

export function restoreEntitySnapshot(entityId, snapshotId) {
  const entity = getEntity(entityId);
  const snapshot = getEntitySnapshot(entityId, snapshotId);
  if (!entity || !snapshot) return;
  createEntitySnapshot(entityId, `Before restoring "${snapshot.label}"`, true);
  const { id: _id, createdAt: _createdAt, snapshots: _snapshots, ...restoredFields } = snapshot.data;
  Object.assign(entity, restoredFields, { updatedAt: now() });
  save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-675-682

export function getEntityStatusEvents(entityId) {
  const entity = getEntity(entityId);
  if (!entity) return [];
  const project = getActiveProject();
  return [...(entity.statusEvents || [])].sort((a, b) => {
    const ea = project.timelineEvents[a.timelineEventId];
    const eb = project.timelineEvents[b.timelineEventId];
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-691-694
    if (!ea && !eb) return 0;
    if (!ea) return 1;
    if (!eb) return -1;
    return ea.order - eb.order;
  });
}

export function addEntityStatusEvent(entityId, { label, timelineEventId, blocksAppearance = false, note = '' } = {}) {
  const trimmed = (label || '').trim();
  if (!trimmed || !timelineEventId) return null;
  const entity = getEntity(entityId);
  if (!entity) return null;
  const se = { id: uid('se'), label: trimmed, timelineEventId, blocksAppearance: !!blocksAppearance, note };
  entity.statusEvents = [...(entity.statusEvents || []), se];
  entity.updatedAt = now();
  save();
  return se;
}

export function updateEntityStatusEvent(entityId, statusEventId, patch) {
  const entity = getEntity(entityId);
  if (!entity) return;
  const se = (entity.statusEvents || []).find((s) => s.id === statusEventId);
  if (!se) return;
  Object.assign(se, patch);
  entity.updatedAt = now();
  save();
}

export function deleteEntityStatusEvent(entityId, statusEventId) {
  const entity = getEntity(entityId);
  if (!entity) return;
  entity.statusEvents = (entity.statusEvents || []).filter((s) => s.id !== statusEventId);
  entity.updatedAt = now();
  save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-732-750
let _positionSaveTimer = null;
const POSITION_SAVE_DEBOUNCE_MS = 200;

function schedulePositionSave() {
  if (_positionSaveTimer) clearTimeout(_positionSaveTimer);
  _positionSaveTimer = setTimeout(() => {
    _positionSaveTimer = null;
    save();
  }, POSITION_SAVE_DEBOUNCE_MS);
}

// Flush any pending position save immediately. Called by the canvas
// view's onDragEnd (the final position should hit disk right away, not
// 200ms later) and by the pagehide/beforeunload listeners.
export function flushPendingPositionSave() {
  if (_positionSaveTimer) {
    clearTimeout(_positionSaveTimer);
    _positionSaveTimer = null;
    save();
  }
}

export function setEntityPosition(entityId, x, y) {
  // Mutate the in-memory entity immediately — every read (canvas
  // redraw, sidebar list, etc.) sees the new position without waiting
  // for the debounced save to land.
  const entity = getEntity(entityId);
  if (!entity) return;
  entity.canvasX = Math.round(x);
  entity.canvasY = Math.round(y);
  entity.updatedAt = now();
  // Debounce the disk write — see schedulePositionSave's comment for why.
  schedulePositionSave();
}

// Register a pagehide/beforeunload flush so an in-flight debounce
// doesn't lose the final position on tab close. Same defensive pattern
// editor.js's activeFlush uses for chapter content.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushPendingPositionSave);
  window.addEventListener('beforeunload', flushPendingPositionSave);
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-794-804
export const MENTION_RE = /\[\[([^\[\]]+)\]\]/g;

// v0.2.9 — passive entity recognition. When project.passiveRecognition
// is true, extractMentions also scans for entity names + aliases at word
// boundaries (not just [[bracket]] syntax). This lets the writer type
// "White Alyan walked in" without brackets and still get the entity
// backlink + the passive popup in the editor.
//
// Implementation: builds a single regex from all entity names + aliases
// (minus stopwords), sorted by length descending so "White Alyan"
// matches before "Alyan" (longest match wins). Single regex pass is
// O(text length), not O(text × entity count) — fast even for 5000+
// entities.
let _passiveRegexCache = null;
let _passiveRegexKey = '';

function buildPassiveRegex(entities, stopwords) {
  const stopSet = new Set((stopwords || []).map((s) => s.toLowerCase()));
  const names = new Set();
  entities.forEach((e) => {
    if (e.name && e.name.trim()) names.add(e.name.trim());
    if (Array.isArray(e.aliases)) {
      e.aliases.forEach((a) => { if (a && a.trim()) names.add(a.trim()); });
    }
  });
  // Remove stopwords
  stopSet.forEach((s) => names.delete(s));
  if (!names.size) return null;
  // Sort by length descending — longest match first
  const sorted = [...names].sort((a, b) => b.length - a.length);
  // Escape regex special chars in each name
  const escaped = sorted.map((n) => escapeRegExp(n));
  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
}

function getPassiveRegex() {
  const project = getActiveProject();
  if (!project.passiveRecognition) return null;
  // v0.2.9 audit fix — include series entities alongside project entities.
  // [[bracket]] mentions search both (via findEntityByName), so passive
  // recognition should too. Without this, a series-shared character
  // (e.g. "Aragorn") wouldn't be recognized in plain prose.
  const entities = [...getEntityList(), ...getSeriesEntityList()];
  const stopwords = project.mentionStopwords || [];
  const key = entities.map((e) => e.name + ':' + (e.aliases || []).join(',')).join('|') + '~' + stopwords.join('|');
  if (key === _passiveRegexKey && _passiveRegexCache) return _passiveRegexCache;
  _passiveRegexKey = key;
  _passiveRegexCache = buildPassiveRegex(entities, stopwords);
  return _passiveRegexCache;
}

export function extractMentions(text = '') {
  const mentions = [];
  let match;
  // 1. [[bracket]] mentions — always scanned
  MENTION_RE.lastIndex = 0;
  while ((match = MENTION_RE.exec(text))) {
    mentions.push({ name: match[1].trim(), index: match.index, length: match[0].length, bracket: true });
  }

  // 2. Passive mentions — only when passiveRecognition is on. Scans for
  // entity names + aliases at word boundaries. Deduplicates against
  // bracket mentions (same text range shouldn't be counted twice).
  const passiveRegex = getPassiveRegex();
  if (passiveRegex) {
    passiveRegex.lastIndex = 0;
    const bracketRanges = mentions.map((m) => [m.index, m.index + m.length]);
    while ((match = passiveRegex.exec(text))) {
      const start = match.index;
      const end = start + match[0].length;
      // Skip if this overlaps a bracket mention
      const overlaps = bracketRanges.some(([bs, be]) => start < be && end > bs);
      if (overlaps) continue;
      mentions.push({ name: match[1], index: start, length: match[0].length, passive: true });
    }
  }

  // Sort by position in text
  mentions.sort((a, b) => a.index - b.index);
  return mentions;
}

// Clear the passive regex cache — called when entity names/aliases change
// (createEntity, updateEntity, deleteEntity, addMentionStopword, etc.).
export function invalidatePassiveRegexCache() {
  _passiveRegexCache = null;
  _passiveRegexKey = '';
}

function buildSnippet(text, index, length, radius = 40) {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + length + radius);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return prefix + text.slice(start, end) + suffix;
}

// Computed on demand rather than stored, so a renamed entity's backlinks stay
// correct without a migration pass — matches by current name at scan time.
export function getBacklinksFor(entityId) {
  const entity = getEntity(entityId);
  if (!entity) return [];
  const target = entity.name.trim().toLowerCase();
  if (!target) return [];
  const project = getActiveProject();
  const results = [];

  function scan(text, source) {
    if (!text) return;
    extractMentions(text).forEach((m) => {
      if (m.name.toLowerCase() === target) {
        results.push({ ...source, snippet: buildSnippet(text, m.index, m.length) });
      }
    });
  }

  project.chapters.forEach((chapter) => {
    scan(chapter.content, { chapterId: chapter.id, chapterTitle: chapter.title, field: 'content' });
    chapter.scenes.forEach((scene) => {
      ['goal', 'conflict', 'outcome'].forEach((field) => {
        scan(scene[field], {
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          sceneId: scene.id,
          sceneTitle: scene.title,
          field,
        });
      });
    });
  });

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-entities-js-859-862
  Object.values(project.timelineEvents || {}).forEach((event) => {
    scan(event.description, { eventId: event.id, eventTitle: event.title, field: 'description' });
  });

  return results;
}

// v0.2.9 — project-level get/set pairs for passive entity recognition.
// These live on the project (not the db) because stopwords and
// recognition preference are per-story — a fantasy novel with invented
// names needs different stopwords than a contemporary romance.

export function getMentionStopwords() {
  const project = getActiveProject();
  return Array.isArray(project.mentionStopwords) ? [...project.mentionStopwords] : [];
}

export function addMentionStopword(word) {
  const w = (word || '').trim().toLowerCase();
  if (!w) return;
  const project = getActiveProject();
  if (!Array.isArray(project.mentionStopwords)) project.mentionStopwords = [];
  if (!project.mentionStopwords.includes(w)) {
    project.mentionStopwords.push(w);
    save();
  }
  _passiveRegexCache = null; // invalidate — stopwords affect the regex
}

export function removeMentionStopword(word) {
  const w = (word || '').trim().toLowerCase();
  if (!w) return;
  const project = getActiveProject();
  if (!Array.isArray(project.mentionStopwords)) return;
  project.mentionStopwords = project.mentionStopwords.filter((s) => s !== w);
  save();
  _passiveRegexCache = null; // invalidate
}

export function getPassiveRecognition() {
  const project = getActiveProject();
  return project.passiveRecognition === true;
}

export function setPassiveRecognition(enabled) {
  const project = getActiveProject();
  project.passiveRecognition = Boolean(enabled);
  save();
  _passiveRegexCache = null; // invalidate — toggling recognition on/off
}
