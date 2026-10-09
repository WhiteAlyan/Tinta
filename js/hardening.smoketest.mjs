// Tinta — hardening smoketest (href scheme guard, manual snapshot ceiling,
// full-backup import blob GC, custom-font backup round-trip).
//
// Pure-logic test of the hardening pass's three changes. None of them
// needed new features — they close ways existing features could hurt:
//
//   1. dom-utils.safeExternalUrl() — the reference drawer's href used to
//      interpolate ref.url straight into <a href="…">. Escaping (what the
//      html`` template does in attribute position) stops a value breaking
//      OUT of the attribute but does nothing about a well-formed
//      `javascript:alert(1)` sitting inside it. The allowlist is the fix;
//      these tests pin it, including the vendor-spelling variants a
//      blocklist would leak.
//
//   2. store.js capManualSnapshots() — manual snapshots were the only
//      unbounded full-content copies in the db (auto-checkpoints have had
//      MAX_AUTO_SNAPSHOTS = 10 for a while). importChapterFromText()
//      mints one manual 'Imported' snapshot per chapter, so repeatedly
//      re-importing a manuscript stacked one full copy per chapter per
//      import against a shared ~5MB quota. Pins: manual ceiling 25,
//      oldest-first eviction, autos and manuals evict from their own
//      pools only, chapter and entity snapshots both covered.
//
//   3. backup.js importFullBackupWithImages() — importing a full backup
//      REPLACES every project in localStorage, but the old workspace's
//      image blobs lived in IndexedDB, which store.js can't reach. They
//      now get swept (ids collected before the swap, stale ones deleted
//      after it). The IndexedDB half only really runs in a browser — in
//      Node the blob store is unavailable, so putBlob/deleteBlob reject
//      and the sweep degrades to a counted no-op. That's still enough to
//      pin the orchestration: ids collected BEFORE the swap, the swap
//      lands, stale-id computation runs against the incoming image set,
//      and a failed validation never reaches the GC at all.
//
//   4. backup.js custom-font round-trip (font-restore patch) — the same
//      orchestration, one layer over: the customFont metadata always
//      traveled inside the db, but the font bytes in assetstore.js's
//      IndexedDB never did, so a restored backup showed "MyFont (custom)"
//      in the picker while the page rendered Literata. Export bundles the
//      bytes only when the metadata says a font is picked (skipping — not
//      failing — when the blob store is unavailable); import mirrors the
//      incoming metadata: bytes put back when present, local blob swept
//      when the incoming db says no font. Node still can't exercise the
//      byte-level half, but every branch decision is assertable: skip-on-
//      export, counted-no-op-on-restore, sweep-call-doesn't-throw, and
//      the fontRestored reporting key on every return shape.
//
// NOT covered here: the real IndexedDB byte-level delete (browser-only),
// and drawer.js's rendering of the non-anchored URL fallback (DOM layer —
// the helper it calls is fully pinned in section 1).
//
// Run with: node hardening.smoketest.mjs

// ── DOM + localStorage shims (module-load / save-system pattern) ────────
class LocalStorageShim {
  constructor() { this.store = new Map(); }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null; }
  setItem(key, value) { this.store.set(key, String(value)); }
  removeItem(key) { this.store.delete(key); }
  clear() { this.store.clear(); }
}
globalThis.localStorage = new LocalStorageShim();

const noop = () => {};
globalThis.window = globalThis;
window.addEventListener = noop;
window.removeEventListener = noop;
window.dispatchEvent = noop;
window.matchMedia = () => ({ matches: false, addEventListener: noop, removeEventListener: noop, media: '' });
window.scrollTo = noop;
window.getComputedStyle = () => ({ getPropertyValue: () => '' });
globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: noop,
  removeEventListener: noop,
  dispatchEvent: noop,
  documentElement: { setAttribute: noop, getAttribute: () => null, style: { setProperty: noop, getPropertyValue: () => '' } },
  body: { appendChild: noop, removeChild: noop, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, style: {} },
  head: { appendChild: noop, removeChild: noop },
  createElement: () => ({
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    style: { setProperty: noop, getPropertyValue: () => '' },
    setAttribute: noop, removeAttribute: noop, appendChild: noop, removeChild: noop,
    addEventListener: noop, removeEventListener: noop, dispatchEvent: noop,
    dataset: {}, content: '', focus: noop, click: noop, remove: noop, select: noop,
  }),
  createDocumentFragment: () => ({ appendChild: noop }),
};

