// Historical context: see docs/CODEBASE_NOTES.md#jsstore-relationships-js-1-21

import { getActiveProject, now, ownGet, save, uid } from './store-core.js';

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-relationships-js-25-40

export function getRelationshipList() {
  const project = getActiveProject();
  return Object.values(project.relationships);
}

export function getRelationship(relId) {
  const project = getActiveProject();
  return ownGet(project.relationships, relId) || null;
}

export function getRelationshipsForEntity(entityId) {
  return getRelationshipList().filter((r) => r.fromId === entityId || r.toId === entityId);
}

export function getRelationshipTypeList() {
  const project = getActiveProject();
  return Object.values(project.relationshipTypes);
}

export function getRelationshipType(typeId) {
  if (!typeId) return null;
  const project = getActiveProject();
  return project.relationshipTypes[typeId] || null;
}

// Convenience so callers displaying an edge's text don't all need to do
// the two-step getRelationshipType(rel.typeId)?.label lookup themselves.
export function getRelationshipLabel(rel) {
  return getRelationshipType(rel?.typeId)?.label || '';
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-relationships-js-73-76
export function getRelationshipTypeUsageCount(typeId) {
  if (!typeId) return 0;
  return getRelationshipList().filter((r) => r.typeId === typeId).length;
}

function findOrCreateRelationshipType(label) {
  const project = getActiveProject();
  const trimmed = (label || '').trim();
  if (!trimmed) return null;
  const existing = Object.values(project.relationshipTypes).find((t) => t.label === trimmed);
  if (existing) return existing;
  const type = { id: uid('reltype'), label: trimmed, createdAt: now(), updatedAt: now() };
  project.relationshipTypes[type.id] = type;
  return type;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-relationships-js-93-96
function cleanupOrphanedRelationshipType(typeId) {
  if (!typeId) return;
  const project = getActiveProject();
  const stillUsed = Object.values(project.relationships).some((r) => r.typeId === typeId);
  if (!stillUsed) delete project.relationshipTypes[typeId];
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-relationships-js-104-110
export function createRelationship({ fromId, toId, label = '' }) {
  const project = getActiveProject();
  const type = findOrCreateRelationshipType(label);
  const rel = {
    id: uid('rel'),
    fromId,
    toId,
    typeId: type ? type.id : null,
    status: '', // freeform — "active", "estranged", "deceased-ended", whatever fits
    strength: '', // freeform — "close", "strained", or a number if the writer prefers
    startDate: '', // story-time freeform label, same spirit as timeline's storyDate
    endDate: '',
    notes: '',
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-relationships-js-124-131
    history: [],
    createdAt: now(),
    updatedAt: now(),
  };
  project.relationships[rel.id] = rel;
  save();
  return rel;
}

export function updateRelationship(relId, patch) {
  const rel = getRelationship(relId);
  if (!rel) return;
  Object.assign(rel, patch, { updatedAt: now() });
  save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-relationships-js-148-171

export function getRelationshipHistory(relId) {
  const rel = getRelationship(relId);
  if (!rel) return [];
  const project = getActiveProject();
  return [...(rel.history || [])].sort((a, b) => {
    const ea = a.timelineEventId ? project.timelineEvents[a.timelineEventId] : null;
    const eb = b.timelineEventId ? project.timelineEvents[b.timelineEventId] : null;
    if (!ea && !eb) return 0;
    if (!ea) return 1;
    if (!eb) return -1;
    return ea.order - eb.order;
  });
}

export function addRelationshipHistoryEntry(relId, { label, status = '', strength = '', timelineEventId = null, note = '' } = {}) {
  const trimmed = (label || '').trim();
  if (!trimmed) return null;
  const rel = getRelationship(relId);
  if (!rel) return null;
  const entry = { id: uid('relhist'), label: trimmed, status, strength, timelineEventId, note, createdAt: now() };
  rel.history = [...(rel.history || []), entry];
  rel.updatedAt = now();
  save();
  return entry;
}

export function updateRelationshipHistoryEntry(relId, entryId, patch) {
  const rel = getRelationship(relId);
  if (!rel) return;
  const entry = (rel.history || []).find((e) => e.id === entryId);
  if (!entry) return;
  Object.assign(entry, patch);
  rel.updatedAt = now();
  save();
}

export function deleteRelationshipHistoryEntry(relId, entryId) {
  const rel = getRelationship(relId);
  if (!rel) return;
  rel.history = (rel.history || []).filter((e) => e.id !== entryId);
  rel.updatedAt = now();
  save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-relationships-js-217-220
export function renameRelationshipType(typeId, newLabel) {
  const type = getRelationshipType(typeId);
  const trimmed = (newLabel || '').trim();
  if (!type || !trimmed) return;
  type.label = trimmed;
  type.updatedAt = now();
  save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-relationships-js-230-234
export function detachRelationshipToLabel(relId, newLabel) {
  const rel = getRelationship(relId);
  if (!rel) return;
  const oldTypeId = rel.typeId;
  const newType = findOrCreateRelationshipType(newLabel);
  rel.typeId = newType ? newType.id : null;
  rel.updatedAt = now();
  cleanupOrphanedRelationshipType(oldTypeId);
  save();
}

export function deleteRelationship(relId) {
  const project = getActiveProject();
  const typeId = ownGet(project.relationships, relId)?.typeId;
  delete project.relationships[relId];
  cleanupOrphanedRelationshipType(typeId);
  save();
}
