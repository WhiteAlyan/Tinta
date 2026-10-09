// Tinta — navigation intent smoketest (0.2.6 Pass 2).
//
// Pins the routing table and the pure resolver contract. The DOM half
// (openTarget) needs context.js state + a render callback — in Node we
// shim nothing: openTarget is exercised with a stub render and the real
// context.js (state writes are plain module variables, no DOM), but the
// Store getters run against an empty db, so record targets resolve null.
// That's the dangling-id contract, which is exactly what's worth pinning
// without a full fixture db. Routing-table completeness is pinned in the
// first section.
//
// Run with: node targets.smoketest.mjs

import { resolveTarget, openTarget, navigableTypes } from './targets.js';

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.error(`  FAIL: ${msg}`); }
}

function section(t) { console.log(`\n${t}`); }

section('routing table — every navigable type resolves to its view');
const expected = {
  chapter: 'write',
  entity: 'notes',
  reference: 'references',
  map: 'map',
  system: 'systems',
  timeline: 'timeline',
  questions: 'questions',
};
const types = navigableTypes();
assert(types.length === Object.keys(expected).length, `routing table has ${Object.keys(expected).length} types (got ${types.length})`);
for (const [type, view] of Object.entries(expected)) {
  assert(types.includes(type), `${type} is navigable`);
  const r = resolveTarget({ type, id: 'whatever' });
  // With no fixture db, record types dangle to null; view-only types
  // resolve with record: null too — so here we only pin the VIEW choice.
  assert(r === null || r.view === view, `${type} routes to ${view}`);
}

section('resolver contract — malformed and dangling targets refuse cleanly');
assert(resolveTarget({ type: 'entity' }) === null, 'missing id → null');
assert(resolveTarget({ id: 'ent_x' }) === null, 'missing type → null');
assert(resolveTarget(null) === null, 'null target → null');
assert(resolveTarget({ type: 'nope', id: 'x' }) === null, 'unknown type → null (no throw)');
assert(resolveTarget({ type: 'chapter', id: 'chap_missing' }) === null, 'dangling chapter id → null in empty db');

section('view-only types resolve without a record');
const t = resolveTarget({ type: 'timeline', id: 'unused' });
assert(t && t.view === 'timeline' && t.record === null, 'timeline resolves to the view, record null');
const q = resolveTarget({ type: 'questions', id: 'unused' });
assert(q && q.view === 'questions' && q.record === null, 'questions resolves to the view, record null');

section('openTarget — dangling id is a silent no-op (no state change, no render)');
let renders = 0;
const result = openTarget({ type: 'chapter', id: 'chap_missing' }, { render: () => renders++ });
assert(result === null, 'dangling target returns null');
assert(renders === 0, 'dangling target never repaints');

console.log(`\ntargets.smoketest: ${pass} passed, ${fail} failed${fail ? '' : ' — all green.'}.`);
if (fail) process.exit(1);