const { safeExternalUrl } = await import('./dom-utils.js');
const Store = await import('./store.js');
const Backup = await import('./backup.js');

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

// ── 1. safeExternalUrl — the href allowlist ─────────────────────────────
section('safeExternalUrl — allowlist');
assertEqual(safeExternalUrl('https://example.com'), 'https://example.com', 'plain https allowed');
assertEqual(safeExternalUrl('http://example.com/page?x=1#frag'), 'http://example.com/page?x=1#frag', 'plain http allowed, query+hash intact');
assertEqual(safeExternalUrl('HTTPS://EXAMPLE.COM/PAGE'), 'HTTPS://EXAMPLE.COM/PAGE', 'uppercase scheme/host still parses as https');
assertEqual(safeExternalUrl('  https://example.com  '), 'https://example.com', 'surrounding whitespace trimmed, trimmed value returned');
assertEqual(safeExternalUrl('https://example.com'), 'https://example.com', 'idempotent on already-safe input');

section('safeExternalUrl — script schemes rejected');
assertEqual(safeExternalUrl('javascript:alert(1)'), null, 'plain javascript: rejected');
assertEqual(safeExternalUrl('JaVaScRiPt:alert(1)'), null, 'case-mangled javascript: rejected (protocol parses lowercase)');
assertEqual(safeExternalUrl('java\tscript:alert(1)'), null, 'tab-spelled javascript: rejected (WHATWG strips tabs before scheme parse, or parse throws — both reject)');
assertEqual(safeExternalUrl('data:text/html;base64,PHNjcmlwdD4='), null, 'data: URI rejected');
assertEqual(safeExternalUrl('vbscript:msgbox(1)'), null, 'vbscript: rejected');
assertEqual(safeExternalUrl('file:///etc/passwd'), null, 'file: rejected');
assertEqual(safeExternalUrl('chrome-extension://abc/x'), null, 'chrome-extension: rejected');
assertEqual(safeExternalUrl('mailto:editor@example.com'), null, 'mailto: rejected too — allowlist is http/https only, the drawer still shows the text');

section('safeExternalUrl — non-absolute and non-string inputs rejected');
assertEqual(safeExternalUrl('example.com/page'), null, 'bare domain (no scheme) rejected');
assertEqual(safeExternalUrl('/relative/path'), null, 'root-relative rejected');
assertEqual(safeExternalUrl('//protocol-relative.example.com'), null, 'protocol-relative rejected');
assertEqual(safeExternalUrl('./x'), null, 'dot-relative rejected');
assertEqual(safeExternalUrl(''), null, 'empty string rejected');
assertEqual(safeExternalUrl('   '), null, 'whitespace-only rejected');
assertEqual(safeExternalUrl(null), null, 'null rejected');
assertEqual(safeExternalUrl(undefined), null, 'undefined rejected');
assertEqual(safeExternalUrl(42), null, 'number rejected');
assertEqual(safeExternalUrl({ href: 'https://x' }), null, 'object rejected (a .tinta import can carry any JSON in ref.url)');
assertEqual(safeExternalUrl(['https://x']), null, 'array rejected');

