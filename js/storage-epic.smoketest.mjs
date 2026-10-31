// Tinta — storage epic smoketest (CR-19, CR-41, CR-42).
//
// Pins the architecture batch that moves the primary database from
// localStorage to IndexedDB:
//
//   CR-19 — a transient IndexedDB OPEN failure no longer poisons a blob
//           store for the whole session: the rejected open promise is
//           evicted from the cache, the next operation genuinely retries,
//           with escalating backoff so a permanently-broken IndexedDB
//           can't be hot-looped either.
//   CR-42 — persistence is decoupled from mutations: hundreds of save()
//           calls in one task coalesce into ONE IndexedDB flush, no JSON
//           string is built on the hot path (structured clone instead),
//           and the rev advances once for the whole batch.
//   CR-41 — the primary db lives in 'tinta-db' (meta store + one record
//           per project). Legacy localStorage installs migrate on first
//           boot; the 'tinta:db' key becomes a bounded best-effort mirror
//           whose rev arbitrates against the primary at boot; deleted
//           projects don't resurrect (tombstones); a newer-schema primary
//           triggers the same downgrade quarantine + write lock the
//           localStorage path has always had; a missing/broken IndexedDB
//           falls back to the legacy localStorage backend for the session.
//
// Environment notes: each boot-path section drives a REAL boot through
// Store.ready() against fake-indexeddb, resetting module state between
// sections via Store._resetStoreForTests(). The no-IndexedDB fallback
// section runs first, while globalThis.indexedDB is still undefined.
//
// Run with: node storage-epic.smoketest.mjs

import 'fake-indexeddb';
import { IDBFactory } from 'fake-indexeddb';

// ── shims ────────────────────────────────────────────────────────────────
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
  get length() { return this.store.size; }
  key(i) { return [...this.store.keys()][i] ?? null; }
}
globalThis.localStorage = new LocalStorageShim();
globalThis.window = globalThis.window || { addEventListener() {}, removeEventListener() {} };
// NOTE: deliberately NO globalThis.indexedDB yet — the fallback section
// below needs the pre-IDB environment.

const Store = await import('./store.js');

// ── tiny test harness ────────────────────────────────────────────────────
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

// ── 1. Fallback backend: no IndexedDB → the legacy localStorage store ───
section('fallback — indexedDB unavailable → local backend, legacy truthful save()');
{
  globalThis.localStorage.clear();
  await Store.ready();
  assertEqual(Store.getStorageBackend(), 'local', 'ready() picks the local backend without IndexedDB');
  Store.createProject('Fallback');
  const chapter = Store.createChapter('Fallback chapter');
  const persisted = Store.updateChapterContent(chapter.id, 'Saved the old-fashioned way.');
  assertEqual(persisted, true, 'local backend keeps the synchronous truthful boolean');
  assert(
    globalThis.localStorage.getItem('tinta:db').includes('Saved the old-fashioned way.'),
    'content reached localStorage synchronously'
  );
}

// From here on, IndexedDB exists.
globalThis.indexedDB = new IDBFactory();

