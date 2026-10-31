// CR-01..CR-05 urgent-batch smoketest (code review pass, 2026-10-31).
//
// Pins the five urgent findings from the review report, in the order
// they were fixed:
//
//   CR-01 (P0) — the quota-recovery snapshot was always destroyed at
//      boot. _db.rev only advances after a SUCCESSFUL localStorage
//      write, so a snapshot taken on the quota-failure path always
//      carried a rev EQUAL to disk, and recoveryToast's old rule
//      ("snapshot.rev <= disk.rev → stale") silently deleted it — the
//      rescue path was unreachable code that actively destroyed the
//      only copy of the writer's unsaved work. Fixed by recording
//      diskRevAtSnapshot alongside the payload and making the boot
//      check timeline-aware (isSnapshotStale): stale only when disk
//      has moved PAST the snapshot. Covered three ways here:
//        a. pure rule pins, including the exact equality case that
//           used to destroy the snapshot (legacy snapshots with no
//           meta record included),
//        b. a meta round-trip through the real IndexedDB store,
//        c. an END-TO-END quota failure through store-core's real
//           writeToLocalStorage (localStorage shim with injected
//           QuotaExceededError + fake-indexeddb), asserting the
//           snapshot lands, carries the unsaved prose, is classified
//           NOT stale at equal disk rev, and is cleared by a
//           successful retry — plus the inverse (a later successful
//           save DOES stale it).
//
//   CR-02 (P1) — importFullBackup kept a grammar object from the file
//      verbatim, so a crafted backup could silently re-point the
//      grammar checker (enabled + endpointUrl + apiKey) at any host —
//      an exfiltration channel on the first Grammar click. Fixed by
//      deleting the grammar block pre-migrate; migrate() backfills the
//      canonical safe shell. Pins: hostile values gone, safe default
//      shell present, the imported project itself intact, and a
//      grammar-less backup still importing cleanly.
//
//   CR-03 (P1) — the entity image-gallery modal title interpolated
//      entity.name unescaped into openModal's raw() title sink (the
//      one surviving stored-XSS site; every sibling call site already
//      escaped). Static pins on the fixed call site.
//
//   CR-04 (P1) — the overlay's metric-parity switch. Behavioral pins
//      for renderEditorParagraph's keepMarkers mode live in
//      editor-paragraph.smoketest.mjs (marker-preserving output,
//      unchanged default); this file pins that the editor overlay
//      actually passes keepMarkers: true.
//
//   CR-05 (P1) — IME composition guards. Static pins that
//      isImeComposing exists and that all three textarea keydown
//      handlers (mention popup, typewriter sounds, Ctrl+B/I/U) return
//      early on it, with the popup guard ordered BEFORE the visibility
//      check so a visible popup can't intercept composition keys.
//
// Run with: node cr-urgent-batch.smoketest.mjs

// ── shims (same pattern as save-system.smoketest.mjs) ──────────────────
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

// fake-indexeddb — same Node IndexedDB shim the other smoketests use
// (recoveryStore's blob stores land there).
import 'fake-indexeddb/auto';

import * as Store from './store.js';
// replaceDb is a store-core export (importFullBackup uses it internally);
// the Store barrel intentionally keeps its surface at the public contract.
import { replaceDb, _forceSaveRetryNow } from './store-core.js';
import { importFullBackup } from './store-backup.js';
import {
  saveRecoverySnapshot,
  getRecoverySnapshotMeta,
  isSnapshotStale,
} from './recoveryStore.js';
import fs from 'node:fs';

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name); console.error(`  ✗ ${name}${detail ? ` (${detail})` : ''}`); }
}
function section(t) { console.log(`\n${t}`); }
const settle = () => new Promise((r) => setTimeout(r, 50));

function makeProject(id, title, chapterContent) {
  return {
    id, title,
    chapters: [{ id: `${id}-c1`, title: 'Chapter One', content: chapterContent }],
  };
}

// ── CR-01a — isSnapshotStale rule pins ─────────────────────────────────
section('CR-01 — isSnapshotStale rule pins');
ok('equality (snapshot rev === disk rev) is NOT stale — the case that destroyed snapshots',
  isSnapshotStale({ rev: 42 }, {}, 42) === false);
ok('equality with meta record is NOT stale',
  isSnapshotStale({ rev: 42 }, { diskRevAtSnapshot: 42 }, 42) === false);
ok('disk moved past the snapshot → stale (retry succeeded elsewhere)',
  isSnapshotStale({ rev: 42 }, { diskRevAtSnapshot: 42 }, 43) === true);
ok('legacy snapshot (no meta) with disk past it → stale',
  isSnapshotStale({ rev: 42 }, {}, 43) === true);
