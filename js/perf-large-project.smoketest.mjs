// Performance smoketest — synthetic large project (CR-45 redesign).
//
// The original version of this file generated 5,000 entities one-by-one
// through the full save path and thereby mostly measured CR-42's disease
// (a full JSON.stringify of the whole database on every single mutation —
// 5,000 increasingly expensive serializations). It also regularly ran for
// many minutes, which is how it ended up excluded from suite runs.
//
// After the storage epic (CR-41/CR-42) this is redesigned along the lines
// the review queue asked for: separate benchmarks for the operations that
// actually matter to the writer, measuring elapsed time (and memory),
// with generous sanity budgets instead of tight thresholds — a regression
// that 10x's anything here fires; a 2x wobble on a busy CI machine does
// not. It doubles as the CR-41/CR-42 acceptance gate:
//
//   1. batch import    — 5,000 entities + 10,000 relationships created in
//                        ONE task must produce exactly ONE persistence
//                        flush (the old code serialized the whole db
//                        15,000 times) and finish in seconds.
//   2. big-db flush    — one coalesced flush of the full ~2.5MB db
//                        (structured clone, no JSON string on the hot path).
//   3. db load         — boot from the persisted IndexedDB state.
//   4. editor typing   — 100 chapter-content saves, each with a landed
//                        flush: the per-save latency the writer feels.
//   5. render reads    — getEntityList / getRelationshipList.
//   6. passive scan    — extractMentions over a 50KB chapter.
//   7. quota watcher   — estimateDbSizeBytes (kept: settings/UI callers).
//   8. word count      — wordCount over a 50KB chapter (per-keystroke).
//
// Run with: node js/perf-large-project.smoketest.mjs

import { IDBFactory } from 'fake-indexeddb';
import * as Store from './store.js';

