// Tinta — storage hygiene smoketest (roadmap #9).
//
// Covers the four storage-budget erosion fixes: the corrupt-backup
// quarantine sweep (keys used to accumulate forever), the legacy
// `scriptorium:db` key finally being deleted after its data lands under
// `tinta:db`, the decision-log cap, and the per-relationship history cap.
// Run with: node storage-hygiene.smoketest.mjs

// ── localStorage shim with full enumeration support ────────────────────
// load()'s sweep walks localStorage.length + localStorage.key(i), so this
// shim has to implement real enumeration (the older smoketest shims
// don't, and the sweep safely no-ops on them).
class LocalStorageShim {
  constructor() { this.store = new Map(); }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null; }
  setItem(key, value) { this.store.set(key, String(value)); }
  removeItem(key) { this.store.delete(key); }
  clear() { this.store.clear(); }
  get length() { return this.store.size; }
  key(index) { return [...this.store.keys()][index] ?? null; }
}
globalThis.localStorage = new LocalStorageShim();

// Seed BEFORE importing store.js — module init doesn't call load(), but
// the first getActiveProject() does, and the sweep + legacy migration
// both run inside that one first load().
localStorage.setItem('tinta:db:corrupt-backup:1000', 'garbage-one');
localStorage.setItem('tinta:db:corrupt-backup:2000', 'garbage-two');
localStorage.setItem('tinta:db:corrupt-backup:3000', 'garbage-three');
localStorage.setItem('tinta:db:corrupt-backup:4000', 'garbage-four');
localStorage.setItem('tinta:unrelated:key', 'keep-me');
localStorage.setItem('scriptorium:db', JSON.stringify({
  version: 1,
  activeProjectId: 'p1',
  projects: { p1: { id: 'p1', title: 'Legacy Project', chapters: [], entities: {}, relationships: {} } },
}));

const Store = await import('./store.js');

let pass = 0, fail = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; failures.push(msg); console.error(`  ✗ ${msg}`); }
}
function assertEqual(actual, expected, msg) {
  assert(actual === expected, `${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function section(title) { console.log(`\n${title}`); }

section('corrupt-backup quarantine sweep — newest two kept, older ones removed');
Store.getActiveProject(); // triggers the one real load() of this process
assertEqual(localStorage.getItem('tinta:db:corrupt-backup:1000'), null, 'the oldest quarantine key (1000) was swept');
assertEqual(localStorage.getItem('tinta:db:corrupt-backup:2000'), null, 'the second-oldest quarantine key (2000) was swept');
assert(localStorage.getItem('tinta:db:corrupt-backup:3000') !== null, 'the second-newest quarantine key (3000) survived');
assert(localStorage.getItem('tinta:db:corrupt-backup:4000') !== null, 'the newest quarantine key (4000) survived');
assertEqual(localStorage.getItem('tinta:unrelated:key'), 'keep-me', 'unrelated keys are untouched by the sweep');

section('legacy scriptorium:db — migrated, saved under tinta:db, then deleted');
assert(localStorage.getItem('tinta:db') !== null, 'the migrated data was persisted under tinta:db');
assertEqual(localStorage.getItem('scriptorium:db'), null, 'the legacy key was DELETED after the new-key write succeeded — no more permanent duplicate');
assertEqual(Store.getActiveProject()?.title, 'Legacy Project', 'and the migrated project actually loaded');

section('decision log cap — 250 kept, oldest evicted at the write path');
const firstDecision = Store.createDecision({ decision: 'the first decision, written long ago', reason: 'oldest entry' });
let lastDecisionId = firstDecision.id;
for (let i = 0; i < 259; i++) {
  lastDecisionId = Store.createDecision({ decision: `decision number ${i + 2}` }).id;
}
const decisionLog = Store.getActiveProject().decisionLog;
assertEqual(decisionLog.length, 250, 'the log stopped growing at MAX_DECISION_LOG (250)');
assert(!decisionLog.some((d) => d.id === firstDecision.id), 'the oldest entry was evicted');
assert(decisionLog.some((d) => d.id === lastDecisionId), 'the newest entry is present');
assert(Store.getDecisionList().some((d) => d.id === lastDecisionId), 'the reader still sees the newest entry (all 260 creations share one createdAt millisecond, so ordering among ties stays stable-sort order — membership is the contract that matters here)');

section('relationship history cap — 50 per relationship, oldest evicted');
const rel = Store.createRelationship({ fromId: 'ent_a', toId: 'ent_b', label: 'Rivals' });
assert(rel, 'a relationship was created to exercise the cap');
let firstHistoryId = null;
let lastHistoryId = null;
for (let i = 0; i < 60; i++) {
  const entry = Store.addRelationshipHistoryEntry(rel.id, { label: `history entry ${i + 1}` });
  if (i === 0) firstHistoryId = entry.id;
  lastHistoryId = entry.id;
}
const stored = Store.getRelationship(rel.id);
assertEqual(stored.history.length, 50, 'history stopped growing at MAX_RELATIONSHIP_HISTORY (50)');
assert(!stored.history.some((e) => e.id === firstHistoryId), 'the oldest history entry was evicted');
assert(stored.history.some((e) => e.id === lastHistoryId), 'the newest history entry is present');

console.log(`\n${pass} passed, ${fail} failed${fail ? '' : ' — all green'}.`);
if (fail > 0) {
  console.error('\nFailures:');
  failures.forEach((m) => console.error(`  ✗ ${m}`));
  process.exit(1);
}