ok('meta diskRevAtSnapshot takes precedence over payload rev',
  isSnapshotStale({ rev: 99 }, { diskRevAtSnapshot: 42 }, 43) === true,
  'payload rev 99 must not mask diskRevAtSnapshot 42 vs disk 43');
ok('missing snapshot → stale (nothing to offer)',
  isSnapshotStale(null, {}, 5) === true);
ok('missing revs treated as 0 → not stale at disk 0 (fresh boot, empty disk)',
  isSnapshotStale({}, {}, 0) === false);

// ── CR-01b — meta round-trip through the real blob store ───────────────
section('CR-01 — snapshot meta round-trip');
ok('saveRecoverySnapshot stores the meta record',
  await saveRecoverySnapshot({ rev: 7, projects: {} }, { diskRevAtSnapshot: 7 }) === true);
ok('getRecoverySnapshotMeta reads it back',
  (await getRecoverySnapshotMeta()).diskRevAtSnapshot === 7);
const { clearRecoverySnapshot } = await import('./recoveryStore.js');
await clearRecoverySnapshot();
ok('clearRecoverySnapshot removes the meta record too',
  Object.keys(await getRecoverySnapshotMeta()).length === 0);
ok('meta absent for legacy-style snapshot → {} (fallback path)',
  (await (async () => { await saveRecoverySnapshot({ rev: 8, projects: {} }); return getRecoverySnapshotMeta(); })()).constructor === Object);
await clearRecoverySnapshot();

// ── CR-02 — hostile grammar block in a full backup ─────────────────────
section('CR-02 — importFullBackup neutralizes the grammar block');
globalThis.localStorage.clear();
const hostileBackup = JSON.stringify({
  version: Store.SCHEMA_VERSION,
  rev: 5,
  projects: { p1: makeProject('p1', 'Imported', 'imported chapter') },
  activeProjectId: 'p1',
  grammar: { enabled: true, endpointUrl: 'https://evil.example/collect', apiKey: 'sk-steal', username: 'writer' },
});
const restoredDb = await importFullBackup(hostileBackup);
const gs = Store.getGrammarSettings();
ok('grammar checker is NOT enabled after restore', !gs.enabled, JSON.stringify(gs));
ok('hostile endpoint is gone', gs.endpointUrl !== 'https://evil.example/collect');
ok('endpoint backfilled to the stock LanguageTool URL',
  gs.endpointUrl === 'https://api.languagetool.org/v2/check', `got ${gs.endpointUrl}`);
ok('no attacker-supplied apiKey survives', !gs.apiKey);
ok('no attacker-supplied username survives', !gs.username);
ok('the imported project itself landed intact',
  Store.load().projects?.p1?.chapters?.[0]?.content === 'imported chapter');
ok('restore reported the imported db', restoredDb?.projects?.p1?.title === 'Imported');

section('CR-02 — grammar-less backup still imports with the safe shell');
globalThis.localStorage.clear();
const cleanBackup = JSON.stringify({
  version: Store.SCHEMA_VERSION,
  projects: { p2: makeProject('p2', 'Clean', 'clean chapter') },
  activeProjectId: 'p2',
});
importFullBackup(cleanBackup);
const gs2 = Store.getGrammarSettings();
ok('clean import still gets the safe default shell',
  gs2.enabled === false && gs2.endpointUrl === 'https://api.languagetool.org/v2/check' && gs2.apiKey === '');
ok('clean import content intact', Store.load().projects?.p2?.chapters?.[0]?.content === 'clean chapter');

// ── CR-01c — end-to-end quota failure through the real save path ───────
section('CR-01 — end-to-end: quota failure → snapshot survives boot check');
globalThis.localStorage.clear();
await clearRecoverySnapshot();

// 1. Land a good save: disk rev becomes 1.
replaceDb({ version: Store.SCHEMA_VERSION, rev: 0, projects: { p1: makeProject('p1', 'Work', 'saved prose') }, activeProjectId: 'p1' });
ok('first save lands (rev 1)', Store.save() === true && Store.getActiveDb().rev === 1);

// 2. Mutate in memory (as the writer keeps typing), then force the NEXT
//    localStorage write to fail with a real QuotaExceededError.
const unsavedDb = JSON.parse(JSON.stringify(Store.getActiveDb()));
unsavedDb.projects.p1.chapters[0].content = 'precious unsaved prose';
unsavedDb.rev = 1; // in-memory rev is still the last SUCCESSFUL save's rev
replaceDb(unsavedDb);
globalThis.localStorage._failNextWrites = 1;
ok('save fails under quota', Store.save() === false);
await settle(); // saveRecoverySnapshot is fire-and-forget async