// ── 2. CR-41 — legacy localStorage install migrates on first IDB boot ───
section('migration — localStorage db moves into IndexedDB on first ready()');
{
  Store._resetStoreForTests();
  globalThis.localStorage.clear();
  // Seed a legacy two-project db EXACTLY as the pre-CR-41 build would have
  // left it on disk — a hand-built 'tinta:db' payload (migrate() backfills
  // any missing fields, so minimal project records are realistic). Doing
  // this through app-level calls would drag the emptyDb default project
  // into the seed and blur what the migration is proving.
  const legacyDb = {
    version: Store.SCHEMA_VERSION,
    activeProjectId: 'p1',
    projects: {
      p1: { id: 'p1', title: 'Legacy A', chapters: [{ id: 'c1', title: 'Chapter 1', order: 0, content: 'seeded prose A' }] },
      p2: { id: 'p2', title: 'Legacy B', chapters: [{ id: 'c2', title: 'Chapter 1', order: 0, content: 'seeded prose B' }] },
    },
  };
  globalThis.localStorage.setItem('tinta:db', JSON.stringify(legacyDb));
  const legacyRaw = globalThis.localStorage.getItem('tinta:db');
  assert(!!legacyRaw && legacyRaw.includes('Legacy B'), 'legacy seed written to tinta:db');

  // A "new session" boots against the same localStorage + a fresh IDB.
  Store._resetStoreForTests();
  globalThis.indexedDB = new IDBFactory();
  await Store.ready();
  assertEqual(Store.getStorageBackend(), 'idb', 'second boot prefers the idb backend');
  const titles = Store.listProjects().map((p) => p.title).sort();
  assertEqual(JSON.stringify(titles), JSON.stringify(['Legacy A', 'Legacy B']), 'both legacy projects migrated into the IDB primary');
  assert(globalThis.localStorage.getItem('tinta:db') !== null, "the 'tinta:db' mirror is retained (fallback + old-build compatibility)");
}

// ── 3. CR-41 — a fresh IDB boot reads meta + per-project records ────────
section('fresh boot — projects survive a reload from the IDB primary alone');
{
  Store._resetStoreForTests();
  globalThis.localStorage.clear(); // mirror gone — IDB must carry everything
  await Store.ready();
  const titles = Store.listProjects().map((p) => p.title).sort();
  assertEqual(JSON.stringify(titles), JSON.stringify(['Legacy A', 'Legacy B']), 'projects reloaded from IndexedDB with no mirror present');
  assert(Store.getStorageBackend() === 'idb', 'still on the idb backend');
}

// ── 4. CR-41 — tombstones: a deleted project must not resurrect ─────────
section('tombstones — deleting a project removes its record from the store');
{
  Store._resetStoreForTests();
  globalThis.localStorage.clear();
  await Store.ready();
  const victim = Store.listProjects().find((p) => p.title === 'Legacy B');
  Store.switchProject(victim.id);
  Store.deleteProject(victim.id);
  await Store.saveNow();
  Store._resetStoreForTests();
  globalThis.localStorage.clear();
  await Store.ready();
  const titles = Store.listProjects().map((p) => p.title);
  assert(!titles.includes('Legacy B'), 'deleted project did not resurrect on the next boot');
  assert(titles.includes('Legacy A'), 'the surviving project is intact');
}

// ── 5. CR-42 — coalesced flush: N mutations → ONE persistence write ─────
section('CR-42 — a 500-mutation task produces exactly one flush and one rev bump');
{
  Store._resetStoreForTests();
  globalThis.localStorage.clear();
  await Store.ready();
  const chapter = Store.getActiveProject().chapters[0];
  const bootRev = Store.getActiveDb().rev || 0;

  let flushCount = 0;
  Store._setFlushInterceptorForTests(async () => { flushCount++; }); // passes through to the real persist
  for (let i = 0; i < 500; i++) {
    Store.updateChapterContent(chapter.id, `Sentence number ${i}.`);
  }
  assertEqual(Store.getActiveDb().rev || 0, bootRev, 'rev has NOT advanced while the flush is still queued');
  const landed = await Store.saveNow();
  Store._setFlushInterceptorForTests(null);
  assertEqual(flushCount, 1, '500 save() calls coalesced into ONE flush');
  assertEqual(landed, true, 'saveNow() reports the landed result');
  assertEqual(Store.getActiveDb().rev || 0, bootRev + 1, 'the rev advanced exactly once for the whole batch');
  assertEqual(Store.getChapter(chapter.id).content, 'Sentence number 499.', 'the final state is what landed');
}