// ── 2. chapter manual snapshot ceiling ──────────────────────────────────
section('chapter manual snapshots — capped at 25, oldest evicted first');
Store.createProject('Hardening Test Novel');
const chapter = Store.createChapter('Ch 1');
const manualIds = [];
for (let i = 1; i <= 30; i++) {
  const snap = Store.createSnapshot(chapter.id, `Manual ${i}`);
  manualIds.push(snap.id);
}
const afterManual = Store.getChapter(chapter.id).snapshots;
assertEqual(afterManual.length, 25, '30 manual snapshots capped to 25');
assert(!manualIds.slice(0, 5).some((id) => afterManual.some((s) => s.id === id)), 'oldest five manual snapshots evicted');
assert(afterManual.some((s) => s.id === manualIds[5]), 'sixth manual snapshot survives the cut');
assert(afterManual.some((s) => s.id === manualIds[29]), 'newest manual snapshot survives');
assertEqual(
  afterManual.map((s) => s.label).join('|'),
  Array.from({ length: 25 }, (_, i) => `Manual ${i + 6}`).join('|'),
  'survivors are exactly Manual 6..Manual 30, insertion order intact'
);
assertEqual(afterManual.filter((s) => s.auto).length, 0, 'nothing mis-flagged as auto by the manual cap');

// ── 3. auto-checkpoint cap and manual cap share one array, not one pool ─
section('auto checkpoints — own ceiling, manuals untouched by auto eviction');
const autoIds = [];
for (let i = 1; i <= 15; i++) {
  const snap = Store.createSnapshot(chapter.id, `Auto-checkpoint ${i}`, true);
  autoIds.push(snap.id);
}
const afterAuto = Store.getChapter(chapter.id).snapshots;
assertEqual(afterAuto.length, 35, '25 manuals + 10 kept autos = 35 total');
assertEqual(afterAuto.filter((s) => s.auto).length, 10, 'auto ceiling still 10 with manuals present');
assertEqual(afterAuto.filter((s) => !s.auto).length, 25, 'manual count untouched by auto eviction');
assert(!autoIds.slice(0, 5).some((id) => afterAuto.some((s) => s.id === id)), 'oldest five autos evicted');
assert(afterAuto.some((s) => s.id === autoIds[14]), 'newest auto survives');
assertEqual(
  afterAuto.filter((s) => !s.auto).map((s) => s.id).join('|'),
  manualIds.slice(5).join('|'),
  'manual survivor list byte-identical to before autos started'
);

// ── 4. manual eviction on top of autos doesn't eat autos ────────────────
section('manuals over ceiling again — autos still untouched');
for (let i = 31; i <= 35; i++) Store.createSnapshot(chapter.id, `Manual ${i}`);
const afterSecondManual = Store.getChapter(chapter.id).snapshots;
assertEqual(afterSecondManual.length, 35, '30 manuals + 10 autos capped back to 25 + 10');
assertEqual(afterSecondManual.filter((s) => s.auto).length, 10, 'all ten autos survived the manual eviction');
assertEqual(afterSecondManual.filter((s) => !s.auto).length, 25, 'manuals back at the ceiling');
assert(!afterSecondManual.some((s) => s.id === manualIds[9]), 'oldest surviving manual from before (Manual 10) now evicted');
assert(afterSecondManual.some((s) => s.id === manualIds[10]), 'Manual 11 survives');
assert(afterSecondManual.some((s) => s.label === 'Manual 35'), 'newest manual survives');
assertEqual(afterSecondManual.filter((s) => s.auto).map((s) => s.id).sort().join('|'), autoIds.slice(5).sort().join('|'), 'surviving autos are exactly the ten newest');

// ── 5. entity snapshots — same ceiling, same pools ──────────────────────
section('entity snapshots — same ceiling, chapter logic shared');
const entity = Store.createEntity({ name: 'Alice' });
for (let i = 1; i <= 30; i++) Store.createEntitySnapshot(entity.id, `Entity manual ${i}`);
for (let i = 1; i <= 15; i++) Store.createEntitySnapshot(entity.id, `Entity auto ${i}`, true);
const entitySnaps = Store.getEntity(entity.id).snapshots;
assertEqual(entitySnaps.length, 35, 'entity snapshots capped the same way (25 manual + 10 auto)');
assertEqual(entitySnaps.filter((s) => s.auto).length, 10, 'entity auto ceiling');
assertEqual(entitySnaps.filter((s) => !s.auto).length, 25, 'entity manual ceiling');