// 3. The snapshot must exist, hold the unsaved prose, and carry meta.
const snap = await Store.getRecoverySnapshot();
ok('recovery snapshot landed in IndexedDB', snap !== null);
ok('snapshot holds the UNSAVED prose (not the last saved state)',
  snap?.projects?.p1?.chapters?.[0]?.content === 'precious unsaved prose',
  `got: ${snap?.projects?.p1?.chapters?.[0]?.content}`);
const meta = await getRecoverySnapshotMeta();
ok('snapshot meta records the disk rev it was taken against',
  meta.diskRevAtSnapshot === 1, `got: ${JSON.stringify(meta)}`);

// 4. Boot check at the SAME disk rev — the exact scenario the old rule
//    destroyed. Must be offered back (not stale), not silently deleted.
const diskRev = Store.getActiveDb().rev;
ok('disk rev is still 1 (the failed write never landed)', diskRev === 1);
ok('boot staleness check: snapshot is NOT stale at equal disk rev',
  isSnapshotStale(snap, meta, diskRev) === false);

// 5. A successful retry lands, clears the snapshot (success path), and
//    a snapshot from BEFORE that save would now be correctly stale.
globalThis.localStorage._failNextWrites = 0;
ok('forced retry succeeds', _forceSaveRetryNow() === true && Store.getActiveDb().rev === 2);
await settle();
ok('successful save cleared the snapshot', (await Store.getRecoverySnapshot()) === null);
ok('pre-retry snapshot WOULD be stale against the advanced disk (inverse pin)',
  isSnapshotStale(snap, meta, Store.getActiveDb().rev) === true);

// ── CR-03 — static pin: the fixed XSS site ─────────────────────────────
section('CR-03 — entity image-gallery title escapes entity.name');
const notesViewSrc = fs.readFileSync(new URL('./notesView.js', import.meta.url), 'utf8');
ok('notesView imports escapeHtml from dom-utils',
  /import\s*\{[^}]*escapeHtml[^}]*\}\s*from\s*'\.\/dom-utils\.js'/.test(notesViewSrc));
ok('gallery title interpolates escapeHtml(entity.name)',
  notesViewSrc.includes('`Add images · ${escapeHtml(entity.name)}`'));
// Sink-scoped sweep: a raw ${entity.name} is only dangerous where the
// string reaches an innerHTML sink. Every OTHER entity.name occurrence
// in this file renders through the html`` escaping bridge or
// confirmDialog's html bridge — safe by construction (verified by hand
// against modal.js/dom-utils.js). So pin the dangerous shape only: a
// modal/image-library TITLE property interpolating entity.name raw.
ok('no title: property interpolates entity.name without escapeHtml',
  !/title:\s*`[^`]*\$\{(?!escapeHtml)entity\.name/.test(notesViewSrc));

// ── CR-04 — static pin: overlay renders in metric-parity mode ──────────
section('CR-04 — editor overlay passes keepMarkers: true');
const editorSrc = fs.readFileSync(new URL('./editor.js', import.meta.url), 'utf8');
ok('updateDimOverlay calls renderEditorParagraph with keepMarkers: true',
  /renderEditorParagraph\([^)]*keepMarkers:\s*true/.test(editorSrc));
const editorCss = fs.readFileSync(new URL('../css/editor-view.css', import.meta.url), 'utf8');
ok('overlay CSS defines the transparent .fmt-marker span',
  /\.focus-dim-overlay \.fmt-marker\s*\{[^}]*color:\s*transparent/.test(editorCss));
ok('overlay strong no longer uses real bold (font-weight: 700 removed)',
  !/\.focus-dim-overlay strong\s*\{\s*font-weight:\s*700/.test(editorCss));

// ── CR-05 — static pin: IME guards on all three keydown handlers ───────
section('CR-05 — IME composition guards');
ok('isImeComposing helper exists (isComposing || keyCode 229)',
  /function isImeComposing\(e\)\s*\{\s*return e\.isComposing === true \|\| e\.keyCode === 229;/.test(editorSrc));
const guardCount = (editorSrc.match(/if \(isImeComposing\(e\)\) return/g) || []).length;
ok('all three textarea keydown handlers guard on it', guardCount === 3, `found ${guardCount} guards`);
const popupHandler = editorSrc.slice(editorSrc.indexOf('function handleKeydown(e)'));
const guardIdx = popupHandler.indexOf('if (isImeComposing(e)) return');
const visIdx = popupHandler.indexOf("popup.style.display === 'none'");
ok('popup guard runs BEFORE the visibility check (visible popup must not eat composition keys)',
  guardIdx !== -1 && visIdx !== -1 && guardIdx < visIdx);

// ── summary ────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed${fail === 0 ? ' — all green.' : ''}`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
process.exit(0);
