// Tinta — search hardening smoketest (CR-43).
//
// Pins the "user-supplied regex can't freeze the app" batch. The bug it
// closes: searchProject() ran synchronously on the main thread, once per
// keystroke, with no execution limit on the user's regex — a pattern
// like (a+)+$ against the wrong manuscript line backtracked exponentially
// and locked the whole app up. The fix is layered, and each layer has
// its own pins here:
//
//   ENGINE (search.js) — cooperative wall-clock budget checked between
//     match attempts, a global result cap, category slicing for
//     yield-able runs, and `stopped` reported honestly on every result.
//   RUNNER (searchTaskRunner.js) — one slice-per-category loop shared by
//     both backends; merged slices must equal a single full search.
//   SERVICE (searchService.js) — run tokens (stale results discarded,
//     cancel doesn't poison the next run), the main-thread fallback
//     backend, and the HARD watchdog that terminates a worker stuck
//     inside a single catastrophic exec() (driven here by a fake wedged
//     Worker; the real-browser kill path is pinned by
//     tests/16-search-regex-freeze.spec.js).
//   STORE (store-manuscript.js) — applyReplacePlan accepts a precomputed
//     plan and refuses countsOnly plans (newContent: null) instead of
//     nulling chapter content.
//
// What's NOT covered here and why: searchView.js (DOM-only, the standing
// gap every smoketest leaves for its view layer — the Playwright spec
// drives it for real), and the engine's per-iteration budget under a
// genuine mid-scan stop (timing-dependent by nature; budget-0 pins the
// mechanics deterministically instead).
//
// Run with: node search-hardening.smoketest.mjs

class LocalStorageShim {
  constructor() { this.store = new Map(); }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null; }
  setItem(key, value) { this.store.set(key, String(value)); }
  removeItem(key) { this.store.delete(key); }
  clear() { this.store.clear(); }
}
globalThis.localStorage = new LocalStorageShim();

const Store = await import('./store.js');
const SearchEngine = await import('./search.js');
const Runner = await import('./searchTaskRunner.js');
const SearchService = await import('./searchService.js');

// ── tiny test harness (same convention as every other *.smoketest.mjs) ──
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

await Store.ready();
Store.createProject('Search hardening');

// ── fixture (plain project shape, no store involvement) ────────────────
function makeFixture() {
  return {
    chapters: [
      { id: 'c1', title: 'The Castle Gate', docType: 'chapter', content: 'castle rock castle stone', status: 'draft' },
      { id: 'c2', title: 'The Harbor', docType: 'chapter', content: 'salt and rope, no castle here', status: 'final' },
    ],
    entities: {
      e1: { id: 'e1', name: 'Elena', type: 'character', description: 'warden of Castle Varo', tags: ['protagonist', 'castle-guard'], canonStatus: 'canon' },
      e2: { id: 'e2', name: 'Marlow', type: 'character', description: 'a harbor pilot', tags: [], canonStatus: 'draft' },
    },
    scenes: [],
    snippets: {
      s1: { id: 's1', text: 'castle in the fog', createdAt: '2025-01-01T00:00:00Z' },
    },
    timelineEvents: {},
    references: {},
    annotations: {},
    ruleSystems: {},
    maps: {},
    systemNodes: {},
    chapterTypes: [{ key: 'chapter', role: 'content' }],
    parts: [],
    folders: [],
  };
}

section('engine — regression: normal search still works and reports completed honestly');
{
  const r = SearchEngine.searchProject(makeFixture(), 'castle');
  assertEqual(r.chapters.length, 2, 'both chapters match "castle"');
  assertEqual(r.chapters[0].matches.length, 2, 'chapter c1 has 2 matches');
  assertEqual(r.chapters[1].matches.length, 1, 'chapter c2 has 1 match');
  assertEqual(r.entities.length, 1, 'one entity mentions castle');
  assertEqual(r.snippets.length, 1, 'one snippet matches');
  assertEqual(r.stopped, null, 'a completed run reports stopped: null (not "stopped")');
  for (const cat of Runner.SEARCH_CATEGORIES) {
    assert(Array.isArray(r[cat]), `result shape carries an array for "${cat}"`);
  }
}