// ── 6. rev invariant under flush failure (extends save-rev-integrity) ───
section('rev invariant — a failed flush does not advance the rev, and retries land');
{
  Store._resetStoreForTests();
  globalThis.localStorage.clear();
  await Store.ready();
  const chapter = Store.getActiveProject().chapters[0];
  const bootRev = Store.getActiveDb().rev || 0;

  const quotaErr = new Error('The quota has been exceeded.');
  quotaErr.name = 'QuotaExceededError';
  let failuresLeft = 1;
  Store._setFlushInterceptorForTests(async () => {
    if (failuresLeft > 0) { failuresLeft--; throw quotaErr; }
  });

  const saveErrors = [];
  Store.onSaveError((d) => saveErrors.push(d.type));
  Store.updateChapterContent(chapter.id, 'Prose against a failing disk.');
  const refusedResult = await Store.saveNow();
  Store._setFlushInterceptorForTests(null);
  assertEqual(refusedResult, false, 'saveNow() honestly reports the failed flush');
  assertEqual(Store.getActiveDb().rev || 0, bootRev, 'the rev did NOT advance on the failed flush');
  assert(saveErrors.includes('quota'), 'the quota failure surfaced through onSaveError');
  assertEqual(Store.getChapter(chapter.id).content, 'Prose against a failing disk.', 'the in-memory db still holds the text for the retry');

  // The backoff retry is pending; force it now (same hook the storage
  // banner uses) and the flush lands. The retry flush runs asynchronously —
  // poll for the rev bump instead of assuming a tick boundary.
  Store._setFlushInterceptorForTests(null);
  const retryRan = Store._forceSaveRetryNow();
  assert(retryRan, 'a retry was actually scheduled after the failed flush');
  let landedRev = Store.getActiveDb().rev || 0;
  for (let i = 0; i < 200 && landedRev === bootRev; i++) {
    await new Promise((r) => setTimeout(r, 10));
    landedRev = Store.getActiveDb().rev || 0;
  }
  assertEqual(landedRev, bootRev + 1, 'the rev advanced only after the retry landed');
  assertEqual(Store.getChapter(chapter.id).content, 'Prose against a failing disk.', 'the retried flush carried the freshest text');
}

// ── 7. quota flush failure writes the CR-01 recovery snapshot ───────────
section('recovery — a quota-failing flush snapshots the unsaved state');
{
  Store._resetStoreForTests();
  globalThis.localStorage.clear();
  await Store.ready();
  const chapter = Store.getActiveProject().chapters[0];
  const bootRev = Store.getActiveDb().rev || 0;

  const quotaErr = new Error('quota exceeded');
  quotaErr.name = 'QuotaExceededError';
  Store._setFlushInterceptorForTests(async () => { throw quotaErr; });
  Store.updateChapterContent(chapter.id, 'The unsaved masterwork.');
  await Store.saveNow();
  Store._setFlushInterceptorForTests(null);
  // The snapshot write is fire-and-forget on the flush path (same as the
  // localStorage quota path) — poll for it rather than assuming a latency.
  let snapshot = null;
  for (let i = 0; i < 100 && !snapshot; i++) {
    await new Promise((r) => setTimeout(r, 25));
    snapshot = await Store.getRecoverySnapshot();
  }
  assert(!!snapshot, 'the quota-failing flush wrote a recovery snapshot');
  assert(
    JSON.stringify(snapshot).includes('The unsaved masterwork.'),
    'the snapshot holds the unsaved prose'
  );
  const { isSnapshotStale, getRecoverySnapshotMeta } = await import('./recoveryStore.js');
  const meta = await getRecoverySnapshotMeta();
  assertEqual(isSnapshotStale(snapshot, meta, bootRev), false, 'snapshot is NOT stale at the equal disk rev (CR-01 rule intact)');

  // A later successful save stales it (P2-7), and the store clears it.
  const landed = await Store.saveNow();
  assertEqual(landed, true, 'the follow-up flush lands once persistence works again');
  const cleared = await Store.getRecoverySnapshot();
  assertEqual(cleared, null, 'the successful flush cleared the now-stale snapshot');
}

