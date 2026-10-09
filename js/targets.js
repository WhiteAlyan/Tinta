// Historical context: see docs/CODEBASE_NOTES.md#jstargets-js-1-34

import * as Store from './store.js';
import {
  setActiveView, setActiveChapterId,
  setActiveEntityId, setActiveReferenceId, setActiveMapId, setActiveSystemId,
} from './context.js';

// type → which view hosts it, and which context field to write. Kept as
// data so the smoketest can pin the whole routing table in one assert.
const TARGET_ROUTING = {
  chapter: { view: 'write', setState: setActiveChapterId },
  entity: { view: 'notes', setState: setActiveEntityId },
  reference: { view: 'references', setState: setActiveReferenceId },
  map: { view: 'map', setState: setActiveMapId },
  system: { view: 'systems', setState: setActiveSystemId },
  // View-only types — no per-record state, the view IS the destination.
  timeline: { view: 'timeline', setState: null },
  questions: { view: 'questions', setState: null },
};

// Historical context: see docs/CODEBASE_NOTES.md#jstargets-js-55-63
export function resolveTarget(target) {
  const { type, id } = target || {};
  const routing = TARGET_ROUTING[type];
  if (!routing || !id) return null;
  const getters = {
    chapter: () => Store.getChapter(id),
    entity: () => Store.getEntity(id),
    reference: () => Store.getReference(id),
    map: () => Store.getMap(id),
    system: () => Store.getRuleSystem(id),
  };
  const record = getters[type] ? getters[type]() : null;
  // View-only types resolve to the view itself; record types must exist.
  if (routing.setState && !record) return null;
  return {
    type,
    id,
    view: routing.view,
    record,
    label: record ? (record.title || record.name || type) : type,
  };
}

// Historical context: see docs/CODEBASE_NOTES.md#jstargets-js-87-91
export function openTarget(target, { render } = {}) {
  const resolved = resolveTarget(target);
  if (!resolved) {
    console.warn?.('openTarget: unresolved target', target);
    return null;
  }
  const routing = TARGET_ROUTING[resolved.type];
  if (routing.setState) routing.setState(resolved.id);
  setActiveView(routing.view);
  render?.();
  return resolved;
}

// The routing table, exported for the smoketest (and so a future
// back/forward or Welcome surface can enumerate what's addressable
// without reaching into this module's internals).
export function navigableTypes() {
  return Object.keys(TARGET_ROUTING);
}