section('engine — category slicing (onlyCategories) matches a full search');
{
  const full = SearchEngine.searchProject(makeFixture(), 'castle');
  for (const cat of Runner.SEARCH_CATEGORIES) {
    const slice = SearchEngine.searchProject(makeFixture(), 'castle', { onlyCategories: [cat] });
    for (const other of Runner.SEARCH_CATEGORIES) {
      if (other === cat) continue;
      assertEqual(slice[other].length, 0, `slice for "${cat}" leaves "${other}" empty`);
    }
    assertEqual(JSON.stringify(slice[cat]), JSON.stringify(full[cat]), `slice for "${cat}" equals the full search's "${cat}"`);
    assertEqual(slice.stopped, null, 'an unbudgeted slice reports completed');
  }
}

section('runner — sliced run (one category per slice, yields between) merges to the full result');
{
  const full = SearchEngine.searchProject(makeFixture(), 'castle');
  const run = await Runner.runSlicedSearch({ project: makeFixture(), query: 'castle', options: {} });
  assertEqual(run.cancelled, false, 'an uncancelled run says so');
  assertEqual(run.stopped, null, 'a completed run has stopped: null');
  assertEqual(JSON.stringify(run.results.chapters), JSON.stringify(full.chapters), 'merged chapters equal the full search');
  assertEqual(JSON.stringify(run.results.entities), JSON.stringify(full.entities), 'merged entities equal the full search');
  assertEqual(JSON.stringify(run.results.snippets), JSON.stringify(full.snippets), 'merged snippets equal the full search');
}

section('runner — runner.isCancelled is honored between slices');
{
  let calls = 0;
  const run = await Runner.runSlicedSearch({
    project: makeFixture(),
    query: 'castle',
    options: {},
    isCancelled: () => ++calls > 1, // cancel after the first slice
  });
  assertEqual(run.cancelled, true, 'a run cancelled mid-way reports cancelled');
  assertEqual(run.results.chapters.length, 2, 'the first slice (chapters) still completed before the cancel was observed');
  assert(calls > 1, 'the cancel check ran more than once');
}

section('engine — global result cap stops the run and says "matches"');
{
  const big = {
    chapters: Array.from({ length: 150 }, (_, i) => ({
      id: `b${i}`, title: `Chapter ${i + 1}`, docType: 'chapter', content: 'x'.repeat(25) + ' filler',
    })),
    entities: {}, scenes: {}, snippets: {}, timelineEvents: {}, references: {}, annotations: {}, ruleSystems: {}, maps: {}, systemNodes: {},
    chapterTypes: [], parts: [], folders: [],
  };
  // 150 fields × up to 20 matches each = 3000 potential; the global cap
  // (2000) must trip first and be reported, with exactly-capped counts.
  const r = SearchEngine.searchProject(big, 'x');
  assert(r.stopped !== null, 'a cap-tripping run reports stopped');
  assertEqual(r.stopped && r.stopped.reason, 'matches', 'the stop reason is the match cap');
  const total = SearchEngine.countTotalMatches(r);
  assertEqual(total, 2000, 'exactly the cap\'s worth of matches came back — no more, no undercount');
  assertEqual(r.chapters.length, 100, 'exactly 100 chapters carry the capped 20 matches each');
}

section('engine — a zero time budget stops deterministically and reports "time"');
{
  const r = SearchEngine.searchProject(makeFixture(), 'castle', { budgetMs: 0 });
  assert(r.stopped !== null, 'budget-0 run reports stopped');
  assertEqual(r.stopped.reason, 'time', 'the stop reason is the time budget');
  assertEqual(SearchEngine.countTotalMatches(r), 0, 'the first match attempt is past the deadline — zero matches survive');
  for (const cat of Runner.SEARCH_CATEGORIES) {
    assertEqual(r[cat].length, 0, `"${cat}" is honestly empty rather than partially scanned`);
  }
  // And the unbounded/normal default still completes on the same fixture.
  const ok = SearchEngine.searchProject(makeFixture(), 'castle', { budgetMs: null });
  assertEqual(ok.stopped, null, 'budgetMs: null means unbounded — the run completes');
}