// ── 8. cross-tab — BroadcastChannel-equivalent rev arbitration ──────────
section('cross-tab — a peer flush with a higher rev pauses this tab');
{
  Store._resetStoreForTests();
  globalThis.localStorage.clear();
  await Store.ready();
  const ourRev = Store.getActiveDb().rev || 0;
  Store._simulateCrossTabFlush(ourRev + 3);
  assert(Store.isCrossTabStale(), 'a higher peer rev marks the tab stale');
  const refused = Store.save();
  assertEqual(refused, false, 'save() refuses while the tab is stale (same contract as the storage-event path)');
}

// ── 9. CR-41 — newer-schema IDB db → downgrade quarantine + write lock ──
section('downgrade — a newer-schema primary is quarantined and locked');
{
  Store._resetStoreForTests();
  globalThis.localStorage.clear();
  // Seed 'tinta-db' directly with a future-version meta record, exactly
  // what a newer Tinta build would have left behind.
  {
    const req = indexedDB.open('tinta-db', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('meta');
      db.createObjectStore('projects');
    };
    const db = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['meta', 'projects'], 'readwrite');
      tx.objectStore('meta').put({ version: 99, rev: 7, activeProjectId: 'p1', projects: { p1: { id: 'p1' } } }, 'db');
      tx.objectStore('projects').put({ id: 'p1', title: 'From the future' }, 'p1');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }
  await Store.ready();
  assertEqual(Store.getStorageBackend(), 'idb', 'the boot reached the IDB backend');
  const warning = Store.consumeLoadWarning();
  assert(!!warning && warning.type === 'downgrade', 'the boot produced a downgrade load warning');
  assertEqual(Store.save(), false, 'saving is refused while the downgrade lock is on');
  assertEqual(Store.getActiveDb().projects && Object.keys(Store.getActiveDb().projects).length > 0, true, 'the session boots on a viable (empty-seed) db, not on the future data');
  assertEqual(Store.getActiveProject().title, 'My Novel', 'the future-schema data was NOT loaded into the session');
}

// ── 10. CR-19 — a transient open failure retries instead of poisoning ───
section('CR-19 — blob store survives a transient open failure');
{
  const { makeBlobStore } = await import('./makeBlobStore.js');
  const store = makeBlobStore('tinta-cr19-test');
  // Force the first open to fail exactly the way a browser hiccup does:
  // open() returns a request whose error event fires once, then every
  // later open passes through to the real factory. (A stub request, not a
  // half-poisoned real one — driving a real fake-indexeddb request into
  // the error state by hand leaves it internally inconsistent.)
  const realOpen = globalThis.indexedDB.open.bind(globalThis.indexedDB);
  let failNext = true;
  const injectedError = new Error('simulated transient IndexedDB open failure');
  injectedError.name = 'InvalidStateError';
  globalThis.indexedDB.open = (...args) => {
    if (!failNext) return realOpen(...args);
    failNext = false;
    return {
      error: injectedError,
      set onupgradeneeded(_fn) {},
      set onsuccess(_fn) {},
      set onblocked(_fn) {},
      set onerror(fn) { setImmediate(() => fn({ target: this })); },
      addEventListener() {},
      removeEventListener() {},
    };
  };

  const first = await store.putBlob('k', 'v').then(() => 'ok', (e) => `rejected: ${e?.name || e}`);
  assert(first.startsWith('rejected'), 'the transient failure rejects the first operation (honest error)');

  // The regression this pins: BEFORE the fix, every later call replayed
  // the cached rejection forever. Now the very next call reopens and lands.
  // The retry respects the failure backoff (250ms × 2 after one failure),
  // so wait it out — a real transient hiccup lasts longer than that anyway.
  globalThis.indexedDB.open = realOpen;
  await new Promise((r) => setTimeout(r, 600));
  const second = await store.putBlob('k', 'v').then(() => 'ok', (e) => `rejected: ${e?.name || e}`);
  assertEqual(second, 'ok', 'the next operation RETRIES the open instead of replaying the cached rejection');
  const readBack = await store.getBlob('k');
  assertEqual(readBack, 'v', 'the retried store is genuinely usable');
}

// ── summary ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('FAILURES:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