// ── 6. full-backup import sweeps replaced workspaces' stale image ids ───
section('full-backup import — stale blob GC orchestration (IDB degraded in Node)');
Store.createImageMeta({ id: 'img_old', caption: 'pre-import image' });
const projectBefore = Store.getActiveProject();
assert(Store.getProjectImageIds(projectBefore).includes('img_old'), 'pre-import image id present in the current catalog');

// Synthesize a bundled backup from the current db. A fresh store seeds a
// default project, so there are two projects here — strip img_old from
// EVERY catalog in the snapshot and rename the active one, so the
// incoming backup provably does not reference the stale id anywhere.
const dbForBackup = JSON.parse(Store.exportFullBackup());
const activeIdBefore = dbForBackup.activeProjectId;
for (const p of Object.values(dbForBackup.projects)) {
  if (p.images) delete p.images.img_old;
}
dbForBackup.projects[activeIdBefore].title = 'Restored Workspace';
const countBeforeImport = Store.listProjects().length;
const bundledJson = JSON.stringify({
  tintaBackupVersion: 2,
  db: dbForBackup,
  images: { img_new: { base64: 'aGFyZGVuaW5n', mimeType: 'image/png' } },
});

const result = await Backup.importFullBackupWithImages(bundledJson);
assertEqual(result.imageCount, 1, 'incoming backup reports one image');
assertEqual(result.restored, 0, 'Node has no IndexedDB — putBlob rejects and counts as failed (browser restores normally)');
assertEqual(result.failed, 1, 'failed count reflects the degraded blob store, not a crash');
assertEqual(Store.getActiveProject().title, 'Restored Workspace', 'db swap landed — imported db is live, active pointer intact');
assertEqual(Store.listProjects().length, countBeforeImport, 'import replaced rather than appended');
assert(
  Store.listProjects().every((p) => !Store.getProjectImageIds(p).includes('img_old')),
  'no imported catalog lists img_old — its blob is now GC-eligible'
);

// ── 7. failed validation never reaches the GC ───────────────────────────
section('full-backup import — validation failure leaves the GC inert');
const titleBefore = Store.getActiveProject().title;
let threw = false;
try { await Backup.importFullBackupWithImages('{"hello": 1}'); }
catch { threw = true; }
assert(threw, 'non-backup JSON throws out of the import (caller shows the error)');
assertEqual(Store.getActiveProject().title, titleBefore, 'db unchanged after the failed import');
assertEqual(Store.listProjects().length, countBeforeImport, 'project count unchanged after the failed import');

// ── 8. custom-font backup round-trip (font-restore patch) ──────────────
section('full-backup custom font — bundle on export, mirror on import (IDB degraded in Node)');

// Export side, font picked: in Node the blob read rejects, so the bytes
// are skipped — but the export must not fail and the metadata must still
// ride inside the db (a restored profile at least remembers WHICH file
// to re-upload, and the Settings missing-blob note says exactly that).
Store.setCustomFont({ family: 'Test Font ab12', fileName: 'TestFont.ttf' });
const fontExport = JSON.parse(await Backup.exportFullBackupWithImages());
assertEqual(fontExport.customFont, null, 'blob unavailable → export skips the font bytes rather than failing');
assertEqual(fontExport.db.customFont.fileName, 'TestFont.ttf', 'font metadata still travels inside the exported db');

// Export side, no font picked: no blob read attempted, field is null.
Store.setCustomFont({ family: '', fileName: '' });
const plainExport = JSON.parse(await Backup.exportFullBackupWithImages());
assertEqual(plainExport.customFont, null, 'no font picked → null customFont field, no crash');