let passed = 0;
let failed = 0;
const timings = [];
function ok(name, cond, detail) {
  if (cond) { passed++; console.log(`  ok - ${name}${detail ? ` (${detail})` : ''}`); }
  else { failed++; console.log(`  NOT OK - ${name}${detail ? ` (${detail})` : ''}`); }
}
function bench(name, fn) {
  const t0 = performance.now();
  const value = fn();
  const ms = performance.now() - t0;
  timings.push({ name, ms });
  return { ms, value };
}
async function benchAsync(name, fn) {
  const t0 = performance.now();
  const value = await fn();
  const ms = performance.now() - t0;
  timings.push({ name, ms });
  return { ms, value };
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
globalThis.indexedDB = new IDBFactory();

console.log('perf-large-project — synthetic large project, CR-45 benchmark set\n');

// ── setup: generate the large project in ONE task (untimed) ────────────
console.log('  generating 5,000 entities + 10,000 relationships + 50 × 50KB chapters...');
localStorage.clear();
await Store.ready();
Store.createProject('Perf');

const genStart = performance.now();
for (let i = 0; i < 5000; i++) {
  const type = ['character', 'location', 'item', 'concept'][i % 4];
  Store.createEntity({ name: `Entity ${i}`, type, description: `Description for entity ${i}.`.repeat(3) });
}
const entities = Store.getEntityList();
for (let i = 0; i < 10000; i++) {
  const fromId = entities[Math.floor(Math.random() * entities.length)].id;
  const toId = entities[Math.floor(Math.random() * entities.length)].id;
  if (fromId === toId) continue;
  Store.createRelationship({ fromId, toId, label: `rel_${i}` });
}
const block = 'This is a paragraph of placeholder content for performance testing. '.repeat(15);
for (let i = 0; i < 50; i++) {
  const ch = Store.createChapter(`Chapter ${i + 1}`);
  Store.updateChapterContent(ch.id, block.repeat(50)); // ~50KB
}
const genMs = performance.now() - genStart;
console.log(`  generated in ${genMs.toFixed(0)}ms (all mutations still in memory — one flush pending)\n`);

// ── 1. big-db flush — one coalesced persistence write of the full db ───
{
  const heapBefore = process.memoryUsage().heapUsed;
  const { ms } = await benchAsync('big-db flush', () => Store.saveNow());
  const heapDelta = (process.memoryUsage().heapUsed - heapBefore) / (1024 * 1024);
  const sizeMb = (JSON.stringify(Store.getActiveDb()).length / (1024 * 1024)).toFixed(2);
  ok('big-db flush (structured clone, one write) under 5s', ms < 5000, `${ms.toFixed(0)}ms for ${sizeMb}MB db`);
  timings.push({ name: 'memory after flush (heap delta)', ms: heapDelta });
}

// ── 2. batch import shape — the CR-42 acceptance pin ────────────────────
{
  // 5,000 more entities in ONE task: exactly ONE flush, one rev bump.
  const revBefore = Store.getActiveDb().rev || 0;
  let flushes = 0;
  Store._setFlushInterceptorForTests(async () => { flushes++; });
  const { ms } = await benchAsync('batch 5,000 createEntity (one task)', async () => {
    for (let i = 0; i < 5000; i++) {
      Store.createEntity({ name: `Batch ${i}`, type: 'concept', description: 'batch row' });
    }
    await Store.saveNow();
  });
  Store._setFlushInterceptorForTests(null);
  const revAfter = Store.getActiveDb().rev || 0;
  ok('batch of 5,000 creates coalesced into ONE flush', flushes === 1, `${flushes} flush(es) — the old code serialized the whole db 5,000 times`);
  ok('batch advanced the rev exactly once', revAfter === revBefore + 1, `rev ${revBefore} → ${revAfter}`);
  ok('batch of 5,000 creates under 10s end-to-end', ms < 10000, `${ms.toFixed(0)}ms`);
}

// ── 3. db load — boot from persisted IndexedDB state ────────────────────
{
  Store._resetStoreForTests();
  localStorage.clear(); // force the load to come from the IDB primary
  const { ms } = await benchAsync('db load (IndexedDB boot)', () => Store.ready());
  const nEntities = Store.getEntityList().length;
  ok('db load of 10k entities + 50 chapters under 10s', ms < 10000, `${ms.toFixed(0)}ms, ${nEntities} entities after boot`);
}

// ── 4. editor typing — per-save latency with landed flushes ─────────────
{
  const chap = Store.getActiveProject().chapters.find((c) => c.title === 'Chapter 1') || Store.getActiveProject().chapters[0];
  const samples = [];
  for (let i = 0; i < 100; i++) {
    const t0 = performance.now();
    Store.updateChapterContent(chap.id, `${chap.content.slice(0, -2)} ${i}.`);
    await Store.saveNow();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const p50 = samples[50];
  const p95 = samples[95];
  timings.push({ name: 'editor save p50', ms: p50 });
  timings.push({ name: 'editor save p95', ms: p95 });
  // Budget note: fake-indexeddb clones structured values in JavaScript,
  // while real browsers do it natively in C++ — expect the real app to be
  // several times faster than this number. The app also autosaves on a
  // 1500ms debounce, so this worst-case per-save cost is not per-keystroke.
  // The documented next lever (if real-world profiling ever demands it) is
  // per-chapter object stores — see dbBackend.js's header.
  ok('editor save p95 under 250ms', p95 < 250, `p50 ${p50.toFixed(1)}ms / p95 ${p95.toFixed(1)}ms over 100 saves on a ~10MB db (fake-IDB clone cost)`);
}

// ── 5-8. render-path reads ──────────────────────────────────────────────
{
  const { ms: readMs } = bench('getEntityList + getRelationshipList', () => {
    Store.getEntityList();
    Store.getRelationshipList();
  });
  ok('render-path reads under 250ms', readMs < 250, `${readMs.toFixed(1)}ms for ~15k records`);
}
{
  const chap = Store.getActiveProject().chapters[0];
  const { ms: mMs, value: mentions } = bench('extractMentions 50KB', () => Store.extractMentions(chap.content));
  ok('extractMentions on 50KB chapter under 100ms', mMs < 100, `${mMs.toFixed(1)}ms (${mentions.length} mentions)`);
  const { ms: wcMs, value: words } = bench('wordCount 50KB', () => Store.wordCount(chap.content));
  ok('wordCount on 50KB chapter under 50ms', wcMs < 50, `${wcMs.toFixed(1)}ms (${words} words)`);
  const { ms: estMs, value: estSize } = bench('estimateDbSizeBytes', () => Store.estimateDbSizeBytes());
  ok('estimateDbSizeBytes under 500ms', estMs < 500, `${estMs.toFixed(1)}ms (${(estSize / (1024 * 1024)).toFixed(2)}MB estimate)`);
}

// ── summary table ───────────────────────────────────────────────────────
console.log('\n  timings (ms unless noted):');
for (const t of timings) {
  console.log(`    ${t.name.padEnd(40)} ${t.ms >= 0 ? t.ms.toFixed(1) : t.ms.toFixed(1)}`);
}
console.log(`\nperf-large-project.smoketest: ${passed} passed, ${failed} failed${failed === 0 ? ' — all green.' : ''}`);
if (failed > 0) process.exit(1);
