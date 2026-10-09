// Tinta — save-system smoketest (cross-tab stale guard, save retry,
// storage-headroom warning).
//
// Pure-logic test of store.js's save() redesign (the "three time bombs"
// pass): cross-tab last-writer-wins detection, failed-save retry with
// backoff, and the proactive storage-headroom warning. No DOM, no UI —
// the bug-report fix covered here (a pending retry bypassing the
// cross-tab stale guard) lives entirely in store.js and the module
// already ships test-only hooks (_simulateStorageEvent, getSaveRetryState,
// _forceSaveRetryNow) built specifically to drive these paths without a
// real second browser tab.
//
// NOT covered here: the companion app.js fix for the same bug-report pass
// (the storage-headroom banner being wiped in the same tick it was shown
// by an unrelated onSaveSuccess handler). That fix lives in a closure
// variable inside app.js's init(), which is DOM-dependent and has no
// jsdom harness in this suite — noted rather than silently skipped.
//
// Run with: node save-system.smoketest.mjs

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

// store.js registers a real `window.addEventListener('storage', ...)` via
// ensureCrossTabListener() — give it a minimal window so that registration
// doesn't throw, though the test drives handleStorageEvent directly via
// _simulateStorageEvent rather than relying on a real cross-window event.
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

// ── 1. Baseline — save/reload round-trips, no false staleness ──────────
section('baseline — plain save succeeds, no staleness');
globalThis.localStorage.clear();
{
  Store.createProject('Baseline');
  assertEqual(Store.isCrossTabStale(), false, 'not stale on a fresh load');
  assertEqual(Store.getSaveRetryState().pending, false, 'no retry pending on a fresh load');
  const ok = Store.save();
  assertEqual(ok, true, 'save() succeeds when nothing is wrong');
}

// ── 2. Failed save schedules a retry ────────────────────────────────────
// Must run before any cross-tab-stale section below: _crossTabStale is a
// module-level singleton with no test reset hook (by design — going stale
// is only ever meant to clear via a real page reload), so once a later
// section sets it, every section after that would short-circuit through
// save()'s stale guard before reaching whatever it meant to exercise.
section('failed save — schedules a retry with backoff');
globalThis.localStorage.clear();
{
  Store.createProject('RetryTest');
  let errorDetail = null;
  Store.onSaveError((detail) => { errorDetail = detail; });
  globalThis.localStorage._failNextWrites = 1;
  const ok = Store.save();
  assertEqual(ok, false, 'save() returns false when the write throws');
  assert(errorDetail && errorDetail.type === 'quota', 'onSaveError fired with type "quota" for a QuotaExceededError');
  assertEqual(Store.getSaveRetryState().pending, true, 'a retry is scheduled after a failed save');
  Store._forceSaveRetryNow(); // drain it so it can't fire mid-way through a later section
}

// ── 3. Storage-headroom warning — fires once, re-arms with hysteresis ──
// Also must run before this tab goes stale, for the same reason as above.
section('storage headroom — fires once past threshold, re-arms below the reset ratio');
globalThis.localStorage.clear();
{
  Store.createProject('HeadroomTest');
  let warningCount = 0;
  let lastBytes = 0;
  Store.onStorageHeadroom(({ bytes }) => { warningCount++; lastBytes = bytes; });

  // Pad the project with a large note field to cross the ~4MB threshold
  // without needing thousands of real chapters.
  const project = Store.getActiveProject();
  project.notes = 'x'.repeat(5 * 1024 * 1024); // ~5MB of padding, well past the 4MB warning line
  Store.save();
  assertEqual(warningCount, 1, 'onStorageHeadroom fires exactly once when crossing the threshold');
  assert(lastBytes > 4 * 1024 * 1024, 'reported size is past the 4MB threshold');

  Store.save(); // still over threshold — must not fire again (the latch)
  assertEqual(warningCount, 1, 'does not re-fire on a subsequent save while still over threshold');

  // Shrink back below the reset ratio (90% of 4MB) and confirm it re-arms.
  project.notes = '';
  Store.save();
  project.notes = 'x'.repeat(5 * 1024 * 1024);
  Store.save();
  assertEqual(warningCount, 2, 're-arms and fires again after dropping below the hysteresis floor and climbing back up');
}

// ── 4. Bug-report regression — going stale while a retry is pending ─────
// cancels the retry, instead of letting it fire later and clobber the
// newer tab's write with no guard at all. Run last: this section
// permanently stales the module for the rest of the process.
section('bug-report fix — stale detection cancels a pending retry');
globalThis.localStorage.clear();
{
  Store.createProject('RaceTest');
  let conflictDetail = null;
  Store.onCrossTabConflict((detail) => { conflictDetail = detail; });

  globalThis.localStorage._failNextWrites = 1;
  Store.save(); // fails, schedules a retry
  assertEqual(Store.getSaveRetryState().pending, true, 'precondition — retry is pending before the race');

  // Tab B (this tab) is now behind. Simulate tab A writing a newer rev
  // while tab B's retry is still sitting in its backoff window — this is
  // exactly the sequence from the bug report.
  Store._simulateStorageEvent(JSON.stringify({ rev: 99, projects: {}, activeProjectId: null }));

  assertEqual(Store.isCrossTabStale(), true, 'this tab is now marked stale');
  assert(conflictDetail && conflictDetail.incomingRev === 99, 'onCrossTabConflict fired with the incoming rev');
  assertEqual(Store.getSaveRetryState().pending, false, 'the pending retry was cancelled by going stale (the fix)');

  // Defense in depth — even if something tried to force the retry through
  // anyway, it must be a no-op now that no retry is scheduled...
  const forced = Store._forceSaveRetryNow();
  assertEqual(forced, false, '_forceSaveRetryNow() is a no-op once stale (no retry left to force)');
  // ...and the underlying write path itself refuses to write while stale,
  // regardless of which entry point reaches it (the second half of the fix).
  const ok = Store.save();
  assertEqual(ok, false, "save() still refuses to write post-race — the stale tab never wrote its rev over tab A's newer one");
}

// ── summary ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('\nFailures:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