// Import side, font in the bundle: metadata lands with the db swap, the
// putBlob rejects (Node), and the import still resolves — fontRestored:
// false is the honest report, not a crash.
const fontDb = JSON.parse(Store.exportFullBackup());
fontDb.customFont = { family: 'Restored Font zz99', fileName: 'Restored.ttf' };
const activeTitleBeforeFont = fontDb.projects[fontDb.activeProjectId].title;
fontDb.projects[fontDb.activeProjectId].title = 'Font Restored Workspace';
const fontImport = await Backup.importFullBackupWithImages(JSON.stringify({
  tintaBackupVersion: 2,
  db: fontDb,
  images: {},
  customFont: { mimeType: 'font/ttf', base64: 'aGVsbG8=' },
}));
assertEqual(Store.getActiveProject().title, 'Font Restored Workspace', 'db swap landed before the font mirror ran');
assertEqual(Store.getCustomFont().fileName, 'Restored.ttf', 'incoming font metadata migrated with the db');
assertEqual(fontImport.fontRestored, false, 'putBlob rejects in Node → fontRestored false, counted no-op not a crash');
assert('fontRestored' in fontImport, 'return shape always reports the font outcome');

// Import side, incoming db says NO font: the local blob sweep fires (and
// rejects harmlessly in Node) so "replaces everything" stays true for the
// asset store too — no invisible font surviving a restore.
const noFontDb = JSON.parse(Store.exportFullBackup());
noFontDb.customFont = { family: '', fileName: '' };
const noFontImport = await Backup.importFullBackupWithImages(JSON.stringify({
  tintaBackupVersion: 2,
  db: noFontDb,
  images: {},
}));
assertEqual(Store.getCustomFont().fileName, '', 'incoming no-font metadata migrated — picker stops claiming a font');
assertEqual(noFontImport.fontRestored, false, 'no incoming font → nothing restored, no crash');

// Legacy pre-bundling backup (raw db, no wrapper, no customFont field):
// the font mirror degrades to the same sweep-and-move-on path.
const legacyImport = await Backup.importFullBackupWithImages(JSON.stringify(noFontDb));
assertEqual(legacyImport.fontRestored, false, 'legacy backup shape → font outcome reported as false, import unaffected');
assertEqual(Store.getActiveProject().title, 'Font Restored Workspace', 'legacy db swap landed (title carried from noFontDb, proving the raw shape still replaces)');

// ── inherited-property lookups in project dictionaries ─────────────────
// project.entities / relationships / ruleSystems / systemNodes /
// timelineEvents / maps / references / images are plain objects, so every
// key on Object.prototype answered a lookup as if it were a stored record:
// getEntity('constructor') returned the Object constructor FUNCTION and
// passed the getter's truthiness check. Ordinary uid-based ids can't
// collide, but .tinta files are external input and can carry any key.
section('project dictionaries — inherited keys are not records');
{
  Store.createProject('Prototype Guard');
  const real = Store.createEntity({ name: 'A Genuine Character', type: 'character' });

  const inherited = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', '__defineGetter__'];
  inherited.forEach((key) => {
    assertEqual(Store.getEntity(key), null, `getEntity('${key}') is null, not an inherited Object.prototype member`);
    assertEqual(Store.getRelationship(key), null, `getRelationship('${key}') is null`);
    assertEqual(Store.getRuleSystem(key), null, `getRuleSystem('${key}') is null`);
    assertEqual(Store.getSystemNode(key), null, `getSystemNode('${key}') is null`);
    assertEqual(Store.getTimelineEvent(key), null, `getTimelineEvent('${key}') is null`);
    assertEqual(Store.getMap(key), null, `getMap('${key}') is null`);
    assertEqual(Store.getReference(key), null, `getReference('${key}') is null`);
    assertEqual(Store.getImage(key), undefined, `getImage('${key}') is undefined`);
  });

  // The guard must not break ordinary lookups.
  assertEqual(Store.getEntity(real.id)?.name, 'A Genuine Character', 'a real entity still resolves normally');
  assertEqual(Store.getEntity('nope_does_not_exist'), null, 'an unknown id is still null');
}

// ── summary ─────────────────────────────────────────────────────────────
console.log(`\nhardening.smoketest: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('FAILURES:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