section('replace plan — budgeted builder, countsOnly, legacy wrapper equivalence');
{
  const project = makeFixture();
  const built = SearchEngine.buildReplacePlan(project, 'castle', 'keep');
  assertEqual(built.stopped, null, 'an unbudgeted plan reports completed');
  assertEqual(built.plan.length, 2, 'both chapters are in the plan');
  assertEqual(built.plan[0].count, 2, 'chapter c1 plan count is 2');
  assertEqual(built.plan[0].newContent, 'keep rock keep stone', 'newContent is fully computed for a real plan');
  const legacy = SearchEngine.planChapterReplace(project, 'castle', 'keep');
  assertEqual(JSON.stringify(legacy), JSON.stringify(built.plan), 'planChapterReplace keeps its exact legacy shape (plan only, no stopped wrapper)');
  const counts = SearchEngine.buildReplacePlan(project, 'castle', '', { countsOnly: true });
  assertEqual(counts.plan[0].count, 2, 'countsOnly still counts');
  assertEqual(counts.plan[0].newContent, null, 'countsOnly does NOT build newContent (the preview never shows it)');
  const zero = SearchEngine.buildReplacePlan(project, 'castle', 'keep', { budgetMs: 0 });
  assertEqual(zero.plan.length, 0, 'a budget-0 plan is empty, not partially applied');
  assertEqual(zero.stopped && zero.stopped.reason, 'time', 'the budget-0 plan reports stopped: time');
  let threw = false;
  try { SearchEngine.buildReplacePlan(project, '[unterminated', 'x', { useRegex: true }); } catch { threw = true; }
  assert(!threw, 'an invalid regex plan is a safe no-op, not a throw');
}

section('store — applyReplacePlan applies a real plan (snapshot first), refuses a countsOnly plan');
{
  const chapter = Store.createChapter('Replace target');
  Store.updateChapterContent(chapter.id, 'one castle two castle three');
  const { plan } = SearchEngine.buildReplacePlan(Store.getActiveProject(), 'castle', 'keep');
  Store.applyReplacePlan(plan, { query: 'castle', replacement: 'keep' });
  const content = Store.getActiveProject().chapters.find((c) => c.id === chapter.id).content;
  assertEqual(content, 'one keep two keep three', 'the precomputed plan was applied to chapter content');
  const snaps = Store.getSnapshots(chapter.id);
  assertEqual(snaps.length, 1, 'exactly one snapshot was taken before the change');
  assert(snaps[0].label.includes('Before find/replace'), 'the snapshot label identifies the replace');
  assertEqual(SearchEngine.searchProject(Store.getActiveProject(), 'castle').chapters.length, 0, 'post-apply, the old query no longer matches');

  // A countsOnly plan must never be applied — its newContent is null and
  // assigning it would blank the chapter.
  const contentBefore = Store.getActiveProject().chapters.find((c) => c.id === chapter.id).content;
  const snapshotCountBefore = Store.getSnapshots(chapter.id).length;
  const countsPlan = SearchEngine.buildReplacePlan(Store.getActiveProject(), 'keep', 'gone', { countsOnly: true });
  Store.applyReplacePlan(countsPlan.plan, { query: 'keep', replacement: 'gone' });
  const contentAfter = Store.getActiveProject().chapters.find((c) => c.id === chapter.id).content;
  assertEqual(contentAfter, contentBefore, 'a countsOnly plan (newContent: null) is NOT applied — content survives');
  assertEqual(Store.getSnapshots(chapter.id).length, snapshotCountBefore, 'a countsOnly plan takes no snapshot either');
}

section('service — Node (no Worker) uses the main-thread fallback backend and completes');
{
  assertEqual(SearchService._isWorkerBacked(), false, 'Node has no Worker — the service reports fallback');
  const outcome = await SearchService.runSearch(makeFixture(), 'castle');
  assertEqual(outcome.status, 'ok', 'the fallback run completes');
  assertEqual(outcome.backend, 'main', 'the fallback backend is honest about being main-thread');
  assertEqual(outcome.stopped, null, 'a completed run has stopped: null');
  assertEqual(outcome.results.chapters.length, 2, 'fallback results are real results');
  assert(outcome.replacePlanCounts !== null, 'fallback computes replace preview counts');
  assertEqual(outcome.replacePlanCounts.chapterCount, 2, 'preview counts: 2 chapters');
  assertEqual(outcome.replacePlanCounts.matchTotal, 3, 'preview counts: 3 matches');
  assertEqual(outcome.replacePlanCounts.stopped, null, 'preview counts completed');
}

