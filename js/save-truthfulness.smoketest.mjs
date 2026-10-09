// Tinta — save-truthfulness smoketest.
//
// Pins the contract behind the "editor says Saved when the save failed"
// bug: Store.updateChapterContent() must report whether the write actually
// LANDED, not merely whether it was attempted.
//
// Why this matters more than a cosmetic label: editor.js keeps a
// `lastSavedValue` watermark and skips the blur/unload flush when the
// textarea already equals it. The old code advanced that watermark
// unconditionally, so a failed persist didn't just paint a false "Saved" —
// it convinced the editor there was nothing left to flush, and the
// writer's prose was dropped on the next chapter switch. Store.save() has
// always returned a boolean; it was being swallowed one layer up.
//
// The editor half of the fix (only advancing the watermark on `true`) is
// DOM-bound and has no jsdom harness in this suite. What's pinned here is
// the store-side contract the editor now depends on — if this return value
// ever regresses to undefined, the editor silently goes back to lying.
//
// Same localStorage-shim harness as save-system.smoketest.mjs, including
// its _failNextWrites hook for forcing a quota failure.
//
// Run with: node save-truthfulness.smoketest.mjs

// ── localStorage shim ───────────────────────────────────────────────────
class LocalStorageShim {
  constructor() { this.store = new Map(); this._failNextWrites = 0; }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null; }
  setItem(key, value) {
    if (this._failNextWrites > 0) {
      this._failNextWrites--;
      const err = new Error('The quota has been exceeded.');
      err.name = 'QuotaExceededError';
      throw err;
    }
    this.store.set(key, String(value));
  }
  removeItem(key) { this.store.delete(key); }
  clear() { this.store.clear(); this._failNextWrites = 0; }
}
globalThis.localStorage = new LocalStorageShim();
globalThis.window = globalThis.window || { addEventListener() {}, removeEventListener() {} };

const Store = await import('./store.js');

// ── tiny test harness ───────────────────────────────────────────────────
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

// ── 1. Happy path — a landed write reports true ─────────────────────────
section('updateChapterContent — a write that lands reports true');
globalThis.localStorage.clear();
let chapterId = null;
{
  Store.createProject('Truthfulness');
  const chapter = Store.createChapter('Chapter One');
  chapterId = chapter.id;
  const persisted = Store.updateChapterContent(chapterId, 'The first real sentence.');
  assertEqual(persisted, true, 'returns true when localStorage accepts the write');
  assertEqual(Store.getChapter(chapterId).content, 'The first real sentence.', 'content is in the in-memory db');
  assert(
    globalThis.localStorage.getItem('tinta:db').includes('The first real sentence.'),
    'content actually reached localStorage, not just the in-memory db'
  );
}

// ── 2. Quota failure — must report false, not undefined ─────────────────
section('updateChapterContent — a quota failure reports false');
{
  globalThis.localStorage._failNextWrites = 1;
  const persisted = Store.updateChapterContent(chapterId, 'Prose written against a full disk.');
  assertEqual(persisted, false, 'returns false when localStorage throws');
  assert(persisted !== undefined, 'never returns undefined (the old swallowed-result shape)');
  assertEqual(
    Store.getChapter(chapterId).content,
    'Prose written against a full disk.',
    'in-memory db still holds the text, so Store\'s retry has something to flush'
  );
  assert(
    !globalThis.localStorage.getItem('tinta:db').includes('Prose written against a full disk.'),
    'and that text genuinely is NOT in storage yet — the false was honest'
  );
}

// ── 3. Missing chapter — the early return is a boolean too ──────────────
section('updateChapterContent — a missing chapter reports false');
{
  const persisted = Store.updateChapterContent('ch_does_not_exist', 'Nowhere.');
  assertEqual(persisted, false, 'the not-found early return is false, not undefined');
}

// ── 4. updateChapterPosition — same contract ────────────────────────────
section('updateChapterPosition — same truthful-return contract');
{
  assertEqual(
    Store.updateChapterPosition(chapterId, { cursorPos: 42, scrollTop: 100 }),
    true,
    'returns true when the position write lands'
  );
  assertEqual(
    Store.updateChapterPosition('ch_does_not_exist', { cursorPos: 1 }),
    false,
    'returns false for a chapter that does not exist'
  );
}

// ── 5. Cross-tab staleness — must report false too ──────────────────────
// Deliberately LAST: going stale is terminal for the module instance (the
// real recovery is a page reload, and store.js ships no reset hook), so
// anything after this point would save against a poisoned store.
section('updateChapterContent — cross-tab staleness reports false');
{
  Store._simulateStorageEvent(JSON.stringify({ rev: 9999, projects: {}, activeProjectId: null }));
  assertEqual(Store.isCrossTabStale(), true, 'store is marked stale after a newer-rev write from another tab');
  const persisted = Store.updateChapterContent(chapterId, 'Written in a stale tab.');
  assertEqual(persisted, false, 'returns false while stale rather than claiming success');
  assertEqual(
    Store.updateChapterPosition(chapterId, { cursorPos: 7 }),
    false,
    'position writes are equally honest while stale'
  );
}

console.log(`\n${pass} passed, ${fail} failed${fail ? '' : ' — all green'}.`);
if (fail > 0) {
  console.error('\nFailures:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
