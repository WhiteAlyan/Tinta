// Performance smoketest — synthetic large project.
//
// The debounced setEntityPosition fix and other perf-sensitive changes
// were guesses based on reasoning, not measurement. This smoketest
// generates a project with ~5,000 entities, ~10,000 relationships,
// ~50 chapters of ~50KB content each, and times the operations that
// actually matter for the writer's experience:
//
// 1. JSON.stringify(_db) — save serialization cost
// 2. Store.save() — the full save path (serialize + write + notify)
// 3. getEntityList / getRelationshipList — render-path reads
// 4. extractMentions on a 50KB chapter — passive-recognition scan
// 5. estimateDbSizeBytes — the quota-watcher's periodic check
//
// Bulk creation (createEntity × 5000) is NOT timed — each create calls
// save() synchronously, which is a known pattern in Tinta (every
// mutation saves). A batch-create API would fix this, but that's a
// separate optimization, not a regression this test guards against.
//
// This is a smoketest, not a benchmark — it asserts each operation
// stays under a generous budget. A regression that 10x's any of these
// would fire. Tight budgets would catch 2x regressions but also fire
// on slow CI machines, so the budgets are deliberately loose.
//
// Run with: node js/perf-large-project.smoketest.mjs

import * as Store from './store.js';

let passed = 0;
let failed = 0;
function ok(name, cond, detail) {
  if (cond) { passed++; console.log(`  ok - ${name}${detail ? ` (${detail})` : ''}`); }
  else { failed++; console.log(`  NOT OK - ${name}${detail ? ` (${detail})` : ''}`); }
}

// Shim localStorage for Node
const _store = {};
globalThis.localStorage = {
  getItem: (k) => (_store[k] !== undefined ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: (k) => { delete _store[k]; },
  clear: () => { for (const k of Object.keys(_store)) delete _store[k]; },
};
globalThis.window = { addEventListener: () => {} };

console.log('perf-large-project — synthetic large project timing');

// ── generate a large project (untimed — just setup) ───────────────────
console.log('  generating 5,000 entities...');
localStorage.clear();
Store.load();
for (let i = 0; i < 5000; i++) {
  const type = ['character', 'location', 'item', 'concept'][i % 4];
  Store.createEntity({ name: `Entity ${i}`, type, description: `Description for entity ${i}.`.repeat(3) });
}

console.log('  generating 10,000 relationships...');
const entities = Store.getEntityList();
for (let i = 0; i < 10000; i++) {
  const fromId = entities[Math.floor(Math.random() * entities.length)].id;
  const toId = entities[Math.floor(Math.random() * entities.length)].id;
  if (fromId === toId) continue;
  Store.createRelationship({ fromId, toId, label: `rel_${i}` });
}

console.log('  generating 50 chapters × 50KB content...');
for (let i = 0; i < 50; i++) {
  const ch = Store.createChapter(`Chapter ${i + 1}`);
  const block = 'This is a paragraph of placeholder content for performance testing. '.repeat(15);
  const content = block.repeat(50); // ~50KB
  Store.updateChapterContent(ch.id, content);
}

const ents = Store.getEntityList();
const rels = Store.getRelationshipList();
console.log(`  done. ${ents.length} entities, ${rels.length} relationships, 50 chapters\n`);

// ── timed operations ───────────────────────────────────────────────────

// 1. JSON.stringify(_db) — save serialization cost
const strStart = performance.now();
const json = JSON.stringify(Store.getActiveDb());
const strTime = performance.now() - strStart;
const sizeMb = (json.length / (1024 * 1024)).toFixed(2);
ok('JSON.stringify(_db) under 2s', strTime < 2000, `${strTime.toFixed(0)}ms, ${sizeMb}MB`);

// 2. localStorage.setItem — full write cost
const setStart = performance.now();
localStorage.setItem('tinta:db', json);
const setTime = performance.now() - setStart;
ok('localStorage.setItem under 1s', setTime < 1000, `${setTime.toFixed(0)}ms`);

// 3. Store.save() — the full save path (serialize + write + notify)
const saveStart = performance.now();
Store.save();
const saveTime = performance.now() - saveStart;
ok('Store.save() under 2s', saveTime < 2000, `${saveTime.toFixed(0)}ms`);

// 4. getEntityList / getRelationshipList — render-path reads
const readStart = performance.now();
Store.getEntityList();
Store.getRelationshipList();
const readTime = performance.now() - readStart;
ok('getEntityList + getRelationshipList under 50ms', readTime < 50, `${readTime.toFixed(0)}ms`);

// 5. extractMentions on a 50KB chapter — passive-recognition scan cost
const chap = Store.getActiveProject().chapters[0];
const mentionStart = performance.now();
const mentions = Store.extractMentions(chap.content);
const mentionTime = performance.now() - mentionStart;
ok('extractMentions on 50KB chapter under 100ms', mentionTime < 100, `${mentionTime.toFixed(0)}ms (${mentions.length} mentions)`);

// 6. estimateDbSizeBytes — the quota-watcher's periodic check
const estStart = performance.now();
const estSize = Store.estimateDbSizeBytes();
const estTime = performance.now() - estStart;
ok('estimateDbSizeBytes under 500ms', estTime < 500, `${estTime.toFixed(0)}ms (${(estSize / (1024 * 1024)).toFixed(2)}MB estimate)`);

// 7. wordCount on a 50KB chapter — the editor calls this on every input
const wcStart = performance.now();
const words = Store.wordCount(chap.content);
const wcTime = performance.now() - wcStart;
ok('wordCount on 50KB chapter under 50ms', wcTime < 50, `${wcTime.toFixed(0)}ms (${words} words)`);

// 8. getContinuityReport — the Health view's main read (if it exists)
if (typeof Store.getContinuityReport === 'function') {
  const ccStart = performance.now();
  Store.getContinuityReport();
  const ccTime = performance.now() - ccStart;
  ok('getContinuityReport under 5s', ccTime < 5000, `${ccTime.toFixed(0)}ms`);
}

// ── summary ────────────────────────────────────────────────────────────
console.log(`\nperf-large-project.smoketest: ${passed} passed, ${failed} failed${failed === 0 ? ' — all green.' : ''}`);
console.log(`  db size: ${sizeMb}MB, ${ents.length} entities, ${rels.length} relationships, 50 chapters × 50KB`);
if (failed > 0) process.exit(1);