section('service — a zero-budget run through the service reports stopped and skips replace counts');
{
  const outcome = await SearchService.runSearch(makeFixture(), 'castle', { budgetMs: 0 });
  assertEqual(outcome.status, 'ok', 'a stopped run is still a resolved, renderable outcome');
  assert(outcome.stopped !== null && outcome.stopped.reason === 'time', 'the stop is reported with reason "time"');
  assertEqual(outcome.replacePlanCounts, null, 'replace counts are withheld when the search was partial — no replace on bad numbers');
}

section('service — runReplacePlan resolves a real plan on the fallback backend');
{
  const outcome = await SearchService.runReplacePlan(makeFixture(), 'castle', 'keep', {});
  assertEqual(outcome.status, 'ok', 'the plan run completes');
  assertEqual(outcome.backend, 'main', 'fallback backend reported');
  assertEqual(outcome.plan.length, 2, 'plan covers both chapters');
  assertEqual(outcome.plan[0].newContent, 'keep rock keep stone', 'plan carries newContent');
  assertEqual(outcome.stopped, null, 'plan completed');
}

section('service — cancelActive resolves the in-flight run as cancelled, and does NOT poison the next run');
{
  const first = SearchService.runSearch(makeFixture(), 'castle');
  SearchService.cancelActive();
  const cancelledOutcome = await first;
  assertEqual(cancelledOutcome.status, 'cancelled', 'the in-flight run resolves cancelled');
  // The CR-19 lesson applied to search: a failed/cancelled operation
  // must not leave the service unable to serve the next one.
  const second = await SearchService.runSearch(makeFixture(), 'castle');
  assertEqual(second.status, 'ok', 'the NEXT run after a cancel completes normally');
  assertEqual(second.results.chapters.length, 2, 'and returns real results');
}

section('service — the hard watchdog terminates a wedged worker and reports a hard stop');
{
  // Fake a worker that swallows postMessage and never replies — the
  // "single catastrophic exec() never returns control" case that no
  // cooperative check inside the worker can catch.
  class WedgedWorker {
    constructor() { this.onmessage = null; this.onerror = null; }
    postMessage() { /* swallowed — no reply ever */ }
    terminate() { /* the service calls this on watchdog fire */ }
  }
  globalThis.Worker = WedgedWorker;
  SearchService._resetForTests();
  try {
    assertEqual(SearchService._isWorkerBacked(), true, 'with a Worker global, the service arms the worker backend');
    const t0 = Date.now();
    const outcome = await SearchService.runSearch(makeFixture(), 'castle', { budgetMs: 30 });
    const elapsed = Date.now() - t0;
    assertEqual(outcome.status, 'ok', 'the watchdog outcome resolves (never hangs the caller)');
    assertEqual(outcome.backend, 'worker', 'the watchdog path is the worker path');
    assert(outcome.stopped !== null && outcome.stopped.hard === true, 'the stop is flagged HARD (terminated, not cooperative)');
    assertEqual(outcome.results.chapters.length, 0, 'no partials survive a hard stop — honest emptiness');
    assert(elapsed >= 1400, `the watchdog waited budget + grace (30 + 1500ms) before firing — took ${elapsed}ms`);
    assert(elapsed < 6000, 'the watchdog fired in bounded time instead of hanging forever');

    // Respawn: after a terminate, the NEXT run must build a fresh worker
    // (backend stays 'worker') rather than latching to fallback or dying.
    const outcome2 = await SearchService.runSearch(makeFixture(), 'castle', { budgetMs: 30 });
    assertEqual(outcome2.backend, 'worker', 'the next run respawns a worker instead of latching to fallback');
    assert(outcome2.stopped !== null && outcome2.stopped.hard === true, 'the respawned run gets the same watchdog protection');
  } finally {
    delete globalThis.Worker;
    SearchService._resetForTests();
  }
}

section('service — post-reset, the plain fallback path still works (clean teardown)');
{
  const outcome = await SearchService.runSearch(makeFixture(), 'castle');
  assertEqual(outcome.status, 'ok', 'after test cleanup the service still serves searches');
  assertEqual(outcome.backend, 'main', 'and is back on the fallback backend with no Worker global');
}

// ── summary ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
process.exit(0);
